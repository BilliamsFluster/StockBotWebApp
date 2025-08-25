from __future__ import annotations
from typing import Any, Tuple
import numpy as np
import gymnasium as gym

from .base_strategy import Strategy


def _box_equal_weight(action_space: gym.Space) -> np.ndarray:
    assert isinstance(action_space, gym.spaces.Box)
    shape = action_space.shape
    if shape is None or len(shape) != 1:
        # Fallback: sample if shape not 1-D
        return action_space.sample()
    n = shape[0]
    if n <= 0:
        return action_space.sample()
    w = np.ones(n, dtype=np.float32) / float(n)
    low = np.broadcast_to(action_space.low, shape).astype(np.float32)
    high = np.broadcast_to(action_space.high, shape).astype(np.float32)
    return np.clip(w, low, high)

def _box_first_long(action_space: gym.Space) -> np.ndarray:
    assert isinstance(action_space, gym.spaces.Box)
    shape = action_space.shape
    if shape is None or len(shape) != 1:
        return action_space.sample()
    n = shape[0]
    w = np.zeros(n, dtype=np.float32)
    w[0] = 1.0
    low = np.broadcast_to(action_space.low, shape).astype(np.float32)
    high = np.broadcast_to(action_space.high, shape).astype(np.float32)
    return np.clip(w, low, high)

def _box_flat(action_space: gym.Space) -> np.ndarray:
    assert isinstance(action_space, gym.spaces.Box)
    shape = action_space.shape
    if shape is None or len(shape) != 1:
        return action_space.sample()
    w = np.zeros(shape[0], dtype=np.float32)
    low = np.broadcast_to(action_space.low, w.shape).astype(np.float32)
    high = np.broadcast_to(action_space.high, w.shape).astype(np.float32)
    return np.clip(w, low, high)


class EqualWeightStrategy(Strategy):
    def __init__(self, action_space: gym.Space):
        self.action_space = action_space

    def reset(self) -> None:
        return

    def predict(self, obs: Any, deterministic: bool = True) -> Tuple[Any, dict]:
        if isinstance(self.action_space, gym.spaces.Box):
            return _box_equal_weight(self.action_space), {}
        if isinstance(self.action_space, gym.spaces.Discrete):
            return 0, {}
        return self.action_space.sample(), {}


class BuyAndHoldStrategy(Strategy):
    """
    Enter equal-weight (or first asset long) on the first step, then hold.
    """
    def __init__(self, action_space: gym.Space, first_asset_only: bool = False):
        self.action_space = action_space
        self.first_asset_only = first_asset_only
        self._action_cached = None

    def reset(self) -> None:
        self._action_cached = None

    def predict(self, obs: Any, deterministic: bool = True) -> Tuple[Any, dict]:
        if self._action_cached is None:
            if isinstance(self.action_space, gym.spaces.Box):
                self._action_cached = (
                    _box_first_long(self.action_space)
                    if self.first_asset_only
                    else _box_equal_weight(self.action_space)
                )
            elif isinstance(self.action_space, gym.spaces.Discrete):
                self._action_cached = 1 if not self.first_asset_only else 0
            else:
                self._action_cached = self.action_space.sample()
        return self._action_cached, {}


class FlatStrategy(Strategy):
    """Always hold cash / flat exposure if the env allows (0 vector)."""
    def __init__(self, action_space: gym.Space):
        self.action_space = action_space

    def reset(self) -> None:
        return

    def predict(self, obs: Any, deterministic: bool = True) -> Tuple[Any, dict]:
        if isinstance(self.action_space, gym.spaces.Box):
            return _box_flat(self.action_space), {}
        if isinstance(self.action_space, gym.spaces.Discrete):
            return 0, {}
        return self.action_space.sample(), {}


class FirstLongStrategy(Strategy):
    """Always 100% the first asset, if Box action; else default."""
    def __init__(self, action_space: gym.Space):
        self.action_space = action_space

    def reset(self) -> None:
        return

    def predict(self, obs: Any, deterministic: bool = True) -> Tuple[Any, dict]:
        if isinstance(self.action_space, gym.spaces.Box):
            return _box_first_long(self.action_space), {}
        if isinstance(self.action_space, gym.spaces.Discrete):
            return 1, {}
        return self.action_space.sample(), {}


class RandomStrategy(Strategy):
    def __init__(self, action_space: gym.Space):
        self.action_space = action_space

    def reset(self) -> None:
        return

    def predict(self, obs: Any, deterministic: bool = True) -> Tuple[Any, dict]:
        return self.action_space.sample(), {}
