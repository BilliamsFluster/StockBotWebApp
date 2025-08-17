"""Feature engineering utilities for StockBot.

This module provides helper functions to transform raw OHLCV market data
into a structured dataset suitable for supervised or reinforcement learning.
It includes functions to calculate common technical indicators, create
sliding windows, and label samples for classification or regression.

Example usage:

    from stockbot.ingestion.feature_engineering import prepare_dataset

    # Generate a dataset for Apple and save it to the data directory
    prepare_dataset("AAPL", start_date="2020-01-01", end_date="2024-12-31",
                    output_dir="./stockbot/data", window_size=10)

Note: This module relies on `pandas` and `numpy` for numerical
processing.  If you wish to compute additional indicators (RSI, MACD,
Bollinger Bands, etc.) using a third‑party library like `pandas_ta`
or `ta-lib`, you can import them here.  To keep this script runnable
without external dependencies, simple versions of RSI and MACD are
implemented manually.
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


def _sma(series: pd.Series, period: int) -> pd.Series:
    """Simple moving average.

    Args:
        series: Price series (e.g. closing prices).
        period: Lookback window size.

    Returns:
        Series of SMA values with the same index.
    """
    return series.rolling(window=period, min_periods=period).mean()


def _ema(series: pd.Series, period: int) -> pd.Series:
    """Exponential moving average with span equal to `period`.
    """
    return series.ewm(span=period, adjust=False).mean()


def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Compute the Relative Strength Index (RSI).

    The RSI measures momentum by comparing the magnitude of recent gains to
    recent losses.  Values above 70 indicate an overbought condition,
    while values below 30 indicate oversold.

    Args:
        series: Price series (e.g. closing prices).
        period: Number of periods to calculate RSI over.

    Returns:
        Series of RSI values.
    """
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    rs = avg_gain / (avg_loss + 1e-10)
    rsi = 100 - (100 / (1 + rs))
    return rsi


def _macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Tuple[pd.Series, pd.Series, pd.Series]:
    """Compute the Moving Average Convergence Divergence (MACD).

    Returns the MACD line, signal line and histogram.
    """
    ema_fast = _ema(series, fast)
    ema_slow = _ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = _ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def calculate_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Compute a set of technical indicators from an OHLCV DataFrame.

    The input DataFrame must contain the columns: `Open`, `High`, `Low`,
    `Close`, and `Volume`.  The function returns a new DataFrame with
    added columns representing various indicators.

    Indicators implemented:
        - Simple moving averages (SMA) over 10 and 20 periods
        - Exponential moving averages (EMA) over 10 and 20 periods
        - Relative Strength Index (RSI) over 14 periods
        - MACD line, signal line and histogram
        - Log returns

    Args:
        df: DataFrame containing OHLCV data indexed by date.

    Returns:
        The same DataFrame with additional indicator columns.
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


def create_labels(df: pd.DataFrame, threshold: float = 0.0) -> pd.Series:
    """Create binary labels for classification based on future returns.

    If the next day’s closing price is higher than today’s by at least
    `threshold`, the label is 1 (price up); otherwise it is 0 (price down or
    unchanged).  For regression tasks, you can modify this function to
    return the raw return instead.

    Args:
        df: DataFrame with a `Close` column.
        threshold: Minimum return required to label a sample as positive.

    Returns:
        Series of integer labels (0 or 1) aligned with the current day.
    """
    future_close = df["Close"].shift(-1)
    future_return = (future_close - df["Close"]) / df["Close"]
    labels = (future_return > threshold).astype(int)
    return labels


def create_sliding_windows(
    df: pd.DataFrame,
    feature_columns: List[str],
    window_size: int = 10,
) -> Tuple[np.ndarray, np.ndarray]:
    """Generate feature and label arrays using a sliding window approach.

    Args:
        df: DataFrame with indicator columns and labels.
        feature_columns: Names of columns to include in the input sequence.
        window_size: Number of past timesteps to include in each sample.

    Returns:
        Tuple of (X, y) arrays.  X has shape (num_samples, window_size, num_features)
        and y has shape (num_samples,).
    """
    features = df[feature_columns].values
    labels = df["label"].values
    X, y = [], []
    for i in range(window_size, len(df) - 1):
        window = features[i - window_size : i]
        X.append(window)
        y.append(labels[i])
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int64)


def prepare_dataset(
    ticker: str,
    start_date: str,
    end_date: str,
    output_dir: str,
    window_size: int = 10,
    threshold: float = 0.0,
) -> str:
    """Download market data, compute indicators, labels and save to disk.

    Args:
        ticker: Stock symbol to download (e.g. "AAPL").
        start_date: Start of the historical period (YYYY‑MM‑DD).
        end_date: End of the historical period (YYYY‑MM‑DD).
        output_dir: Directory to store the resulting CSV file.
        window_size: Number of timesteps per sample for supervised learning.
        threshold: Threshold for classification labels.

    Returns:
        Path to the saved CSV file.
    """
    # Fetch historical data
    df = yf.download(ticker, start=start_date, end=end_date, progress=False)
    if df.empty:
        raise ValueError(f"No data found for {ticker} between {start_date} and {end_date}")
    # Ensure index is in datetime format and sorted
    df.index = pd.to_datetime(df.index)
    df.sort_index(inplace=True)
    # Compute indicators
    df = calculate_technical_indicators(df)
    # Generate labels
    df["label"] = create_labels(df, threshold=threshold)
    # Drop rows with NaN values resulting from indicator calculations
    df.dropna(inplace=True)
    # Save to CSV
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
