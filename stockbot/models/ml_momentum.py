"""Trivial momentum model that predicts price direction based on recent changes.

This simple model looks at the difference between the last two price
points and returns +1 for an expected upward move or -1 for a down
move.  The `threshold` parameter from the configuration may be used
to ignore weak signals.
"""

from __future__ import annotations

from typing import Iterable, Tuple

from .base_model import BaseModel


class MomentumModel(BaseModel):
    """A very simple momentum model using price differences."""

    def __init__(self, threshold: float = 0.0) -> None:
        self.threshold = threshold

    def predict(self, features: Iterable[float]) -> float:
        features_list = list(features)
        if len(features_list) < 2:
            return 0.0
        diff = features_list[-1] - features_list[-2]
        if diff > self.threshold:
            return 1.0
        elif diff < -self.threshold:
            return -1.0
        return 0.0

    def train(self, training_data: Iterable[Tuple[Iterable[float], float]]) -> None:
        # no training for this trivial model
        return