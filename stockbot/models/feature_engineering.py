"""Feature engineering utilities for model input preparation."""

from __future__ import annotations

from typing import List, Iterable


def price_changes(prices: List[float]) -> List[float]:
    """Compute discrete differences between consecutive prices."""
    return [cur - prev for prev, cur in zip(prices[:-1], prices[1:])]


def rolling_mean(prices: List[float], window: int) -> List[float]:
    """Compute the rolling mean for each position in the list.

    The returned list is aligned with the input prices and will be
    shorter by `window - 1` elements.  For simplicity this function
    requires that the input list has at least `window` elements.
    """
    if len(prices) < window:
        return []
    means = []
    for i in range(window, len(prices) + 1):
        window_vals = prices[i - window : i]
        means.append(sum(window_vals) / window)
    return means