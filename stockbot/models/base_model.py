"""Abstract base class for machine learning models."""

from __future__ import annotations

import abc
from typing import Iterable, Tuple


class BaseModel(abc.ABC):
    """Base class for predictive models used by the trading bot."""

    @abc.abstractmethod
    def predict(self, features: Iterable[float]) -> float:
        """Predict a signal or probability from a set of features."""

    @abc.abstractmethod
    def train(self, training_data: Iterable[Tuple[Iterable[float], float]]) -> None:
        """Train the model given labeled training data."""