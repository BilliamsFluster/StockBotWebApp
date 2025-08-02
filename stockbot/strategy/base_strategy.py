# strategy/base_strategy.py
from abc import ABC, abstractmethod
from typing import Any, Dict

class BaseStrategy(ABC):
    def __init__(self, config: Dict[str, Any]):
        self.config = config

    @abstractmethod
    def generate_signals(self, market_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyzes market data and returns a signal.
        Example return: {"action": "buy", "confidence": 0.85, "symbol": "AAPL"}
        """
        pass

    def post_trade_hook(self, trade_result: Dict[str, Any]) -> None:
        """
        Optional hook that runs after a trade is executed.
        Can be used for learning, logging, or updating internal state.
        """
        pass

