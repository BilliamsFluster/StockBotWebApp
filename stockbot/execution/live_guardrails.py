from __future__ import annotations

"""Live trading guardrails and canary deployment helpers."""

from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict


@dataclass
class CanaryConfig:
    stages: tuple[float, ...] = (0.01, 0.02, 0.05, 0.10)
    window_trades: int = 100
    min_sharpe: float = 0.5
    min_hitrate: float = 0.52
    max_slippage_bps: float = 15.0
    max_daily_dd_pct: float = 1.0


@dataclass
class CanaryState:
    stage_idx: int = 0
    metrics_window: Deque[Dict] = field(default_factory=deque)
    halted: bool = False


def update_canary(canary: CanaryState, metrics: Dict, cfg: CanaryConfig) -> CanaryState:
    """Update canary state with new trade metrics."""

    canary.metrics_window.append(metrics)
    if len(canary.metrics_window) > cfg.window_trades:
        canary.metrics_window.popleft()

    if canary.halted:
        return canary

    # Compute window averages
    sharpe = sum(m.get("sharpe", 0.0) for m in canary.metrics_window) / len(canary.metrics_window)
    hitrate = sum(m.get("hitrate", 0.0) for m in canary.metrics_window) / len(canary.metrics_window)
    slippage = sum(m.get("slippage_bps", 0.0) for m in canary.metrics_window) / len(canary.metrics_window)
    dd = max(m.get("max_daily_dd_pct", 0.0) for m in canary.metrics_window)

    if (
        sharpe >= cfg.min_sharpe
        and hitrate >= cfg.min_hitrate
        and slippage <= cfg.max_slippage_bps
        and dd <= cfg.max_daily_dd_pct
        and canary.stage_idx < len(cfg.stages) - 1
    ):
        canary.stage_idx += 1
    elif slippage > cfg.max_slippage_bps or dd > cfg.max_daily_dd_pct:
        canary.halted = True
    return canary


def heartbeat_ok(last_bar_ts: int, now_ts: int, max_delay_sec: int, broker_ok: bool) -> bool:
    """Check data and broker heartbeats."""

    return (now_ts - last_bar_ts) <= max_delay_sec and broker_ok
