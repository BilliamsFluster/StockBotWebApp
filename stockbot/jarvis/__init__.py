"""Jarvis LLM oversight layer.

The jarvis package provides an interface for a large language model
that monitors the bot’s performance and suggests strategy adjustments.
In this prototype the LLM functionality is simulated using simple
heuristics in the `Analyzer`.  The `Agent` coordinates periodic
analysis according to the configuration and applies suggestions via
`StrategyFeedback`.
"""

from .agent import JarvisAgent
from .analyzer import PerformanceAnalyzer
from .strategy_feedback import StrategyFeedback

__all__ = [
    "JarvisAgent",
    "PerformanceAnalyzer",
    "StrategyFeedback",
]