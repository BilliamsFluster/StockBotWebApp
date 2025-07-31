"""Analyze results of a backtest run."""

from __future__ import annotations

from typing import Dict, Any, List

from monitor.metrics import Metrics


class BacktestAnalyzer:
    """Compute summary statistics from a backtest."""

    def summarize(self, equity_curve: List[float], trades: List[Any]) -> Dict[str, Any]:
        summary: Dict[str, Any] = {}
        summary["cumulative_return"] = Metrics.cumulative_return(equity_curve)
        summary["sharpe_ratio"] = Metrics.sharpe_ratio(equity_curve)
        summary["win_rate"] = Metrics.win_rate(trades)
        return summary