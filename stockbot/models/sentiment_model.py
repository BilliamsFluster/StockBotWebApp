"""Placeholder sentiment analysis model.

In a complete implementation this class would wrap a natural language
processing model that interprets news or social media sentiment
surrounding a stock.  For the prototype the `predict` method
always returns 0 indicating neutral sentiment.
"""

from __future__ import annotations

from typing import Iterable, Tuple

from .base_model import BaseModel


class SentimentModel(BaseModel):
    """Stub sentiment model always returning neutral sentiment."""

    def predict(self, features: Iterable[float]) -> float:
        return 0.0

    def train(self, training_data: Iterable[Tuple[Iterable[float], float]]) -> None:
        return