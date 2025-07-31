"""Simple momentum trading strategy.

This strategy uses two moving averages (short and long) to detect
trends.  A buy signal is generated when the short moving average
crosses above the long moving average and the price momentum exceeds
a configured threshold.  A sell signal is generated when the short
average crosses below the long average.  Otherwise the strategy holds.
"""

from __future__ import annotations

from typing import List

from .base import BaseStrategy, MarketSnapshot, Signal


class MomentumStrategy(BaseStrategy):
    """Momentum strategy using moving average crossovers."""

    def __init__(self, params: dict[str, float] | None = None) -> None:
        super().__init__(params)
        # default parameters
        self.window_short: int = int(self.params.get("window_short", 5))
        self.window_long: int = int(self.params.get("window_long", 15))
        self.threshold: float = float(self.params.get("threshold", 0.0))
        if self.window_short < 1 or self.window_long < 1:
            raise ValueError("window sizes must be positive integers")
        if self.window_short >= self.window_long:
            raise ValueError("window_short must be less than window_long")

    def _moving_average(self, prices: List[float], window: int) -> float:
        return sum(prices[-window:]) / window

    def generate_signal(self, snapshot: MarketSnapshot) -> Signal:
        prices = snapshot.prices
        if len(prices) < self.window_long:
            return Signal.HOLD
        ma_short = self._moving_average(prices, self.window_short)
        ma_long = self._moving_average(prices, self.window_long)
        momentum = (ma_short - ma_long) / ma_long if ma_long != 0 else 0
        # Determine crossover direction by comparing previous averages
        prev_ma_short = self._moving_average(prices[:-1], self.window_short) if len(prices) > self.window_long else ma_short
        prev_ma_long = self._moving_average(prices[:-1], self.window_long) if len(prices) > self.window_long else ma_long
        if prev_ma_short <= prev_ma_long and ma_short > ma_long and momentum > self.threshold:
            return Signal.BUY
        elif prev_ma_short >= prev_ma_long and ma_short < ma_long:
            return Signal.SELL
        else:
            return Signal.HOLD