"""Mean reversion trading strategy.

This strategy assumes that prices tend to revert to a mean over time.
If the current price deviates too far above the moving average it
signals a sell, and if it deviates below the mean it signals a buy.
The sensitivity is controlled by a configurable threshold.
"""

from __future__ import annotations

from typing import List

from .base import BaseStrategy, MarketSnapshot, Signal


class MeanReversionStrategy(BaseStrategy):
    """Mean reversion strategy based on a moving average and threshold."""

    def __init__(self, params: dict[str, float] | None = None) -> None:
        super().__init__(params)
        self.window: int = int(self.params.get("window", 20))
        self.threshold: float = float(self.params.get("threshold", 0.02))
        if self.window < 1:
            raise ValueError("window size must be positive")

    def _moving_average(self, prices: List[float], window: int) -> float:
        return sum(prices[-window:]) / window

    def generate_signal(self, snapshot: MarketSnapshot) -> Signal:
        prices = snapshot.prices
        if len(prices) < self.window:
            return Signal.HOLD
        ma = self._moving_average(prices, self.window)
        current_price = prices[-1]
        deviation = (current_price - ma) / ma if ma != 0 else 0
        if deviation > self.threshold:
            return Signal.SELL
        elif deviation < -self.threshold:
            return Signal.BUY
        else:
            return Signal.HOLD