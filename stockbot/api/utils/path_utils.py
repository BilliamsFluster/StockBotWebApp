from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import HTTPException


def guess_project_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if parent.name.casefold() == "stockbot":
            return parent.parent
        pkg = parent / "stockbot"
        if pkg.is_dir() and (pkg / "__init__.py").exists():
            return parent
    return Path.cwd()


PROJECT_ROOT = Path(os.environ.get("PROJECT_ROOT", guess_project_root()))
RUNS_DIR = PROJECT_ROOT / "stockbot" / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)


def resolve_under_project(path: str | Path) -> Path:
    p = Path(path)
    if not p.is_absolute():
        p = (PROJECT_ROOT / p).resolve()
    return p


ALLOWED_OUTPUT_ROOTS: List[Path] = [RUNS_DIR]
if os.environ.get("STOCKBOT_EXTRA_OUT_ROOT"):
    ALLOWED_OUTPUT_ROOTS.append(Path(os.environ["STOCKBOT_EXTRA_OUT_ROOT"]).resolve())


def sanitize_tag(tag: str) -> str:
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in tag)


def is_under(p: Path, root: Path) -> bool:
    try:
        p.resolve().relative_to(root.resolve())
        return True
    except Exception:
        return False


def validate_out_base(base: Path) -> None:
    if not ALLOWED_OUTPUT_ROOTS:
        return
    for root in ALLOWED_OUTPUT_ROOTS:
        if is_under(base, root):
            return
    raise HTTPException(
        status_code=400,
        detail=f"out_dir not allowed: {base}. Allowed roots: {', '.join(str(r) for r in ALLOWED_OUTPUT_ROOTS)}",
    )


def choose_outdir(req_out_dir: Optional[str], out_tag: Optional[str]) -> Path:
    if req_out_dir:
        base = Path(req_out_dir).expanduser().resolve()
        validate_out_base(base)
        base.mkdir(parents=True, exist_ok=True)
        final = base / sanitize_tag(out_tag) if out_tag else base
    else:
        tag = sanitize_tag(out_tag or "run")
        final = RUNS_DIR / tag
    final.mkdir(parents=True, exist_ok=True)
    return final


def artifact_paths(out_dir: Path) -> Dict[str, Path]:
    report = out_dir / "report"
    return {
        "metrics": report / "metrics.json",
        "equity": report / "equity.csv",
        "orders": report / "orders.csv",
        "trades": report / "trades.csv",
        "summary": report / "summary.json",
        "config": out_dir / "config.snapshot.yaml",
        "model": out_dir / "ppo_policy.zip",
        "job_log": out_dir / "job.log",
    }


__all__ = [
    "PROJECT_ROOT",
    "RUNS_DIR",
    "resolve_under_project",
    "choose_outdir",
    "artifact_paths",
    "ALLOWED_OUTPUT_ROOTS",
]
