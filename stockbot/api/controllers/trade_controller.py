from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Any, List
import json

from fastapi import HTTPException
from pydantic import BaseModel

try:  # pragma: no cover - allow running with or without package prefix
    from stockbot.execution.live_guardrails import LiveGuardrails
except ModuleNotFoundError:  # when repository root not on sys.path
    import sys
    from pathlib import Path

    sys.path.append(str(Path(__file__).resolve().parents[3]))
    from stockbot.execution.live_guardrails import LiveGuardrails


@dataclass
class _LiveState:
    guardrails: LiveGuardrails | None = None
    running: bool = False


STATE = _LiveState()


class TradeStartRequest(BaseModel):
    # optional identifiers and artifact pointers
    run_id: Optional[str] = None
    policy_path: Optional[str] = None
    # broker context (proxied from Node backend; not used directly here)
    broker: Optional[str] = None
    credentials: Optional[Dict[str, Any]] = None
    # canary configuration (all optional overrides)
    stages: Optional[List[float]] = None
    window_trades: Optional[int] = None
    min_sharpe: Optional[float] = None
    min_hitrate: Optional[float] = None
    max_slippage_bps: Optional[float] = None
    daily_loss_limit_pct: Optional[float] = None
    vol_target_annual: Optional[float] = None
    vol_band_frac: Optional[float] = None
    # output folder (defaults to stockbot/runs/live/<id>)
    out_dir: Optional[str] = None


def start_live(req: TradeStartRequest):
    # Build guardrails and session directory
    gr = LiveGuardrails()
    overrides: Dict[str, Any] = {}
    if req.stages is not None:
        try:
            overrides["stages"] = tuple(float(x) for x in req.stages)
        except Exception:
            pass
    if req.window_trades is not None:
        overrides["window_trades"] = int(req.window_trades)
    if req.min_sharpe is not None:
        overrides["min_sharpe"] = float(req.min_sharpe)
    if req.min_hitrate is not None:
        overrides["min_hitrate"] = float(req.min_hitrate)
    if req.max_slippage_bps is not None:
        overrides["max_slippage_bps"] = float(req.max_slippage_bps)
    if req.daily_loss_limit_pct is not None:
        overrides["max_daily_dd_pct"] = float(req.daily_loss_limit_pct)
    if req.vol_target_annual is not None:
        overrides["vol_target_annual"] = float(req.vol_target_annual)
    if req.vol_band_frac is not None:
        overrides["vol_band_frac"] = float(req.vol_band_frac)

    # session meta for audit
    meta = {
        "run_id": req.run_id,
        "policy_path": req.policy_path,
        "broker": req.broker,
    }

    # Determine out_dir default under runs/live/<session>
    try:
        from api.controllers.stockbot_controller import RUNS_DIR
        base_dir = RUNS_DIR / "live"
    except Exception:
        from pathlib import Path
        base_dir = Path.cwd() / "stockbot" / "runs" / "live"

    session_id = None
    if req.run_id:
        session_id = f"canary_{req.run_id}"

    out_dir = None
    if req.out_dir:
        from pathlib import Path
        out_dir = Path(req.out_dir)
    else:
        out_dir = base_dir / (session_id or "canary_session")

    gr.start_session(out_dir=out_dir, cfg_overrides=overrides, session_id=session_id, meta=meta)
    # write initial audit line to seed the log/heartbeat context
    try:
        init_rec = {
            "ts": int(__import__("time").time()),
            "stage": gr.cfg.stages[0] if gr.cfg.stages else 0.0,
            "halted": False,
            "event": "start",
        }
        gr.audit_path.parent.mkdir(parents=True, exist_ok=True)
        with gr.audit_path.open("a") as f:
            f.write(json.dumps(init_rec) + "\n")
    except Exception:
        pass

    STATE.guardrails = gr
    STATE.running = True
    return {"status": "started", "session_id": gr.session_id, "details": {"audit_path": str(gr.audit_path), "metrics_path": str(gr.metrics_path)}}


class TradeStatusRequest(BaseModel):
    metrics: Dict[str, float]
    last_bar_ts: int
    now_ts: int
    broker_ok: bool
    target_capital: float


def status_live(req: TradeStatusRequest):
    if not STATE.running or STATE.guardrails is None:
        raise HTTPException(status_code=400, detail="live trading not started")
    stage = STATE.guardrails.record(
        req.metrics, req.last_bar_ts, req.now_ts, req.broker_ok, target_capital=req.target_capital
    )
    deploy = req.target_capital * stage
    snap = STATE.guardrails.snapshot()
    return {
        "status": "running",
        "stage": stage,
        "deploy_capital": deploy,
        "halted": STATE.guardrails.state.halted,
        "details": snap,
    }


def stop_live():
    # append a final audit record to indicate stop (best-effort)
    try:
        if STATE.guardrails is not None:
            gr = STATE.guardrails
            rec = {
                "ts": int(__import__("time").time()),
                "stage": 0.0 if gr.state.halted else gr.cfg.stages[gr.state.stage_idx],
                "halted": gr.state.halted,
                "event": "stop",
            }
            gr.audit_path.parent.mkdir(parents=True, exist_ok=True)
            with gr.audit_path.open("a") as f:
                f.write(json.dumps(rec) + "\n")
            # write a final summary snapshot
            snap = gr.snapshot()
            try:
                gr.metrics_path.write_text(json.dumps({"stopped_at": __import__("datetime").datetime.utcnow().isoformat(), **snap}, indent=2))
            except Exception:
                pass
    except Exception:
        pass
    STATE.guardrails = None
    STATE.running = False
    return {"status": "stopped"}

def get_status_snapshot() -> Dict[str, Any]:
    if not STATE.running or STATE.guardrails is None:
        return {"status": "stopped"}
    snap = STATE.guardrails.snapshot()
    return {"status": "running", "details": snap}

