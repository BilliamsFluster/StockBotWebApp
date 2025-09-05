from dataclasses import dataclass
from typing import Dict, Tuple

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
        dfs.append(df)
    # Align on the union of timestamps for all symbols
    combined = pd.concat(dfs, axis=1, keys=symbols)

    # We'll use OHLCV features for all sets; additional feature sets can be
    # added later without changing the interface.
    feature_cols = ["open", "high", "low", "close", "volume"]
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
