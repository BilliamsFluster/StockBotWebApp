# strategy/momentum.py
from typing import Any, Dict
from strategy.base_strategy import BaseStrategy

class MomentumStrategy(BaseStrategy):
    def generate_signals(self, market_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Dummy momentum strategy: If price is trending up, return a buy signal.
        """
        price_history = market_data.get("price_history", [])
        symbol = market_data.get("symbol", "UNKNOWN")

        if len(price_history) < 3:
            return {"action": "hold", "confidence": 0.0, "symbol": symbol}

        # Simple trend check
        if price_history[-1] > price_history[-2] > price_history[-3]:
            return {"action": "buy", "confidence": 0.9, "symbol": symbol}
        elif price_history[-1] < price_history[-2] < price_history[-3]:
            return {"action": "sell", "confidence": 0.9, "symbol": symbol}
        else:
            return {"action": "hold", "confidence": 0.5, "symbol": symbol}

    def post_trade_hook(self, trade_result: Dict[str, Any]) -> None:
        print(f"Executed trade: {trade_result}")
