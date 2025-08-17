"""End-to-end pipeline script for StockBot with sensible no-arg defaults."""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date, timedelta

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

try:
    from stable_baselines3 import PPO, DQN  # optional
except ImportError:
    PPO = None
    DQN = None

from stockbot.ingestion.feature_engineering import (
    prepare_dataset,
    create_sliding_windows,
)
from stockbot.training.train_supervised import LSTMClassifier
from stockbot.rl.trading_env import TradingEnv


def train_supervised_model(
    csv_path: str,
    window_size: int,
    epochs: int,
    batch_size: int,
    hidden_size: int,
    model_out: str,
) -> None:
    df = pd.read_csv(csv_path, index_col=0)

    # 1) Pick feature columns
    feature_cols = [
        c for c in df.columns
        if c not in ["Open", "High", "Low", "Close", "Adj Close", "Volume", "label"]
    ]

    # 2) Drop rows that have NaNs in features/label (indicator warm-ups etc.)
    df = df.dropna(subset=feature_cols + ["label"]).reset_index(drop=True)

    # 3) Build sliding windows
    X, y = create_sliding_windows(df, feature_columns=feature_cols, window_size=window_size)

    # 4) Remove any windows that contain NaNs/inf (belt-and-suspenders)
    mask = np.isfinite(X).all(axis=(1, 2)) & np.isfinite(y)
    X, y = X[mask], y[mask]

    # 5) Train/val split
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # 6) Standardize features using TRAIN stats only (per-feature across time)
    # reshape: (N, T, F) -> (N*T, F) for mean/std
    T, F = X_train.shape[1], X_train.shape[2]
    xf = X_train.reshape(-1, F)
    mean = xf.mean(axis=0)
    std = xf.std(axis=0)
    std[std == 0] = 1.0

    def normalize(arr: np.ndarray) -> np.ndarray:
        arr2 = arr.reshape(-1, F)
        arr2 = (arr2 - mean) / std
        arr2 = np.nan_to_num(arr2, nan=0.0, posinf=1e6, neginf=-1e6)
        return arr2.reshape(-1, T, F)

    X_train = normalize(X_train)
    X_val = normalize(X_val)

    # 7) Final NaN/inf guard
    X_train = np.nan_to_num(X_train, nan=0.0, posinf=1e6, neginf=-1e6)
    X_val   = np.nan_to_num(X_val,   nan=0.0, posinf=1e6, neginf=-1e6)
    y_train = np.nan_to_num(y_train, nan=0).astype(int)
    y_val   = np.nan_to_num(y_val,   nan=0).astype(int)

    # 8) Torch tensors
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    X_train_t = torch.tensor(X_train, dtype=torch.float32).to(device)
    y_train_t = torch.tensor(y_train, dtype=torch.long).to(device)
    X_val_t   = torch.tensor(X_val,   dtype=torch.float32).to(device)
    y_val_t   = torch.tensor(y_val,   dtype=torch.long).to(device)

    train_loader = DataLoader(TensorDataset(X_train_t, y_train_t), batch_size=batch_size, shuffle=True)
    val_loader   = DataLoader(TensorDataset(X_val_t,   y_val_t),   batch_size=batch_size)

    # 9) Model / opt
    model = LSTMClassifier(num_features=X_train.shape[2], hidden_size=hidden_size).to(device)
    loss_fn = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

    # 10) Train with gradient clipping
    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0.0
        for bx, by in train_loader:
            optimizer.zero_grad(set_to_none=True)
            logits = model(bx)
            loss = loss_fn(logits, by)

            if torch.isnan(loss) or torch.isinf(loss):
                # Skip bad batch (shouldn't happen with the sanitizers above)
                continue

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            total_loss += loss.item() * bx.size(0)

        avg_loss = total_loss / max(1, len(train_loader.dataset))

        # Validation
        model.eval()
        preds, targets = [], []
        with torch.no_grad():
            for bx, by in val_loader:
                logits = model(bx)
                preds.append(torch.argmax(logits, dim=1).cpu().numpy())
                targets.append(by.cpu().numpy())
        acc = accuracy_score(np.concatenate(targets), np.concatenate(preds))
        print(f"Epoch {epoch}/{epochs} - train loss: {avg_loss:.4f}, val acc: {acc:.4f}")

    os.makedirs(os.path.dirname(model_out), exist_ok=True)
    torch.save(model.state_dict(), model_out)
    print(f"Saved supervised model to {model_out}")



def infer_default_dates(years_back: int = 2) -> tuple[str, str]:
    end = date.today()
    start = end - timedelta(days=365 * years_back)
    return (start.isoformat(), end.isoformat())


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Run the StockBot training pipeline")
    p.add_argument("--ticker", help="Ticker symbol (e.g., AAPL)")
    p.add_argument("--start-date", help="Start date YYYY-MM-DD")
    p.add_argument("--end-date", help="End date YYYY-MM-DD")
    p.add_argument("--window-size", type=int, default=10, help="Lookback window for features")
    p.add_argument("--threshold", type=float, default=0.0, help="Label threshold")

    # Supervised training
    p.add_argument("--train-supervised", action="store_true", help="Train supervised LSTM classifier")
    p.add_argument("--epochs", type=int, default=10, help="Supervised training epochs")
    p.add_argument("--batch-size", type=int, default=64, help="Supervised training batch size")
    p.add_argument("--hidden-size", type=int, default=64, help="LSTM hidden size")

    # RL training
    p.add_argument("--train-rl", action="store_true", help="Train RL agent (PPO/DQN)")
    p.add_argument("--rl-algo", choices=["PPO", "DQN"], default="PPO", help="RL algorithm")
    p.add_argument("--rl-timesteps", type=int, default=10000, help="RL training timesteps")

    p.add_argument("--output-dir", default="stockbot/models", help="Directory to save trained models")
    return p


def main():
    parser = build_parser()
    # If no CLI args given, use easy defaults
    no_args = (len(sys.argv) == 1)
    args = parser.parse_args([] if no_args else None)

    if no_args:
        # Sensible defaults for zero-arg run
        args.ticker = args.ticker or "AAPL"
        s, e = infer_default_dates(2)
        args.start_date = s
        args.end_date = e
        # Turn on supervised by default; keep RL off by default
        args.train_supervised = True
        args.train_rl = False
        print(
            f"[defaults] ticker={args.ticker} start={args.start_date} end={args.end_date} "
            f"win={args.window_size} train_supervised={args.train_supervised} epochs={args.epochs} "
            f"train_rl={args.train_rl}"
        )
    else:
        # argparse converts dashes to underscores in attribute names
        if not args.ticker or not args.start_date or not args.end_date:
            parser.error("--ticker, --start-date, and --end-date are required when passing arguments")

    data_dir = os.path.join("stockbot", "data")
    os.makedirs(data_dir, exist_ok=True)

    dataset_path = prepare_dataset(
        args.ticker,
        start_date=args.start_date,
        end_date=args.end_date,
        output_dir=data_dir,
        window_size=args.window_size,
        threshold=args.threshold,
    )
    print(f"Dataset created at {dataset_path}")

    if args.train_supervised:
        sup_out = os.path.join(args.output_dir, f"{args.ticker}_supervised.pt")
        train_supervised_model(
            csv_path=dataset_path,
            window_size=args.window_size,
            epochs=args.epochs,
            batch_size=args.batch_size,
            hidden_size=args.hidden_size,
            model_out=sup_out,
        )

    if args.train_rl:
        rl_out = os.path.join(args.output_dir, f"{args.ticker}_rl.zip")
        train_rl_agent(
            csv_path=dataset_path,
            window_size=args.window_size,
            algo=args.rl_algo,
            timesteps=args.rl_timesteps,
            model_out=rl_out,
        )


if __name__ == "__main__":
    main()
