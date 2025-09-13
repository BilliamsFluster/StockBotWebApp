from __future__ import annotations

"""
Lightweight telemetry writer for per-bar runtime events.

Writes JSONL lines to files referenced by env vars so subprocesses can
append without needing in-process pub/sub.
"""

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional


def _path_from_env(var: str) -> Optional[Path]:
    p = os.environ.get(var, "").strip()
    if not p:
        return None
    try:
        path = Path(p).expanduser().resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        return path
    except Exception:
        return None


class TelemetryWriter:
    """Append-only JSONL writer for telemetry.

    Environment variables used:
      - STOCKBOT_TELEMETRY_PATH: file for per-bar telemetry lines
      - STOCKBOT_EVENT_PATH: file for event lines (gate triggers, halts, etc.)
      - STOCKBOT_ROLLUP_PATH: file for periodic rollups
      - STOCKBOT_RUN_ID: current run id (optional, included in records)
    """

    def __init__(self) -> None:
        self.run_id = os.environ.get("STOCKBOT_RUN_ID") or None
        self.telemetry_path = _path_from_env("STOCKBOT_TELEMETRY_PATH")
        self.event_path = _path_from_env("STOCKBOT_EVENT_PATH")
        self.rollup_path = _path_from_env("STOCKBOT_ROLLUP_PATH")
        # ensure files exist so proxies can stream immediately
        try:
            if self.telemetry_path and not self.telemetry_path.exists():
                self.telemetry_path.touch()
            if self.event_path and not self.event_path.exists():
                self.event_path.touch()
            if self.rollup_path and not self.rollup_path.exists():
                self.rollup_path.touch()
        except Exception:
            pass

    def _append(self, path: Optional[Path], obj: Dict[str, Any]) -> None:
        if path is None:
            return
        try:
            # ensure a small header for schema/run id
            rec = dict(obj)
            if self.run_id and "run_id" not in rec:
                rec["run_id"] = self.run_id
            line = json.dumps(rec, default=_json_default)
            # keep each line under ~10KB
            if len(line) > 10_000:
                rec["_truncated"] = True
                line = json.dumps(rec, default=_json_default)
            with path.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            # best-effort; never raise from writer
            pass

    def emit_bar(self, payload: Dict[str, Any]) -> None:
        payload = dict(payload)
        payload.setdefault("kind", "bar")
        payload.setdefault("emitted_at", int(time.time() * 1000))
        self._append(self.telemetry_path, payload)

    def emit_event(self, payload: Dict[str, Any]) -> None:
        payload = dict(payload)
        payload.setdefault("kind", "event")
        payload.setdefault("emitted_at", int(time.time() * 1000))
        self._append(self.event_path, payload)

    def emit_rollup(self, payload: Dict[str, Any]) -> None:
        payload = dict(payload)
        payload.setdefault("kind", "rollup")
        payload.setdefault("emitted_at", int(time.time() * 1000))
        self._append(self.rollup_path or self.telemetry_path, payload)


def _json_default(o: Any):
    try:
        import numpy as _np  # type: ignore
        if isinstance(o, (_np.floating, _np.integer)):
            return float(o)
        if isinstance(o, _np.ndarray):
            return o.tolist()
    except Exception:
        pass
    if hasattr(o, "isoformat"):
        try:
            return o.isoformat()
        except Exception:
            return str(o)
    return str(o)
