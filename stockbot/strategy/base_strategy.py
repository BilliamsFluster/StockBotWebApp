from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, Tuple

class Strategy(ABC):
    """
    Minimal interface the backtest uses. Aligns with SB3's predict() shape.
    """

    @abstractmethod
    def reset(self) -> None:
        """Called at episode start to clear internal state."""
        ...

    @abstractmethod
    def predict(self, obs: Any, deterministic: bool = True) -> Tuple[Any, dict]:
        """
        Return (action, info_dict). Action must be valid for env.action_space.
        """
        ...

    def close(self) -> None:
        """Optional cleanup."""
        return
