"""Common technical indicators and helper functions for strategies."""

from __future__ import annotations

from typing import Iterable, List


def moving_average(data: List[float], window: int) -> float:
    """Compute the simple moving average of the last `window` values."""
    if not data or window < 1 or len(data) < window:
        raise ValueError("Not enough data points for moving average")
    return sum(data[-window:]) / window


def ema(data: List[float], window: int) -> float:
    """Compute the exponential moving average (EMA)."""
    if not data or window < 1 or len(data) < window:
        raise ValueError("Not enough data points for EMA")
    alpha = 2 / (window + 1)
    ema_val = data[-window]
    for price in data[-window + 1 :]:
        ema_val = alpha * price + (1 - alpha) * ema_val
    return ema_val