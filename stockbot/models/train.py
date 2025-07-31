"""Unified training entry point for models (stub)."""

from __future__ import annotations

from typing import Iterable, Tuple

from .ml_momentum import MomentumModel
from .sentiment_model import SentimentModel


def train_models(training_data: Iterable[Tuple[Iterable[float], float]]) -> None:
    """Train all enabled models.

    In this prototype we have trivial models that require no training,
    so this function simply instantiates them and calls `train`.
    """
    momentum_model = MomentumModel()
    sentiment_model = SentimentModel()
    momentum_model.train(training_data)
    sentiment_model.train(training_data)
    # In a real system you would save these models to disk or
    # otherwise make them available to the strategy layer.