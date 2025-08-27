
# strategy/selector.py
from stockbot.strategy.baselines import MomentumStrategy
from strategy.base_strategy import BaseStrategy
from typing import Dict, Any

# For now, this simply returns a MomentumStrategy instance.
# Later, you can make this LLM-aware or context-based.
def get_active_strategy(config: Dict[str, Any]) -> BaseStrategy:
    strategy_type = config.get("strategy", "momentum")

    if strategy_type == "momentum":
        return MomentumStrategy(config)
    else:
        raise ValueError(f"Unknown strategy type: {strategy_type}")
