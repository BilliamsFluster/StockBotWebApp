from dataclasses import dataclass
from typing import Dict, Tuple, List

import numpy as np
import pandas as pd


@dataclass
class FeatureSpec:
    """Specification for feature construction."""

    set: str  # e.g. "ohlcv"
    embargo_bars: int
    normalize_obs: bool


def build_features(
    parquet_map: Dict[str, str],
    lookback: int,
    spec: FeatureSpec,
) -> Tuple[np.ndarray, Dict]:
    """Build rolling window features with a no-leak guarantee.

    Parameters
    ----------
    parquet_map: mapping from symbol to parquet path.
    lookback: number of past bars to include in each sample.
    spec: feature specification.

    Returns
    -------
    X: ``np.ndarray`` shaped ``(T, lookback, N, F)`` with ``time-major`` order.
    meta: dictionary containing ``timestamps``, ``symbols`` and ``feature_names``.
    """

    symbols = list(parquet_map.keys())
    dfs = []
    for sym in symbols:
        # Files are stored as CSV in the light-weight test environment.
        df = pd.read_csv(parquet_map[sym])
        df = df.set_index("timestamp")
        # Normalize column names to lower-case expected by downstream
        df = df.rename(columns={c: c.lower() for c in df.columns})
        # Add minimal feature set if requested
        if str(getattr(spec, "set", "ohlcv")).lower() in ("minimal", "minimal_core"):
            # log price and returns
            close = df["close"].astype(float)
            logp = np.log(close.clip(lower=1e-9))
            logret = logp.diff().fillna(0.0)
            df["logret"] = logret
            df["logret5"] = logret.rolling(5).sum().fillna(0.0)
            df["logret20"] = logret.rolling(20).sum().fillna(0.0)
            # realized vol
            df["vol10"] = logret.rolling(10).std().fillna(0.0)
            df["vol20"] = logret.rolling(20).std().fillna(0.0)
            # ATR14
            prev_close = close.shift(1)
            tr = pd.concat([
                (df["high"] - df["low"]).abs(),
                (df["high"] - prev_close).abs(),
                (df["low"] - prev_close).abs(),
            ], axis=1).max(axis=1)
            atr14 = tr.rolling(14).mean().fillna(0.0)
            df["atr14"] = atr14
            # BB width (20,2)
            ma20 = close.rolling(20).mean()
            sd20 = close.rolling(20).std()
            upper = ma20 + 2 * sd20
            lower = ma20 - 2 * sd20
            width = (upper - lower) / (ma20.replace(0, np.nan))
            df["bb_width"] = width.replace([np.inf, -np.inf], 0.0).fillna(0.0)
            # Keltner width
            ema20 = close.ewm(span=20, adjust=False).mean()
            upper_k = ema20 + 2 * atr14
            lower_k = ema20 - 2 * atr14
            kwidth = (upper_k - lower_k) / (ema20.replace(0, np.nan))
            df["keltner_width"] = kwidth.replace([np.inf, -np.inf], 0.0).fillna(0.0)
            # Volume z-score (20)
            vol = df["volume"].astype(float)
            v_mean = vol.rolling(20).mean()
            v_std = vol.rolling(20).std().replace(0, np.nan)
            df["vol_z20"] = ((vol - v_mean) / v_std).replace([np.inf, -np.inf], 0.0).fillna(0.0)
            # Amihud: |return| / dollar volume
            dv = (close.abs() * vol.abs()).replace(0, np.nan)
            df["amihud"] = logret.abs() / dv
            df["amihud"] = df["amihud"].replace([np.inf, -np.inf], 0.0).fillna(0.0)
        dfs.append(df)
    # Align on the union of timestamps for all symbols
    combined = pd.concat(dfs, axis=1, keys=symbols)

    # Choose feature columns based on requested set
    base_cols: List[str] = ["open", "high", "low", "close", "volume"]
    if str(getattr(spec, "set", "ohlcv")).lower() in ("minimal", "minimal_core"):
        extra = [
            "logret",
            "logret5",
            "logret20",
            "vol10",
            "vol20",
            "atr14",
            "bb_width",
            "keltner_width",
            "vol_z20",
            "amihud",
        ]
        feature_cols = base_cols + extra
    else:
        feature_cols = base_cols
    arr = combined.loc[:, pd.IndexSlice[:, feature_cols]].to_numpy()
    T = len(combined)
    N = len(symbols)
    F = len(feature_cols)
    arr = arr.reshape(T, N, F)

    windows = []
    end_limit = T - spec.embargo_bars
    for t in range(lookback - 1, end_limit):
        win = arr[t - lookback + 1 : t + 1].copy()
        if spec.normalize_obs:
            mean = win.mean(axis=0, keepdims=True)
            std = win.std(axis=0, keepdims=True) + 1e-8
            win = (win - mean) / std
        windows.append(win)
    X = np.stack(windows, axis=0) if windows else np.empty((0, lookback, N, F))

    meta = {
        "timestamps": combined.index[lookback - 1 : end_limit].tolist(),
        "symbols": symbols,
        "feature_names": feature_cols,
    }
    return X, meta
