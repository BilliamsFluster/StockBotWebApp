"""Jarvis agent orchestrating periodic performance analysis."""

from __future__ import annotations

from typing import Dict, Any, List

from .analyzer import PerformanceAnalyzer, Suggestion
from .strategy_feedback import StrategyFeedback


class JarvisAgent:
    """Agent that monitors performance and applies LLM‑driven feedback."""

    def __init__(self, config: Dict[str, Any]) -> None:
        self.config = config
        self.analyzer = PerformanceAnalyzer(config)
        self.feedback = StrategyFeedback()
        self.counter: int = 0
        self.analysis_frequency: int = config.get("jarvis", {}).get("analysis_frequency", 10)

    def maybe_analyze(
        self,
        equity_curve: List[float],
        trades: List[Any],
        exposure_tracker,
        runtime_config: Dict[str, Any],
    ) -> None:
        """Run analysis periodically and apply suggested changes."""
        self.counter += 1
        if self.counter % self.analysis_frequency != 0:
            return
        suggestion = self.analyzer.analyze(equity_curve, trades, exposure_tracker)
        if suggestion:
            self.feedback.apply_suggestion(runtime_config, suggestion)
            # reset counter after applying suggestions
            self.counter = 0