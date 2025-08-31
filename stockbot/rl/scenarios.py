from __future__ import annotations
"""Scenario definitions for evaluation harness.

Each scenario specifies simple market conditions used during evaluation
(backtests, walk-forward runs, etc.).  These definitions are intentionally
minimal – real integrations can extend the fields as needed (slippage models,
liquidity assumptions, etc.).
"""
from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class Scenario:
    name: str
    drift: float = 0.0  # average return per step used by toy simulations
    slippage_bps: float = 0.0
    spread_bps: float = 0.0


DEFAULT_SCENARIOS: Dict[str, Scenario] = {
    "bull": Scenario("bull", drift=0.001),
    "bear": Scenario("bear", drift=-0.001),
    "sideways": Scenario("sideways", drift=0.0),
}
