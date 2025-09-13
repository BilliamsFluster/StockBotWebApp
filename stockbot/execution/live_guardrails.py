from __future__ import annotations

"""Live trading guardrails and canary deployment helpers."""

from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict
from pathlib import Path
import json
import os


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


def _default_audit_path() -> Path:
    root = Path(__file__).resolve().parents[1] / "runs"
    run_id = os.environ.get("STOCKBOT_RUN_ID") or ""
    return (root / run_id / "live_audit.jsonl") if run_id else (root / "live_audit.jsonl")


@dataclass
class LiveGuardrails:
    cfg: CanaryConfig = field(default_factory=CanaryConfig)
    state: CanaryState = field(default_factory=CanaryState)
    audit_path: Path = field(default_factory=_default_audit_path)
    max_delay_sec: int = 300

    def record(self, metrics: Dict, last_bar_ts: int, now_ts: int, broker_ok: bool) -> float:
        """Update guardrails and append an audit log line.

        Returns the capital stage fraction to deploy.
        """

        if not heartbeat_ok(last_bar_ts, now_ts, self.max_delay_sec, broker_ok):
            self.state.halted = True

        self.state = update_canary(self.state, metrics, self.cfg)

        stage = 0.0 if self.state.halted else self.cfg.stages[self.state.stage_idx]
        rec = {
            "ts": now_ts,
            "stage": stage,
            "halted": self.state.halted,
        }
        rec.update(metrics)
        self.audit_path.parent.mkdir(parents=True, exist_ok=True)
        with self.audit_path.open("a") as f:
            f.write(json.dumps(rec) + "\n")
        return stage
