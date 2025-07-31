"""Placeholder anomaly detection module."""

from __future__ import annotations

from typing import Iterable, List


class AnomalyDetector:
    """Simple anomaly detector that flags large swings in returns."""

    def __init__(self, threshold: float = 0.05) -> None:
        self.threshold = threshold

    def detect(self, equity_curve: List[float]) -> bool:
        """Return True if an anomaly is detected."""
        returns = []
        for prev, cur in zip(equity_curve[:-1], equity_curve[1:]):
            if prev != 0:
                returns.append(abs((cur - prev) / prev))
        if not returns:
            return False
        # flag if any return exceeds threshold
        return any(r > self.threshold for r in returns)