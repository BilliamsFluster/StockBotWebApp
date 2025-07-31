"""Track portfolio exposure and compute risk metrics."""

from __future__ import annotations

from typing import List


class ExposureTracker:
    """Maintain a history of portfolio values to compute drawdown."""

    def __init__(self) -> None:
        self.equity_history: List[float] = []

    def update(self, equity: float) -> None:
        """Append the latest equity value to the history."""
        self.equity_history.append(equity)

    def max_drawdown(self) -> float:
        """Calculate the maximum drawdown observed so far.

        The drawdown is defined as the maximum peak‑to‑trough decline
        observed in the equity curve.
        """
        if not self.equity_history:
            return 0.0
        max_peak = self.equity_history[0]
        max_drawdown = 0.0
        for equity in self.equity_history:
            if equity > max_peak:
                max_peak = equity
            drawdown = (max_peak - equity) / max_peak if max_peak != 0 else 0
            if drawdown > max_drawdown:
                max_drawdown = drawdown
        return max_drawdown