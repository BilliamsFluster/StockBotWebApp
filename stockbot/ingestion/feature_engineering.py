"""Feature engineering utilities for StockBot.

This module provides helper functions to transform raw OHLCV market data
into a structured dataset suitable for supervised or reinforcement learning.
It includes functions to calculate common technical indicators, create
sliding windows, and label samples for classification or regression.

Example usage:

    from stockbot.ingestion.feature_engineering import prepare_dataset

    # Generate a dataset for Apple and save it to the data directory
    prepare_dataset("AAPL", start_date="2020-01-01", end_date="2024-12-31",
                    output_dir="./stockbot/data", window_size=10, horizon=1)

Note: This module relies on `pandas` and `numpy` for numerical processing.
If you wish to compute additional indicators (RSI, MACD, Bollinger Bands, etc.)
using a third-party library like `pandas_ta` or `ta-lib`, you can import them
here.  To keep this script runnable without external dependencies, simple
versions of RSI and MACD are implemented manually.
"""

from __future__ import annotations

import os
from typing import List, Tuple
import numpy as np
import pandas as pd

try:
    import yfinance as yf  # type: ignore
except ImportError as exc:
    raise ImportError(
        "yfinance must be installed to fetch market data. "
        "Install with `pip install yfinance`."
    ) from exc


# ---------------------------------------------------------------------
# Basic technical indicators
# ---------------------------------------------------------------------

def _sma(series: pd.Series, period: int) -> pd.Series:
    """Simple moving average."""
    return series.rolling(window=period, min_periods=period).mean()


def _ema(series: pd.Series, period: int) -> pd.Series:
    """Exponential moving average with span equal to `period`."""
    return series.ewm(span=period, adjust=False).mean()


def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index (RSI)."""
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    rs = avg_gain / (avg_loss + 1e-10)
    rsi = 100 - (100 / (1 + rs))
    return rsi


def _macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Tuple[pd.Series, pd.Series, pd.Series]:
    """Moving Average Convergence Divergence (MACD): line, signal, histogram."""
    ema_fast = _ema(series, fast)
    ema_slow = _ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = _ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


# ---------------------------------------------------------------------
# Indicator computation
# ---------------------------------------------------------------------

def calculate_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Compute a set of technical indicators from an OHLCV DataFrame.

    Requires columns: Open, High, Low, Close, Volume.
    Adds:
      - SMA(10,20), EMA(10,20)
      - RSI(14)
      - MACD line/signal/hist
      - Log returns
    """
    df = df.copy()

    # Moving averages
    df["sma_10"] = _sma(df["Close"], 10)
    df["sma_20"] = _sma(df["Close"], 20)
    df["ema_10"] = _ema(df["Close"], 10)
    df["ema_20"] = _ema(df["Close"], 20)

    # RSI
    df["rsi_14"] = _rsi(df["Close"], period=14)

    # MACD
    macd_line, signal_line, hist = _macd(df["Close"], fast=12, slow=26, signal=9)
    df["macd"] = macd_line
    df["macd_signal"] = signal_line
    df["macd_hist"] = hist

    # Log returns (shifted to align with window start)
    df["log_return"] = np.log(df["Close"] / df["Close"].shift(1))

    return df


# ---------------------------------------------------------------------
# Labeling
# ---------------------------------------------------------------------

def create_labels(df: pd.DataFrame, threshold: float = 0.0, horizon: int = 1) -> pd.Series:
    """Binary labels based on future return over `horizon` bars.

    Label = 1 if (Close[t+horizon] / Close[t] - 1) > threshold else 0.

    Args:
        df: DataFrame with 'Close' column.
        threshold: Minimum forward return to label as positive.
        horizon: Number of steps ahead to compute the forward return.

    Returns:
        Series of 0/1 labels aligned to time t (future info is not leaked).
    """
    assert horizon >= 1, "horizon must be >= 1"
    df["future_return"] = (df["Close"].shift(-horizon) - df["Close"]) / df["Close"]
    df["label"] = (df["future_return"] > threshold).astype(int)
    return df["label"]


# ---------------------------------------------------------------------
# Sliding windows
# ---------------------------------------------------------------------

def create_sliding_windows(
    df: pd.DataFrame,
    feature_columns: List[str],
    window_size: int = 10,
) -> Tuple[np.ndarray, np.ndarray]:
    """Generate feature (X) and label (y) arrays using a sliding window.

    X shape: (num_samples, window_size, num_features)
    y shape: (num_samples,)
    """
    features = df[feature_columns].values
    labels = df["label"].values
    X, y = [], []
    # Because we drop NaN after labeling, the last `horizon` rows are gone,
    # so this loop up to len(df) - 1 remains valid.
    for i in range(window_size, len(df)):
        X.append(features[i - window_size : i])
        y.append(labels[i])
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int64)


# ---------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------

def prepare_dataset(
    ticker: str,
    start_date: str,
    end_date: str,
    output_dir: str,
    window_size: int = 10,
    threshold: float = 0.0,
    horizon: int = 1,
    auto_adjust: bool = False,
) -> str:
    """Download market data, compute indicators/labels, and save to disk.

    Args:
        ticker: Stock symbol (e.g., "AAPL").
        start_date: YYYY-MM-DD.
        end_date: YYYY-MM-DD.
        output_dir: Directory to store the CSV.
        window_size: Number of timesteps per sample for supervised learning.
        threshold: Threshold for classification labels (forward return).
        horizon: How many steps ahead to define the label (t+1 by default).
        auto_adjust: Passed through to yfinance.download.

    Returns:
        Path to the saved CSV file.
    """
    # Fetch historical data
    df = yf.download(
        ticker,
        start=start_date,
        end=end_date,
        progress=False,
        auto_adjust=auto_adjust,  # explicit to avoid FutureWarning and keep control
    )
    if df.empty:
        raise ValueError(f"No data found for {ticker} between {start_date} and {end_date}")

    # Ensure index datetime + sorted
    df.index = pd.to_datetime(df.index)
    df.sort_index(inplace=True)

    # Indicators
    df = calculate_technical_indicators(df)

    # Labels (drop the tail rows with NaNs from lookahead)
    df["label"] = create_labels(df, threshold=threshold, horizon=horizon)

    # Drop rows with NaNs (indicator warm-ups and last `horizon` rows)
    df.dropna(inplace=True)

    # Save
    os.makedirs(output_dir, exist_ok=True)
    filename = f"{ticker}_{start_date}_to_{end_date}_window{window_size}.csv"
    csv_path = os.path.join(output_dir, filename)
    df.to_csv(csv_path, index=True)
    return csv_path


__all__ = [
    "calculate_technical_indicators",
    "create_labels",
    "create_sliding_windows",
    "prepare_dataset",
]

