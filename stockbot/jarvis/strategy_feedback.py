"""Apply strategy and risk parameter adjustments based on Jarvis suggestions."""

from __future__ import annotations

from typing import Dict, Any, Optional

from .analyzer import Suggestion


class StrategyFeedback:
    """Modify configuration in response to suggestions from the analyzer."""

    def apply_suggestion(self, cfg: Dict[str, Any], suggestion: Suggestion) -> None:
        """Apply the suggestion to the configuration dictionary in place."""
        if suggestion.new_strategy:
            # update active strategy
            cfg.setdefault("strategies", {})["active"] = suggestion.new_strategy
        if suggestion.new_max_position is not None:
            # update risk limit
            risk_cfg = cfg.setdefault("settings", {}).setdefault("risk", {})
            risk_cfg["max_position_size"] = suggestion.new_max_position