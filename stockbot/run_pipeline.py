"""End-to-end pipeline for StockBot (enhanced).

- Rich indicators + multi-timeframe features (see feature_engineering)
- Flexible labeling: threshold / quantile / regression
- Models: LSTM / CNN1D / TCN / XGBoost (optional)
- Focal loss option and class weights
- Walk-forward CV or single chrono split
- Saves scaler stats + metrics
"""

from __future__ import annotations

import argparse
import os
import sys
import json
import math
import random
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Tuple, Dict, Any, List, Optional

import numpy as np
import pandas as pd

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset, WeightedRandomSampler

from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score, roc_auc_score

# Optional XGBoost
try:
    from xgboost import XGBClassifier  # type: ignore
    _HAS_XGB = True
except Exception:
    _HAS_XGB = False

from stockbot.ingestion.feature_engineering import (
    prepare_dataset,
    create_sliding_windows,
)
from stockbot.training.models import build_model
from stockbot.training.losses import FocalLoss


# ---------------------------
# Reproducibility
# ---------------------------

def set_seed(seed: int = 42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


# ---------------------------
# Config dataclass
# ---------------------------

@dataclass
class TrainConfig:
    ticker: str
    start_date: str
    end_date: str
    window_size: int = 10

    # Labeling
    label_threshold: float = 0.0
    label_horizon: int = 1
    label_mode: str = "threshold"        # threshold | quantile | regression
    pos_quantile: float = 0.7
    neg_quantile: float = 0.3

    # Split
    val_size_ratio: float = 0.2
    walk_forward_folds: int = 0

    # Supervised training
    model: str = "lstm"                  # lstm | cnn1d | tcn | xgb
    epochs: int = 30
    batch_size: int = 128
    hidden_size: int = 96
    dropout: float = 0.2
    lr: float = 1e-3
    early_stopping_patience: int = 8
    class_weighted: bool = True
    loss: str = "ce"                     # ce | focal
    focal_gamma: float = 2.0

    # IO
    output_dir: str = "stockbot/models"
    save_prefix: str = ""
    device: str = "cuda" if torch.cuda.is_available() else "cpu"


# ---------------------------
# Utility: chronological split / walk-forward
# ---------------------------

def chrono_split(X: np.ndarray, y: np.ndarray, val_size_ratio: float) -> Tuple:
    n = len(X)
    split = int(n * (1 - val_size_ratio))
    return X[:split], X[split:], y[:split], y[split:]

def walk_forward_indices(n: int, folds: int, min_train_ratio: float = 0.5) -> List[Tuple[slice, slice]]:
    assert 0 < folds < n, "folds must be in (0, n)"
    min_train = int(n * min_train_ratio)
    fold_len = max(1, (n - min_train) // folds)
    out = []
    for i in range(1, folds + 1):
        end = min_train + i * fold_len
        tr = slice(0, end)
        va = slice(end, min(end + fold_len, n))
        out.append((tr, va))
    return out


# ---------------------------
# Scaling helpers (save stats)
# ---------------------------

def compute_scaler_stats(X_train: np.ndarray) -> Dict[str, Any]:
    F = X_train.shape[2]
    flat = X_train.reshape(-1, F)
    mean = flat.mean(axis=0)
    std = flat.std(axis=0)
    std[std == 0] = 1.0
    return {"mean": mean.tolist(), "std": std.tolist()}

def apply_scaler(X: np.ndarray, stats: Dict[str, Any]) -> np.ndarray:
    mean = np.asarray(stats["mean"], dtype=np.float64)
    std = np.asarray(stats["std"], dtype=np.float64)
    F = X.shape[2]
    flat = X.reshape(-1, F)
    flat = (flat - mean) / std
    flat = np.nan_to_num(flat, nan=0.0, posinf=1e6, neginf=-1e6)
    return flat.reshape(X.shape)


# ---------------------------
# Torch Train/Eval
# ---------------------------

def train_one_split_torch(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    cfg: TrainConfig,
    save_paths: Dict[str, str],
) -> Dict[str, float]:
    device = torch.device(cfg.device)

    # Compute scaler on TRAIN only; persist stats
    stats = compute_scaler_stats(X_train)
    os.makedirs(os.path.dirname(save_paths["scaler_json"]), exist_ok=True)
    with open(save_paths["scaler_json"], "w") as f:
        json.dump(stats, f)

    X_train = apply_scaler(X_train, stats)
    X_val = apply_scaler(X_val, stats)

    # Clean & tensorize
    X_train = np.nan_to_num(X_train, nan=0.0, posinf=1e6, neginf=-1e6)
    X_val   = np.nan_to_num(X_val,   nan=0.0, posinf=1e6, neginf=-1e6)
    y_train = np.nan_to_num(y_train, nan=0).astype(int)
    y_val   = np.nan_to_num(y_val,   nan=0).astype(int)

    Xtr = torch.tensor(X_train, dtype=torch.float32, device=device)
    ytr = torch.tensor(y_train, dtype=torch.long, device=device)
    Xva = torch.tensor(X_val,   dtype=torch.float32, device=device)
    yva = torch.tensor(y_val,   dtype=torch.long, device=device)

    # Class weights OR sampler
    if cfg.class_weighted:
        classes, counts = np.unique(y_train, return_counts=True)
        total = counts.sum()
        weights = np.zeros(classes.max() + 1, dtype=np.float32)
        for c, cnt in zip(classes, counts):
            weights[c] = total / (len(classes) * cnt)
        class_weights = torch.tensor(weights, device=device)
        if cfg.loss == "ce":
            loss_fn = nn.CrossEntropyLoss(weight=class_weights)
        else:
            loss_fn = FocalLoss(gamma=cfg.focal_gamma, alpha=class_weights)
        sampler = WeightedRandomSampler(weights=class_weights[ytr].detach().cpu(), num_samples=len(ytr), replacement=True)
        train_loader = DataLoader(TensorDataset(Xtr, ytr), batch_size=cfg.batch_size, sampler=sampler)
    else:
        loss_fn = nn.CrossEntropyLoss() if cfg.loss == "ce" else FocalLoss(gamma=cfg.focal_gamma)
        train_loader = DataLoader(TensorDataset(Xtr, ytr), batch_size=cfg.batch_size, shuffle=True)

    val_loader = DataLoader(TensorDataset(Xva, yva), batch_size=cfg.batch_size)

    # Build model
    model = build_model(cfg.model, num_features=X_train.shape[2], seq_len=X_train.shape[1],
                        hidden_size=cfg.hidden_size, dropout=cfg.dropout)
    if model is None:
        raise ValueError("Torch model builder returned None. Did you set model='xgb'?")
    model = model.to(device)

    optimizer = torch.optim.Adam(model.parameters(), lr=cfg.lr)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=3)

    best_val_bal_acc = -math.inf
    best_state = None
    patience = cfg.early_stopping_patience
    no_improve = 0

    for epoch in range(1, cfg.epochs + 1):
        model.train()
        total_loss = 0.0
        for xb, yb in train_loader:
            optimizer.zero_grad(set_to_none=True)
            logits = model(xb)
            loss = loss_fn(logits, yb)
            if torch.isnan(loss) or torch.isinf(loss):
                continue
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item() * xb.size(0)
        avg_loss = total_loss / max(1, len(train_loader.dataset))

        # Validate
        model.eval()
        preds, targets = [], []
        with torch.no_grad():
            for xb, yb in val_loader:
                logits = model(xb)
                preds.append(torch.argmax(logits, dim=1).cpu().numpy())
                targets.append(yb.cpu().numpy())
        preds = np.concatenate(preds)
        targets = np.concatenate(targets)

        acc = accuracy_score(targets, preds)
        bal_acc = balanced_accuracy_score(targets, preds)
        f1 = f1_score(targets, preds, zero_division=0)
        print(f"Epoch {epoch}/{cfg.epochs} - loss {avg_loss:.4f} | acc {acc:.4f} | bal-acc {bal_acc:.4f} | f1 {f1:.4f}")

        scheduler.step(bal_acc)

        if bal_acc > best_val_bal_acc:
            best_val_bal_acc = bal_acc
            best_state = {k: v.detach().cpu() for k, v in model.state_dict().items()}
            no_improve = 0
        else:
            no_improve += 1
            if no_improve >= patience:
                print(f"Early stopping at epoch {epoch} (no improvement for {patience} epochs).")
                break

    # Save best model + metrics
    os.makedirs(os.path.dirname(save_paths["model"]), exist_ok=True)
    torch.save(best_state, save_paths["model"])
    with open(save_paths["metrics_json"], "w") as f:
        json.dump({"best_val_bal_acc": float(best_val_bal_acc)}, f)
    print(f"Saved model -> {save_paths['model']} | scaler -> {save_paths['scaler_json']}")
    return {"val_bal_acc": float(best_val_bal_acc)}


def train_one_split_xgb(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    cfg: TrainConfig,
    save_paths: Dict[str, str],
) -> Dict[str, float]:
    if not _HAS_XGB:
        raise ImportError("xgboost not installed. Install with `pip install xgboost` or choose a torch model.")

    # Flatten sequences for XGBoost [N, T*F]
    N_tr, T, F = X_train.shape
    N_va = X_val.shape[0]
    Xtr = X_train.reshape(N_tr, T * F)
    Xva = X_val.reshape(N_va, T * F)

    # Impute/scale: tree models often tolerate raw scales; keep simple
    Xtr = np.nan_to_num(Xtr, nan=0.0, posinf=1e6, neginf=-1e6)
    Xva = np.nan_to_num(Xva, nan=0.0, posinf=1e6, neginf=-1e6)

    # Weighted classes
    classes, counts = np.unique(y_train, return_counts=True)
    scale_pos_weight = None
    if cfg.class_weighted and len(classes) == 2:
        # heuristic: n_neg / n_pos
        n_pos = counts[classes.tolist().index(1)] if 1 in classes else 1
        n_neg = counts[classes.tolist().index(0)] if 0 in classes else 1
        scale_pos_weight = max(1.0, n_neg / max(1, n_pos))

    model = XGBClassifier(
        n_estimators=500,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_lambda=1.0,
        objective="binary:logistic",
        eval_metric="logloss",
        n_jobs=-1,
        scale_pos_weight=scale_pos_weight
    )
    model.fit(Xtr, y_train)

    preds = (model.predict_proba(Xva)[:, 1] > 0.5).astype(int)
    acc = accuracy_score(y_val, preds)
    bal_acc = balanced_accuracy_score(y_val, preds)
    f1 = f1_score(y_val, preds, zero_division=0)
    print(f"[XGB] acc {acc:.4f} | bal-acc {bal_acc:.4f} | f1 {f1:.4f}")

    os.makedirs(os.path.dirname(save_paths["model"]), exist_ok=True)
    model.save_model(save_paths["model"])
    with open(save_paths["metrics_json"], "w") as f:
        json.dump({"val_bal_acc": float(bal_acc)}, f)
    # no scaler for tree model; write stub scaler
    with open(save_paths["scaler_json"], "w") as f:
        json.dump({"note": "xgb model uses no scaler"}, f)
    print(f"Saved XGB model -> {save_paths['model']}")
    return {"val_bal_acc": float(bal_acc)}


# ---------------------------
# Dataset preparation wrapper
# ---------------------------

def build_dataset(
    ticker: str,
    start_date: str,
    end_date: str,
    window_size: int,
    label_threshold: float,
    label_horizon: int,
    label_mode: str,
    pos_quantile: float,
    neg_quantile: float,
    data_dir: str,
) -> Tuple[str, pd.DataFrame, List[str], str]:
    os.makedirs(data_dir, exist_ok=True)
    csv_path = prepare_dataset(
        ticker,
        start_date=start_date,
        end_date=end_date,
        output_dir=data_dir,
        window_size=window_size,
        threshold=label_threshold,
        horizon=label_horizon,
        label_mode=label_mode,
        pos_quantile=pos_quantile,
        neg_quantile=neg_quantile,
        auto_adjust=False,
    )
    df = pd.read_csv(csv_path, index_col=0)

    # Determine label column name
    label_col = "future_return" if label_mode == "regression" else "label"

    # Debug: distribution
    if label_mode != "regression":
        print("Label distribution:")
        print(df[label_col].value_counts(dropna=False))

    # Feature columns exclude raw OHLCV, label(s)
    exclude = {"Open", "High", "Low", "Close", "Adj Close", "Volume", "label", "future_return"}
    feature_cols = [c for c in df.columns if c not in exclude]
    return csv_path, df, feature_cols, label_col


# ---------------------------
# CLI and Orchestration
# ---------------------------

def infer_default_dates(years_back: int = 2) -> Tuple[str, str]:
    end = date.today()
    start = end - timedelta(days=365 * years_back)
    return (start.isoformat(), end.isoformat())

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Run the enhanced StockBot training pipeline")
    p.add_argument("--ticker")
    p.add_argument("--start-date")
    p.add_argument("--end-date")
    p.add_argument("--window-size", type=int, default=10)

    # Labeling
    p.add_argument("--label-threshold", type=float, default=0.0)
    p.add_argument("--label-horizon", type=int, default=1)
    p.add_argument("--label-mode", choices=["threshold", "quantile", "regression"], default="threshold")
    p.add_argument("--pos-quantile", type=float, default=0.7)
    p.add_argument("--neg-quantile", type=float, default=0.3)

    # Split
    p.add_argument("--val-size-ratio", type=float, default=0.2)
    p.add_argument("--walk-forward-folds", type=int, default=0)

    # Model & training
    p.add_argument("--model", choices=["lstm", "cnn1d", "tcn", "xgb"], default="lstm")
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch-size", type=int, default=128)
    p.add_argument("--hidden-size", type=int, default=96)
    p.add_argument("--dropout", type=float, default=0.2)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--early-stopping-patience", type=int, default=8)
    p.add_argument("--no-class-weights", action="store_true", help="Disable class-weighted training")
    p.add_argument("--loss", choices=["ce", "focal"], default="ce")
    p.add_argument("--focal-gamma", type=float, default=2.0)

    # IO
    p.add_argument("--output-dir", default="stockbot/models")
    p.add_argument("--save-prefix", default="")
    return p

def main():
    set_seed(42)
    parser = build_parser()
    no_args = (len(sys.argv) == 1)
    args = parser.parse_args([] if no_args else None)

    # Defaults for zero-arg run
    if no_args:
        args.ticker = args.ticker or "AAPL"
        s, e = infer_default_dates(2)
        args.start_date = s
        args.end_date = e
        print(
            f"[defaults] ticker={args.ticker} start={args.start_date} end={args.end_date} "
            f"win={args.window_size} horizon={args.label_horizon} thr={args.label_threshold}"
        )
    else:
        if not args.ticker or not args.start_date or not args.end_date:
            parser.error("--ticker, --start-date, and --end-date are required when passing arguments")

    cfg = TrainConfig(
        ticker=args.ticker,
        start_date=args.start_date,
        end_date=args.end_date,
        window_size=args.window_size,
        label_threshold=args.label_threshold,
        label_horizon=args.label_horizon,
        label_mode=args.label_mode,
        pos_quantile=args.pos_quantile,
        neg_quantile=args.neg_quantile,
        val_size_ratio=args.val_size_ratio,
        walk_forward_folds=args.walk_forward_folds,
        model=args.model,
        epochs=args.epochs,
        batch_size=args.batch_size,
        hidden_size=args.hidden_size,
        dropout=args.dropout,
        lr=args.lr,
        early_stopping_patience=args.early_stopping_patience,
        class_weighted=(not args.no_class_weights),
        loss=args.loss,
        focal_gamma=args.focal_gamma,
        output_dir=args.output_dir,
        save_prefix=args.save_prefix.strip(),
    )

    # 1) Build dataset
    data_dir = os.path.join("stockbot", "data")
    csv_path, df, feature_cols, label_col = build_dataset(
        cfg.ticker, cfg.start_date, cfg.end_date, cfg.window_size,
        cfg.label_threshold, cfg.label_horizon, cfg.label_mode,
        cfg.pos_quantile, cfg.neg_quantile, data_dir
    )
    print(f"Dataset created at {csv_path}")

    # 2) Windows
    df = df.dropna(subset=feature_cols + [label_col]).reset_index(drop=True)
    X, y = create_sliding_windows(df, feature_columns=feature_cols, window_size=cfg.window_size, label_col=label_col)

    # If regression label_mode is chosen, switch to classification by thresholding return>0 (simple baseline)
    if cfg.label_mode == "regression":
        # y is float future_return; turn into sign classification for now
        y = (y > 0.0).astype(int)

    # 3) Chronological split or walk-forward
    os.makedirs(cfg.output_dir, exist_ok=True)
    prefix = (cfg.save_prefix + "_") if cfg.save_prefix else ""
    base = f"{prefix}{cfg.ticker}_w{cfg.window_size}_h{cfg.label_horizon}_thr{cfg.label_threshold}_{cfg.label_mode}_{cfg.model}"

    def run_one(train_idx: slice, val_idx: slice, suffix: str):
        X_tr, X_va = X[train_idx], X[val_idx]
        y_tr, y_va = y[train_idx], y[val_idx]
        save_paths = {
            "model":       os.path.join(cfg.output_dir, f"{base}{suffix}.pt" if cfg.model != "xgb" else f"{base}{suffix}.json"),
            "scaler_json": os.path.join(cfg.output_dir, f"{base}{suffix}_scaler.json"),
            "metrics_json":os.path.join(cfg.output_dir, f"{base}{suffix}_metrics.json"),
        }
        if cfg.model == "xgb":
            return train_one_split_xgb(X_tr, y_tr, X_va, y_va, cfg, save_paths)
        else:
            return train_one_split_torch(X_tr, y_tr, X_va, y_va, cfg, save_paths)

    if cfg.walk_forward_folds > 0:
        indices = walk_forward_indices(len(X), cfg.walk_forward_folds)
        metrics = []
        for i, (tr, va) in enumerate(indices, 1):
            print(f"\n== Walk-Forward Fold {i}/{cfg.walk_forward_folds} ==")
            fold_metrics = run_one(tr, va, suffix=f"_fold{i}")
            metrics.append(fold_metrics)
        print("\nWalk-forward summary:", metrics)
    else:
        tr, va, ytr, yva = chrono_split(X, y, cfg.val_size_ratio)
        _ = run_one(slice(0, len(tr)), slice(len(tr), len(tr) + len(va)), suffix="")

if __name__ == "__main__":
    main()
