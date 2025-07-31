"""Base classes and definitions for trading strategies."""

from __future__ import annotations

import abc
from dataclasses import dataclass
from enum import Enum
from typing import Iterable, List


class Signal(Enum):
    BUY = 1
    SELL = -1
    HOLD = 0


@dataclass
class MarketSnapshot:
    """A snapshot of market data passed to the strategy."""
    prices: List[float]


class BaseStrategy(abc.ABC):
    """Abstract base class for all strategies."""

    def __init__(self, params: dict[str, float] | None = None) -> None:
        self.params = params or {}

    @abc.abstractmethod
    def generate_signal(self, snapshot: MarketSnapshot) -> Signal:
        """Generate a trading signal from market data.

        Args:
            snapshot: Recent price history or other features.
        Returns:
            A `Signal` indicating buy, sell or hold.
        """

    def __call__(self, snapshot: MarketSnapshot) -> Signal:
        """Alias for generate_signal to allow callable strategies."""
        return self.generate_signal(snapshot)