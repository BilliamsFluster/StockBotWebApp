from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional, Literal

from fastapi import HTTPException
from pydantic import BaseModel

from run_registry import RunRegistry

RunType = Literal["train", "backtest"]
RunStatus = Literal["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]

class RunRecord(BaseModel):
    id: str
    type: RunType
    status: RunStatus
    out_dir: str
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    meta: Optional[dict] = None
    error: Optional[str] = None
    pid: Optional[int] = None

class RunManager:
    """Simple in-memory run registry backed by RunRegistry."""

    def __init__(self, runs_dir: Path) -> None:
        self.runs_dir = runs_dir
        self.registry = RunRegistry(runs_dir / "runs.db")
        self._runs: Dict[str, RunRecord] = {}

    def store(self, rec: RunRecord) -> None:
        """Persist run record to memory and registry."""
        self._runs[rec.id] = rec
        try:
            self.registry.save(rec)
        except Exception:
            pass

    def get(self, run_id: str) -> RunRecord:
        r = self._runs.get(run_id)
        if r:
            return r
        try:
            data = self.registry.get(run_id)
            if data:
                r = RunRecord(**data)
                self._runs[run_id] = r
                return r
        except Exception:
            pass
        raise HTTPException(status_code=404, detail="Run not found")

    def list(self) -> list[dict]:
        try:
            return self.registry.list()
        except Exception:
            rows = sorted(self._runs.values(), key=lambda r: r.created_at, reverse=True)
            return [
                {
                    "id": r.id,
                    "type": r.type,
                    "status": r.status,
                    "out_dir": r.out_dir,
                    "created_at": r.created_at,
                    "started_at": r.started_at,
                    "finished_at": r.finished_at,
                }
                for r in rows
            ]

    def remove(self, run_id: str) -> None:
        try:
            self.registry.delete(run_id)
        except Exception:
            pass
        self._runs.pop(run_id, None)

    # ---------------- artifacts -----------------
    def artifact_paths(self, out_dir: Path) -> Dict[str, Path]:
        report = out_dir / "report"
        return {
            "metrics":  report / "metrics.json",
            "equity":   report / "equity.csv",
            "orders":   report / "orders.csv",
            "trades":   report / "trades.csv",
            "summary":  report / "summary.json",
            "config":   out_dir / "config.snapshot.yaml",
            "model":    out_dir / "ppo_policy.zip",
            "job_log":  out_dir / "job.log",
        }

    def artifact_map_for_run(self, run_id: str) -> Dict[str, Path]:
        r = self.get(run_id)
        return self.artifact_paths(Path(r.out_dir))
