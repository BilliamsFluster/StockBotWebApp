"""Utility helpers for selecting a backtest strategy."""
from __future__ import annotations

from pathlib import Path

from stockbot.rl.utils import make_strategy


def policy_kind(s: str) -> str:
    s = str(s).lower()
    if s.endswith(".zip"):
        return "rl"
    if s in {"flat", "equal", "first_long", "random", "buy_hold"}:
        return "baseline"
    raise ValueError(
        "Unknown policy. Use baseline name (flat|equal|first_long|random|buy_hold) or path to PPO .zip"
    )


def as_strategy(policy_arg: str, env):
    kind = policy_kind(policy_arg)
    if kind == "rl":
        return make_strategy("sb3", env, model_path=policy_arg)
    return make_strategy(policy_arg, env)


__all__ = ["as_strategy", "policy_kind"]
