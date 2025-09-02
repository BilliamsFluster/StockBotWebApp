from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

import yaml
from fastapi import HTTPException

from api.models.run_models import TrainRequest
from .path_utils import resolve_under_project


def deep_merge(dst: Dict[str, Any], src: Dict[str, Any]) -> Dict[str, Any]:
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            deep_merge(dst[k], v)  # type: ignore[index]
        else:
            dst[k] = v
    return dst


def load_yaml(path: str | Path) -> Dict[str, Any]:
    p = resolve_under_project(path)
    if not p.exists():
        raise HTTPException(status_code=400, detail=f"config_path not found: {p}")
    try:
        return yaml.safe_load(p.read_text()) or {}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse YAML: {e}")


def dump_yaml(d: Dict[str, Any], path: Path) -> None:
    try:
        path.write_text(yaml.safe_dump(d, sort_keys=False))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write YAML snapshot: {e}")


def build_env_overrides(req: TrainRequest) -> Dict[str, Any]:
    env: Dict[str, Any] = {}
    if req.symbols is not None:
        env["symbols"] = list(req.symbols)
    if req.start is not None:
        env["start"] = req.start
    if req.end is not None:
        env["end"] = req.end
    if req.interval is not None:
        env["interval"] = req.interval
    if req.adjusted is not None:
        env["adjusted"] = bool(req.adjusted)
    if req.fees is not None:
        env["fees"] = req.fees.model_dump()
    if req.margin is not None:
        env["margin"] = req.margin.model_dump()
    if req.exec is not None:
        env["exec"] = req.exec.model_dump()
    if req.episode is not None:
        env["episode"] = req.episode.model_dump()
    if req.features is not None:
        env["features"] = req.features.model_dump()
    if req.reward is not None:
        env["reward"] = req.reward.model_dump()
    return env


__all__ = ["deep_merge", "load_yaml", "dump_yaml", "build_env_overrides"]
