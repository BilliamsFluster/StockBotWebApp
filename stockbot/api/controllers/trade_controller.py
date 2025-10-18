from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

from fastapi import HTTPException
from pydantic import BaseModel

try:
    from stockbot.env.config import EnvConfig
except ModuleNotFoundError:  # pragma: no cover
    import sys
    sys.path.append(str(Path(__file__).resolve().parents[3]))
    from stockbot.env.config import EnvConfig

from stockbot.execution.live_runner import LiveRunnerError, ensure_manager

try:  # Prefer direct import; fallback avoids circulars during tests
    from .stockbot_controller import RUN_MANAGER
except ImportError:  # pragma: no cover
    from api.controllers.stockbot_controller import RUN_MANAGER


class TradeStartRequest(BaseModel):
    broker: str
    credentials: Dict[str, str]
    run_id: Optional[str] = None
    policy_path: Optional[str] = None


class TradeStatusRequest(BaseModel):
    pass


def _resolve_policy_and_run_dir(req: TradeStartRequest) -> tuple[Path, Path]:
    run_dir: Optional[Path] = None
    if req.run_id:
        try:
            run = RUN_MANAGER.get(req.run_id)
        except HTTPException as exc:  # surface 400 instead of 404 for client ergonomics
            if exc.status_code == 404:
                raise HTTPException(status_code=400, detail="run_id not found")
            raise
        run_dir = Path(run.out_dir)
    policy_path = Path(req.policy_path) if req.policy_path else None

    if policy_path is not None and not policy_path.is_absolute():
        if run_dir is None:
            policy_path = policy_path.resolve()
        else:
            policy_path = (run_dir / policy_path).resolve()
    if policy_path is None:
        if run_dir is None:
            raise HTTPException(status_code=400, detail="policy_path or run_id required")
        policy_path = (run_dir / "ppo_policy.zip").resolve()

    if run_dir is None:
        run_dir = policy_path.parent

    if not policy_path.exists():
        raise HTTPException(status_code=400, detail=f"Policy not found at {policy_path}")
    if not run_dir.exists():
        raise HTTPException(status_code=400, detail=f"Run directory {run_dir} does not exist")

    return policy_path, run_dir


def start_live(req: TradeStartRequest):
    policy_path, run_dir = _resolve_policy_and_run_dir(req)
    cfg_path = run_dir / "config.snapshot.yaml"
    if not cfg_path.exists():
        raise HTTPException(status_code=400, detail="config.snapshot.yaml missing in run directory")

    try:
        env_cfg = EnvConfig.from_yaml(cfg_path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to load env config: {exc}")

    manager = ensure_manager()
    try:
        status = manager.start_session(
            broker=req.broker,
            credentials=req.credentials,
            env_config=env_cfg,
            policy_path=policy_path,
            run_dir=run_dir,
            run_id=req.run_id,
        )
    except LiveRunnerError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return status


def status_live(_req: Optional[TradeStatusRequest] = None):
    manager = ensure_manager()
    return manager.status()


def stop_live():
    manager = ensure_manager()
    return manager.stop_session()
