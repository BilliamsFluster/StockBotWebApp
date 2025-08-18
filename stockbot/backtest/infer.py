# stockbot/eval/infer.py
from __future__ import annotations
import json, os
from typing import List, Tuple
import numpy as np
import pandas as pd
import torch
import torch.nn as nn

from stockbot.ingestion.feature_engineering import create_sliding_windows
from stockbot.training.models import build_model

def _load_scaler(path: str):
    with open(path, "r") as f:
        stats = json.load(f)
    if "mean" in stats and "std" in stats:
        mean = np.asarray(stats["mean"], dtype=np.float64)
        std  = np.asarray(stats["std"],  dtype=np.float64)
        std[std == 0] = 1.0
        return mean, std
    return None, None

def _apply_scaler(X: np.ndarray, mean: np.ndarray, std: np.ndarray) -> np.ndarray:
    # Handle empty or 1D input
    if X.size == 0:
        return X
    if X.ndim == 1:
        # [features] -> [1, 1, features]
        X = X[None, None, :]
    elif X.ndim == 2:
        # [samples, features] -> [samples, 1, features]
        X = X[:, None, :]
    F = X.shape[2]
    flat = X.reshape(-1, F)
    flat = (flat - mean[:F]) / std[:F]
    flat = np.nan_to_num(flat, nan=0.0, posinf=1e6, neginf=-1e6)
    return flat.reshape(X.shape)

@torch.no_grad()
def infer_probabilities(
    df: pd.DataFrame,
    feature_cols: List[str],
    window_size: int,
    model_path: str,
    scaler_json: str,
    model_kind: str = "lstm",
    device: str = "cuda" if torch.cuda.is_available() else "cpu",
):
    # Keep the original index (DatetimeIndex from your CSV)
    tmp = df.dropna(subset=feature_cols)

    # Build windows
    X, _ = create_sliding_windows(tmp, feature_columns=feature_cols, window_size=window_size, label_col=feature_cols[0])

    # Align output index to the end of each window
    out_index = tmp.index[window_size:]

    # Load scaler
    mean, std = _load_scaler(scaler_json)
    if mean is not None:
        X = _apply_scaler(X, mean, std)
    X = np.nan_to_num(X, nan=0.0, posinf=1e6, neginf=-1e6)

    # --- Fix shape issues here ---
    if X.size == 0:
        raise ValueError("Input features array X is empty after windowing/scaling.")
    if X.ndim == 1:
        # [features] -> [1, 1, features]
        X = X[None, None, :]
    elif X.ndim == 2:
        # [samples, features] -> [samples, 1, features]
        X = X[:, None, :]

    # Now X is guaranteed to be 3D
    num_features = X.shape[2]
    seq_len = X.shape[1]

    model = build_model(model_kind, num_features=num_features, seq_len=seq_len)
    state = torch.load(model_path, map_location="cpu")
    model.load_state_dict(state)
    model.eval().to(device)

    xb = torch.tensor(X, dtype=torch.float32, device=device)
    logits = model(xb)
    probs = torch.softmax(logits, dim=1).cpu().numpy()
    p1 = pd.Series(probs[:, 1], index=out_index, name="p_up")
    p0 = pd.Series(probs[:, 0], index=out_index, name="p_down")
    return p1, p0
