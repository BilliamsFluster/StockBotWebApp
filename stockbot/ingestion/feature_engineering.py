"""Feature engineering utilities for StockBot (enhanced).

Adds:
- Richer technical indicators (volatility, momentum, volume)
- Multi-timeframe returns
- Flexible labeling modes: threshold / quantile / regression
- Safe fallbacks if pandas_ta is not installed

Requires: pandas, numpy, yfinance
Optional: pandas_ta (pip install pandas_ta)
"""

from __future__ import annotations

import os
from typing import List, Tuple, Literal, Optional, Dict
import numpy as np
import pandas as pd

try:
    import yfinance as yf  # type: ignore
except ImportError as exc:
    raise ImportError(
        "yfinance must be installed to fetch market data. "
        "Install with `pip install yfinance`."
    ) from exc

# Try optional pandas_ta for many indicators
try:
    import pandas_ta as ta  # type: ignore
    _HAS_TA = True
except Exception:
    _HAS_TA = False


# ---------------------------------------------------------------------
# Baseline technical indicators (manual fallbacks)
# ---------------------------------------------------------------------

def _sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period, min_periods=period).mean()

def _ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()

def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    rs = avg_gain / (avg_loss + 1e-10)
    return 100 - (100 / (1 + rs))

def _macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Tuple[pd.Series, pd.Series, pd.Series]:
    ema_fast = _ema(series, fast)
    ema_slow = _ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = _ema(macd_line, signal)
    hist = macd_line - signal_line
    return macd_line, signal_line, hist

def _true_range(df: pd.DataFrame) -> pd.Series:
    prev_close = df["Close"].shift(1)
    tr = pd.concat([
        df["High"] - df["Low"],
        (df["High"] - prev_close).abs(),
        (df["Low"] - prev_close).abs()
    ], axis=1).max(axis=1)
    return tr

def _atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    tr = _true_range(df)
    return tr.rolling(window=period, min_periods=period).mean()

def _stoch(df: pd.DataFrame, k: int = 14, d: int = 3) -> Tuple[pd.Series, pd.Series]:
    low_k = df["Low"].rolling(k, min_periods=k).min()
    high_k = df["High"].rolling(k, min_periods=k).max()
    stoch_k = 100 * (df["Close"] - low_k) / (high_k - low_k + 1e-12)
    stoch_d = stoch_k.rolling(d, min_periods=d).mean()
    return stoch_k, stoch_d

def _cci(df: pd.DataFrame, period: int = 20) -> pd.Series:
    tp = (df["High"] + df["Low"] + df["Close"]) / 3
    sma_tp = tp.rolling(period, min_periods=period).mean()
    mad = (tp - sma_tp).abs().rolling(period, min_periods=period).mean()
    return (tp - sma_tp) / (0.015 * (mad + 1e-12))

def _adx(df: pd.DataFrame, period: int = 14) -> pd.Series:
    up_move = df["High"].diff()
    down_move = -df["Low"].diff()

    # Using np.where can return (N, 1) on some stacks; force 1-D and align index.
    plus_dm_arr = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm_arr = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    plus_dm = pd.Series(np.asarray(plus_dm_arr).reshape(-1), index=df.index).astype(float)
    minus_dm = pd.Series(np.asarray(minus_dm_arr).reshape(-1), index=df.index).astype(float)

    tr = _true_range(df)
    atr = tr.rolling(period, min_periods=period).mean()

    plus_di = 100.0 * (plus_dm.rolling(period, min_periods=period).sum() / (atr * period + 1e-12))
    minus_di = 100.0 * (minus_dm.rolling(period, min_periods=period).sum() / (atr * period + 1e-12))

    dx = 100.0 * ((plus_di - minus_di).abs() / (plus_di + minus_di + 1e-12))
    return dx.rolling(period, min_periods=period).mean()


def _obv(df: pd.DataFrame) -> pd.Series:
    direction = np.sign(df["Close"].diff()).fillna(0)
    return (direction * df["Volume"]).cumsum()


# ---------------------------------------------------------------------
# Indicator computation
# ---------------------------------------------------------------------

def calculate_technical_indicators(df: pd.DataFrame, use_pandas_ta: bool = True) -> pd.DataFrame:
    """
    Compute a richer set of indicators. If pandas_ta is available and
    use_pandas_ta=True, we will use it; otherwise we fallback to manual versions.
    """
    df = df.copy()

    # Always include basic features
    df["sma_10"] = _sma(df["Close"], 10)
    df["sma_20"] = _sma(df["Close"], 20)
    df["ema_10"] = _ema(df["Close"], 10)
    df["ema_20"] = _ema(df["Close"], 20)

    df["rsi_14"] = _rsi(df["Close"], period=14)
    macd_line, signal_line, hist = _macd(df["Close"], fast=12, slow=26, signal=9)
    df["macd"] = macd_line
    df["macd_signal"] = signal_line
    df["macd_hist"] = hist

    # Volatility & momentum
    df["atr_14"] = _atr(df, 14)
    st_k, st_d = _stoch(df, 14, 3)
    df["stoch_k14"] = st_k
    df["stoch_d3"] = st_d
    df["cci_20"] = _cci(df, 20)
    df["adx_14"] = _adx(df, 14)
    df["obv"] = _obv(df)

    # Bollinger (manual, force Series -> avoid accidental DataFrame shape)
    close_s = pd.Series(df["Close"].to_numpy().reshape(-1), index=df.index, name="Close")
    bb_mid = _sma(close_s, 20)
    bb_std = close_s.rolling(20, min_periods=20).std()

    bb_up = pd.Series((bb_mid + 2.0 * bb_std).to_numpy().reshape(-1), index=df.index, name="bb_up_20_2")
    bb_dn = pd.Series((bb_mid - 2.0 * bb_std).to_numpy().reshape(-1), index=df.index, name="bb_dn_20_2")

    df["bb_up_20_2"] = bb_up
    df["bb_dn_20_2"] = bb_dn

    bb_range = (bb_up - bb_dn) + 1e-12
    num = (close_s - bb_dn)
    df["bb_pct"] = (num / bb_range).astype(float)


    # Multi-timeframe percentage returns
    for h in (1, 3, 5, 10, 20):
        df[f"ret_{h}"] = df["Close"].pct_change(h)

    # If pandas_ta is present, add a few extra (optional)
    if use_pandas_ta and _HAS_TA:
        try:
            bov = ta.bop(df["Open"], df["High"], df["Low"], df["Close"])
            df["bop"] = bov
            kama = ta.kama(df["Close"], length=10)
            df["kama_10"] = kama
            tsi = ta.tsi(df["Close"])
            df["tsi"] = tsi
        except Exception:
            pass

    # Log returns
    df["log_return"] = np.log(df["Close"] / df["Close"].shift(1))

    return df


# ---------------------------------------------------------------------
# Labeling
# ---------------------------------------------------------------------

LabelMode = Literal["threshold", "quantile", "regression"]

def create_labels(
    df: pd.DataFrame,
    threshold: float = 0.0,
    horizon: int = 1,
    mode: LabelMode = "threshold",
    pos_quantile: float = 0.7,
    neg_quantile: float = 0.3
) -> pd.Series:
    """
    Labeling options:
    - "threshold": label=1 if future_return > threshold else 0
    - "quantile":  label=1 if future_return >= Q(pos_quantile), 0 if <= Q(neg_quantile), NaN otherwise (middle dropped later)
    - "regression": returns the actual future_return (caller will treat as regression)

    future_return = (Close[t+horizon] / Close[t] - 1)
    """
    assert horizon >= 1, "horizon must be >= 1"
    fut_ret = (df["Close"].shift(-horizon) - df["Close"]) / df["Close"]

    if mode == "threshold":
        labels = (fut_ret > threshold).astype(int)
        return labels

    if mode == "quantile":
        q_neg = fut_ret.quantile(neg_quantile)
        q_pos = fut_ret.quantile(pos_quantile)
        labels = pd.Series(np.nan, index=df.index)
        labels[fut_ret <= q_neg] = 0
        labels[fut_ret >= q_pos] = 1
        return labels

    if mode == "regression":
        return fut_ret

    raise ValueError(f"Unknown label mode: {mode}")


# ---------------------------------------------------------------------
# Sliding windows
# ---------------------------------------------------------------------

def create_sliding_windows(
    df: pd.DataFrame,
    feature_columns: List[str],
    window_size: int = 10,
    label_col: str = "label"
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generate (X, y) arrays using a sliding window on features; y is the label value at the window end index.

    X shape: (num_samples, window_size, num_features)
    y shape: (num_samples,)
    """
    features = df[feature_columns].values
    labels = df[label_col].values
    X, y = [], []
    for i in range(window_size, len(df)):
        X.append(features[i - window_size: i])
        y.append(labels[i])
    X = np.array(X, dtype=np.float32)
    y = np.array(y)
    # Clean labels for regression/classification types
    if y.dtype.kind == 'f' and np.any(np.isnan(y)):
        mask = ~np.isnan(y)
        X, y = X[mask[window_size:]], y[mask[window_size:]]  # align indexes if needed
    return X, y


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
    label_mode: LabelMode = "threshold",
    pos_quantile: float = 0.7,
    neg_quantile: float = 0.3,
    use_pandas_ta: bool = True
) -> str:
    """
    Download market data, compute indicators/labels, and save to disk.
    Returns path to CSV containing engineered features and a `label` column (or
    `future_return` for regression mode).
    """
    df = yf.download(
    ticker, start=start_date, end=end_date, progress=False, auto_adjust=auto_adjust
)
    if df.empty:
        raise ValueError(f"No data found for {ticker} between {start_date} and {end_date}")

    # 🔧 Normalize columns if yfinance returns MultiIndex (common with newer versions)
    if isinstance(df.columns, pd.MultiIndex):
        # Try selecting this ticker at level 0 or -1
        if ticker in df.columns.get_level_values(0):
            df = df.xs(ticker, axis=1, level=0, drop_level=True)
        elif ticker in df.columns.get_level_values(-1):
            df = df.xs(ticker, axis=1, level=-1, drop_level=True)
        else:
            # Fallback: flatten names like ('Close','AAPL') -> 'Close_AAPL'
            df.columns = [
                "_".join([str(x) for x in col if x is not None]) for col in df.columns
            ]
            # If we still have multiple 'Close_*', pick the column that matches ticker
            close_cols = [c for c in df.columns if c.lower().startswith("close")]
            if len(close_cols) == 1:
                pass
            else:
                # Prefer exact match
                exact = [c for c in close_cols if c.lower().endswith(ticker.lower())]
                if exact:
                    keep = [c for c in df.columns if not c.lower().startswith("close")] + exact[:1]
                    df = df[keep]



    df.index = pd.to_datetime(df.index)
    df.sort_index(inplace=True)

    df = calculate_technical_indicators(df, use_pandas_ta=use_pandas_ta)

    if label_mode == "regression":
        df["future_return"] = create_labels(
            df, threshold=threshold, horizon=horizon, mode="regression"
        )
        label_col = "future_return"
    else:
        df["label"] = create_labels(
            df, threshold=threshold, horizon=horizon, mode=label_mode,
            pos_quantile=pos_quantile, neg_quantile=neg_quantile
        )
        label_col = "label"

    # Drop NaNs (indicator warm-ups, last horizon rows, and middle band for quantile mode)
    df.dropna(inplace=True)

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
