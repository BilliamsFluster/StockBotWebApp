"""Trading strategies package.

The strategy layer interprets model outputs and market data to
generate specific trading actions.  Each concrete strategy must
implement the `generate_signal` method which examines the history of
prices and returns either a buy, sell or hold recommendation.  The
`selector` module chooses which strategy to run based on the
configuration, allowing the bot to adapt at runtime.
"""

from .base import BaseStrategy, Signal, MarketSnapshot
from .momentum import MomentumStrategy
from .mean_reversion import MeanReversionStrategy
from .selector import StrategySelector

__all__ = [
    "BaseStrategy",
    "Signal",
    "MarketSnapshot",
    "MomentumStrategy",
    "MeanReversionStrategy",
    "StrategySelector",
]