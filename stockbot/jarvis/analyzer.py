"""A simplistic performance analyzer acting as a placeholder for an LLM."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Any, Optional

from ..monitor.metrics import Metrics
from ..risk.exposure import ExposureTracker


@dataclass
class Suggestion:
    """A recommendation from Jarvis for adjusting the bot configuration."""

    message: str
    new_strategy: Optional[str] = None
    new_max_position: Optional[int] = None


class PerformanceAnalyzer:
    """Analyze performance metrics and generate high‑level suggestions."""

    def __init__(self, config: Dict[str, Any]) -> None:
        self.config = config

    def analyze(
        self,
        equity_curve: list[float],
        trades: list[Any],
        exposure_tracker: ExposureTracker,
    ) -> Optional[Suggestion]:
        metrics = Metrics
        cum_ret = metrics.cumulative_return(equity_curve)
        sharpe = metrics.sharpe_ratio(equity_curve)
        drawdown = exposure_tracker.max_drawdown()
        # Access Jarvis config thresholds
        jarvis_cfg = self.config.get("jarvis", {})
        sharpe_threshold = jarvis_cfg.get("sharpe_threshold", 0.0)
        drawdown_threshold = jarvis_cfg.get("drawdown_threshold", 0.1)
        max_recommended_position = jarvis_cfg.get("max_recommended_position", None)
        verbose = jarvis_cfg.get("verbose", False)

        # If drawdown exceeds threshold, recommend reducing position size
        if drawdown > drawdown_threshold:
            msg = (
                f"Drawdown of {drawdown:.2%} exceeds threshold of {drawdown_threshold:.2%}. "
                "Recommend reducing max position size."
            )
            new_pos = max_recommended_position
            return Suggestion(message=msg, new_max_position=new_pos)
        # If sharpe ratio falls below threshold, suggest switching strategy
        if sharpe < sharpe_threshold:
            msg = (
                f"Sharpe ratio {sharpe:.2f} below threshold {sharpe_threshold:.2f}. "
                "Consider switching to mean_reversion strategy."
            )
            return Suggestion(message=msg, new_strategy="mean_reversion")
        # Otherwise return None
        if verbose:
            print(
                f"Jarvis analysis: cum_return={cum_ret:.2%}, sharpe={sharpe:.2f}, drawdown={drawdown:.2%} - no action"
            )
        return None