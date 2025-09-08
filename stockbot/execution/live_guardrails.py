from __future__ import annotations

"""Live trading guardrails and canary deployment helpers."""

from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, Optional, Tuple
from pathlib import Path
from datetime import datetime
import json
import math


@dataclass
class CanaryConfig:
    stages: Tuple[float, ...] = (0.01, 0.02, 0.05, 0.10)
    window_trades: int = 100
    min_sharpe: float = 0.5
    min_hitrate: float = 0.52
    max_slippage_bps: float = 15.0
    max_daily_dd_pct: float = 1.0
    # Optional realized volatility guard: if provided, compare rolling vol to (1+band) * target
    vol_target_annual: Optional[float] = None
    vol_band_frac: float = 0.25


@dataclass
class CanaryState:
    stage_idx: int = 0
    metrics_window: Deque[Dict] = field(default_factory=deque)
    halted: bool = False
    last_event: Optional[str] = None
    last_bar_ts: Optional[int] = None
    last_heartbeat_ts: Optional[int] = None


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
    # prefer explicit daily loss metric; fallback to max daily drawdown
    dd = max(
        m.get("daily_loss_pct", m.get("max_daily_dd_pct", 0.0)) for m in canary.metrics_window
    )
    # realized vol if provided
    realized_vol = None
    if any("ret_bps" in m or "ret" in m or "pnl_bps" in m for m in canary.metrics_window):
        rets = []
        for m in canary.metrics_window:
            if "ret_bps" in m:
                rets.append(m.get("ret_bps", 0.0) / 10000.0)
            elif "pnl_bps" in m:
                rets.append(m.get("pnl_bps", 0.0) / 10000.0)
            elif "ret" in m:
                rets.append(m.get("ret", 0.0))
        if len(rets) > 1:
            mu = sum(rets) / len(rets)
            var = sum((r - mu) ** 2 for r in rets) / (len(rets) - 1)
            realized_vol = math.sqrt(max(var, 0.0))

    promote = (
        sharpe >= cfg.min_sharpe
        and hitrate >= cfg.min_hitrate
        and slippage <= cfg.max_slippage_bps
        and dd <= cfg.max_daily_dd_pct
    )
    if realized_vol is not None and cfg.vol_target_annual:
        # simple check: rolling vol within (1 + band) of target (units-neutral)
        promote = promote and realized_vol <= cfg.vol_target_annual * (1.0 + cfg.vol_band_frac)

    if promote and canary.stage_idx < len(cfg.stages) - 1:
        canary.stage_idx += 1
        canary.last_event = f"promote:stage_{canary.stage_idx}"
    elif slippage > cfg.max_slippage_bps:
        canary.halted = True
        canary.last_event = "halt:slippage"
    elif dd > cfg.max_daily_dd_pct:
        canary.halted = True
        canary.last_event = "halt:daily_loss"
    return canary


def heartbeat_ok(last_bar_ts: int, now_ts: int, max_delay_sec: int, broker_ok: bool) -> bool:
    """Check data and broker heartbeats."""

    return (now_ts - last_bar_ts) <= max_delay_sec and broker_ok


@dataclass
class LiveGuardrails:
    cfg: CanaryConfig = field(default_factory=CanaryConfig)
    state: CanaryState = field(default_factory=CanaryState)
    audit_path: Path = Path("live_audit.jsonl")
    max_delay_sec: int = 300
    metrics_path: Path = Path("live_metrics.json")
    summary_every: int = 20
    _n_records: int = 0
    _last_target_capital: float = 0.0
    session_id: Optional[str] = None
    session_meta_path: Optional[Path] = None

    def start_session(
        self,
        out_dir: Path,
        cfg_overrides: Optional[Dict] = None,
        session_id: Optional[str] = None,
        meta: Optional[Dict] = None,
    ) -> None:
        """Initialize paths and optionally override config and write a session meta file."""
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        self.audit_path = out_dir / "live_audit.jsonl"
        self.metrics_path = out_dir / "live_metrics.json"
        self.session_meta_path = out_dir / "live_session.json"
        if cfg_overrides:
            try:
                # shallow update for known keys
                for k, v in cfg_overrides.items():
                    if hasattr(self.cfg, k):
                        setattr(self.cfg, k, v)
            except Exception:
                pass
        self.session_id = session_id or datetime.utcnow().strftime("live_%Y%m%d_%H%M%S")
        # write meta
        git_sha = None
        try:
            import subprocess
            git_sha = (
                subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=str(out_dir), stderr=subprocess.DEVNULL)
                .decode()
                .strip()
            )
        except Exception:
            git_sha = None

        meta_obj = {
            "session_id": self.session_id,
            "created_at": datetime.utcnow().isoformat(),
            "git_sha": git_sha,
            "config": {
                "stages": list(self.cfg.stages),
                "window_trades": self.cfg.window_trades,
                "min_sharpe": self.cfg.min_sharpe,
                "min_hitrate": self.cfg.min_hitrate,
                "max_slippage_bps": self.cfg.max_slippage_bps,
                "max_daily_dd_pct": self.cfg.max_daily_dd_pct,
                "vol_target_annual": self.cfg.vol_target_annual,
                "vol_band_frac": self.cfg.vol_band_frac,
            },
            "meta": meta or {},
        }
        try:
            self.session_meta_path.write_text(json.dumps(meta_obj, indent=2))
        except Exception:
            pass

    def record(self, metrics: Dict, last_bar_ts: int, now_ts: int, broker_ok: bool, target_capital: float = 0.0) -> float:
        """Update guardrails and append an audit log line.

        Returns the capital stage fraction to deploy.
        """

        self.state.last_bar_ts = last_bar_ts
        self.state.last_heartbeat_ts = now_ts
        risk_flags = []
        if not heartbeat_ok(last_bar_ts, now_ts, self.max_delay_sec, broker_ok):
            self.state.halted = True
            self.state.last_event = "halt:heartbeat"
            risk_flags.append("heartbeat")

        before_stage_idx = self.state.stage_idx
        self.state = update_canary(self.state, metrics, self.cfg)
        if self.state.halted and self.state.last_event and self.state.last_event.startswith("halt:"):
            risk_flags.append(self.state.last_event.split(":", 1)[1])
        elif self.state.stage_idx != before_stage_idx:
            # promotion event
            pass

        stage = 0.0 if self.state.halted else self.cfg.stages[self.state.stage_idx]
        self._last_target_capital = float(target_capital or 0.0)
        deploy_capital = self._last_target_capital * stage
        rec = {
            "ts": now_ts,
            "stage": stage,
            "halted": self.state.halted,
            "target_capital": self._last_target_capital,
            "deploy_capital": deploy_capital,
            "risk_flags": risk_flags,
        }
        rec.update(metrics)
        self.audit_path.parent.mkdir(parents=True, exist_ok=True)
        with self.audit_path.open("a") as f:
            f.write(json.dumps(rec) + "\n")
        self._n_records += 1

        # Periodic metrics summary (best-effort)
        if self._n_records % max(1, int(self.summary_every)) == 0:
            self._write_summary()
        return stage

    def _write_summary(self) -> None:
        """Compute a rolling metrics summary and write to metrics_path."""
        win = list(self.state.metrics_window)
        if not win:
            return
        n = len(win)
        avg_slip = sum(m.get("slippage_bps", 0.0) for m in win) / n
        hitrate = sum(m.get("hitrate", 0.0) for m in win) / n
        sharpe = sum(m.get("sharpe", 0.0) for m in win) / n
        # compute realized vol on available returns
        rets = []
        for m in win:
            if "ret_bps" in m:
                rets.append(m.get("ret_bps", 0.0) / 10000.0)
            elif "pnl_bps" in m:
                rets.append(m.get("pnl_bps", 0.0) / 10000.0)
            elif "ret" in m:
                rets.append(m.get("ret", 0.0))
        realized_vol = None
        if len(rets) > 1:
            mu = sum(rets) / len(rets)
            var = sum((r - mu) ** 2 for r in rets) / (len(rets) - 1)
            realized_vol = math.sqrt(max(var, 0.0))
        summary = {
            "updated_at": datetime.utcnow().isoformat(),
            "stage": self.cfg.stages[self.state.stage_idx] if not self.state.halted else 0.0,
            "stage_idx": self.state.stage_idx,
            "halted": self.state.halted,
            "last_event": self.state.last_event,
            "avg_slippage_bps": avg_slip,
            "hit_rate": hitrate,
            "rolling_sharpe": sharpe,
            "realized_vol": realized_vol,
            "last_heartbeat_ts": self.state.last_heartbeat_ts,
            "last_bar_ts": self.state.last_bar_ts,
            "target_capital": self._last_target_capital,
            "deploy_capital": self._last_target_capital * (0.0 if self.state.halted else self.cfg.stages[self.state.stage_idx]),
        }
        try:
            self.metrics_path.parent.mkdir(parents=True, exist_ok=True)
            self.metrics_path.write_text(json.dumps(summary, indent=2))
        except Exception:
            pass

    def snapshot(self) -> Dict:
        """Return a snapshot for GET /status."""
        stage = 0.0 if self.state.halted else self.cfg.stages[self.state.stage_idx]
        return {
            "stage_idx": self.state.stage_idx,
            "stage": stage,
            "halted": self.state.halted,
            "last_event": self.state.last_event,
            "last_heartbeat_ts": self.state.last_heartbeat_ts,
            "last_bar_ts": self.state.last_bar_ts,
            "target_capital": self._last_target_capital,
            "deploy_capital": self._last_target_capital * stage,
            "audit_path": str(self.audit_path),
            "metrics_path": str(self.metrics_path),
            "session_id": self.session_id,
        }
