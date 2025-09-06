from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

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
    pass


def start_live(req: TradeStartRequest):
    STATE.guardrails = LiveGuardrails()
    STATE.running = True
    return {"status": "started"}


class TradeStatusRequest(BaseModel):
    metrics: Dict[str, float]
    last_bar_ts: int
    now_ts: int
    broker_ok: bool
    target_capital: float


def status_live(req: TradeStatusRequest):
    if not STATE.running or STATE.guardrails is None:
        raise HTTPException(status_code=400, detail="live trading not started")
    stage = STATE.guardrails.record(req.metrics, req.last_bar_ts, req.now_ts, req.broker_ok)
    deploy = req.target_capital * stage
    return {"stage": stage, "deploy_capital": deploy, "halted": STATE.guardrails.state.halted}


def stop_live():
    STATE.guardrails = None
    STATE.running = False
    return {"status": "stopped"}

