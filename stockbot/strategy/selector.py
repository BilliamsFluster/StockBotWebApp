"""Strategy selector based on configuration.

The selector chooses which strategy to instantiate given a name and a
dictionary of parameters.  This indirection allows the bot to switch
strategies without changing code.  If a strategy name is unknown,
`ValueError` is raised.
"""

from __future__ import annotations

from typing import Dict

from .base import BaseStrategy
from .momentum import MomentumStrategy
from .mean_reversion import MeanReversionStrategy


class StrategySelector:
    """Factory class for creating strategies from configuration."""

    registry: Dict[str, type[BaseStrategy]] = {
        "momentum": MomentumStrategy,
        "mean_reversion": MeanReversionStrategy,
    }

    @classmethod
    def create(cls, name: str, params: dict[str, float]) -> BaseStrategy:
        if name not in cls.registry:
            raise ValueError(f"Unknown strategy '{name}'")
        strategy_cls = cls.registry[name]
        return strategy_cls(params)