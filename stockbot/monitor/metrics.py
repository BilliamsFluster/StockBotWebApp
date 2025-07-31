"""Compute performance metrics for the trading bot."""

from __future__ import annotations

import math
from typing import Iterable, List


class Metrics:
    """Compute common portfolio performance metrics from equity data."""

    @staticmethod
    def returns(equity_curve: List[float]) -> List[float]:
        """Compute percentage returns between successive equity values."""
        returns = []
        for prev, cur in zip(equity_curve[:-1], equity_curve[1:]):
            if prev != 0:
                returns.append((cur - prev) / prev)
            else:
                returns.append(0.0)
        return returns

    @staticmethod
    def cumulative_return(equity_curve: List[float]) -> float:
        if not equity_curve:
            return 0.0
        start = equity_curve[0]
        end = equity_curve[-1]
        return (end - start) / start if start != 0 else 0.0

    @staticmethod
    def sharpe_ratio(equity_curve: List[float], risk_free_rate: float = 0.0) -> float:
        rets = Metrics.returns(equity_curve)
        if not rets:
            return 0.0
        avg = sum(rets) / len(rets)
        variance = sum((r - avg) ** 2 for r in rets) / len(rets)
        std = math.sqrt(variance)
        # annualization factor (assuming daily returns)
        if std == 0:
            return 0.0
        sharpe = (avg - risk_free_rate) / std * math.sqrt(252)
        return sharpe

    @staticmethod
    def win_rate(trades: Iterable) -> float:
        """Compute the proportion of winning trades."""
        wins = 0
        total = 0
        for trade in trades:
            # win if cost < 0 (sell) or if after closing the P&L is positive
            total += 1
            # For this prototype we simply count all sells as wins and buys as losses
            if trade.cost < 0:
                wins += 1
        return wins / total if total > 0 else 0.0