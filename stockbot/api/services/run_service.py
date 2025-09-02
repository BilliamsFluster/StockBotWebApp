from __future__ import annotations

import os
import shlex
import subprocess
import zipfile
import secrets
from datetime import datetime
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Dict, List, Optional

from fastapi import BackgroundTasks, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse

from api.models.run_models import BacktestRequest, RunRecord, TrainRequest
from api.utils.path_utils import (
    PROJECT_ROOT,
    RUNS_DIR,
    choose_outdir,
    artifact_paths,
    resolve_under_project,
)
from api.utils.config_utils import build_env_overrides, deep_merge, load_yaml, dump_yaml
from run_registry import RunRegistry

RUN_REGISTRY = RunRegistry(RUNS_DIR / "runs.db")
RUNS: Dict[str, RunRecord] = {}


def _store_run(rec: RunRecord) -> None:
    RUNS[rec.id] = rec
    try:
        RUN_REGISTRY.save(rec)
    except Exception:
        pass


def _get_run_record(run_id: str) -> RunRecord:
    r = RUNS.get(run_id)
    if r:
        return r
    try:
        data = RUN_REGISTRY.get(run_id)
        if data:
            r = RunRecord(**data)
            RUNS[run_id] = r
            return r
    except Exception:
        pass
    raise HTTPException(status_code=404, detail="run not found")


def get_run_record(run_id: str) -> RunRecord:
    """Public accessor for run records."""
    return _get_run_record(run_id)


def _run_subprocess_sync(args: List[str], rec: RunRecord):
    rec.status = "RUNNING"
    rec.started_at = datetime.utcnow().isoformat()
    _store_run(rec)
    python_bin = os.environ.get("PYTHON", os.sys.executable)
    out_dir = Path(rec.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    log_path = out_dir / "job.log"
    env = os.environ.copy()
    repo_root = str(PROJECT_ROOT)
    prev_pp = env.get("PYTHONPATH", "")
    if repo_root not in prev_pp.split(os.pathsep):
        env["PYTHONPATH"] = repo_root + (os.pathsep + prev_pp if prev_pp else "")
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    env["PYTHONLEGACYWINDOWSSTDIO"] = "1"
    clean_args = [str(a) for a in args if a is not None]
    try:
        cmdline = " ".join([shlex.quote(python_bin), *(shlex.quote(x) for x in clean_args)])
    except Exception:
        cmdline = f"{python_bin} " + " ".join(clean_args)
    with log_path.open("ab") as log:
        log.write(f"[{datetime.utcnow().isoformat()}] CMD: {cmdline}\n".encode())
        try:
            proc = subprocess.Popen(
                [python_bin, *clean_args],
                cwd=str(PROJECT_ROOT),
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
                shell=False,
            )
            rec.pid = proc.pid
            code = proc.wait()
            log.write(f"[{datetime.utcnow().isoformat()}] EXIT: {code}\n".encode())
            rec.finished_at = datetime.utcnow().isoformat()
            rec.status = "SUCCEEDED" if code == 0 else "FAILED"
            rec.error = None if code == 0 else f"Exited with code {code}"
        except Exception as e:
            log.write(f"[{datetime.utcnow().isoformat()}] ERROR: {e!r}\n".encode())
            rec.finished_at = datetime.utcnow().isoformat()
            rec.status = "FAILED"
            rec.error = repr(e)
        _store_run(rec)


async def start_train_job(req: TrainRequest, bg: BackgroundTasks):
    import uuid

    out_dir = choose_outdir(req.out_dir, req.out_tag)
    run_id = uuid.uuid4().hex[:10]
    base_cfg = load_yaml(req.config_path)
    overrides = build_env_overrides(req)
    merged_cfg = deep_merge(base_cfg, overrides)
    snapshot_path = Path(out_dir) / "config.snapshot.yaml"
    dump_yaml(merged_cfg, snapshot_path)
    rec = RunRecord(
        id=run_id,
        type="train",
        status="QUEUED",
        out_dir=str(out_dir),
        created_at=datetime.utcnow().isoformat(),
        meta={**req.model_dump(), "config_snapshot": str(snapshot_path)},
    )
    _store_run(rec)
    args = [
        "-m",
        "stockbot.rl.train_ppo",
        "--config",
        str(snapshot_path.resolve()),
        "--out",
        str(Path(out_dir).resolve()),
        "--timesteps",
        str(req.timesteps),
        "--seed",
        str(req.seed),
    ]
    if req.normalize:
        args.append("--normalize")
    if req.policy:
        args.extend(["--policy", req.policy])
    if req.n_steps is not None:
        args.extend(["--n-steps", str(req.n_steps)])
    if req.batch_size is not None:
        args.extend(["--batch-size", str(req.batch_size)])
    if req.learning_rate is not None:
        args.extend(["--learning-rate", str(req.learning_rate)])
    if req.gamma is not None:
        args.extend(["--gamma", str(req.gamma)])
    if req.gae_lambda is not None:
        args.extend(["--gae-lambda", str(req.gae_lambda)])
    if req.clip_range is not None:
        args.extend(["--clip-range", str(req.clip_range)])
    if req.entropy_coef is not None:
        args.extend(["--entropy-coef", str(req.entropy_coef)])
    if req.vf_coef is not None:
        args.extend(["--vf-coef", str(req.vf_coef)])
    if req.max_grad_norm is not None:
        args.extend(["--max-grad-norm", str(req.max_grad_norm)])
    if req.dropout is not None:
        args.extend(["--dropout", str(req.dropout)])
    if req.train_start and req.train_end and req.eval_start and req.eval_end:
        args.extend(
            [
                "--train-start",
                req.train_start,
                "--train-end",
                req.train_end,
                "--eval-start",
                req.eval_start,
                "--eval-end",
                req.eval_end,
            ]
        )
    bg.add_task(_run_subprocess_sync, args, rec)
    return JSONResponse({"job_id": run_id})


async def start_backtest_job(req: BacktestRequest, bg: BackgroundTasks):
    import uuid

    out_dir = choose_outdir(req.out_dir, req.out_tag)
    run_id = uuid.uuid4().hex[:10]
    policy = req.policy or "equal"
    symbols = [s.strip() for s in (req.symbols or []) if isinstance(s, str) and s.strip()] if req.symbols else None
    start = (req.start or "").strip() if req.start else None
    end = (req.end or "").strip() if req.end else None
    cfg_path = resolve_under_project(req.config_path or "stockbot/env/env.example.yaml")
    try:
        tmpl_cfg = load_yaml(cfg_path)
    except Exception:
        tmpl_cfg = {}
    def _norm_syms(x):
        return [str(s).strip() for s in (x or []) if str(s).strip()]
    tmpl_syms = _norm_syms(tmpl_cfg.get("symbols", []))
    tmpl_start = str(tmpl_cfg.get("start") or "").strip()
    tmpl_end = str(tmpl_cfg.get("end") or "").strip()
    if getattr(req, "run_id", None):
        try:
            prev = _get_run_record(req.run_id)
        except HTTPException:
            raise HTTPException(status_code=400, detail="run_id not found")
        prev_out = Path(prev.out_dir)
        snap = prev_out / "config.snapshot.yaml"
        if not snap.exists():
            raise HTTPException(status_code=400, detail="config.snapshot.yaml not found for run")
        cfg_path = snap.resolve()
        try:
            snap_cfg = load_yaml(snap)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse snapshot: {e}")
        snap_syms = _norm_syms(snap_cfg.get("symbols", []))
        snap_start = str(snap_cfg.get("start") or "").strip()
        snap_end = str(snap_cfg.get("end") or "").strip()
        if symbols is None or symbols == tmpl_syms:
            symbols = snap_syms
        if not start or start == tmpl_start:
            start = snap_start
        if not end or end == tmpl_end:
            end = snap_end
        model_path = prev_out / "ppo_policy.zip"
        if (not req.policy or req.policy in ("", "equal", "flat", "first_long")) and model_path.exists():
            policy = str(model_path.resolve())
    if not start or not end:
        raise HTTPException(status_code=400, detail="start and end are required (YYYY-MM-DD).")
    if not symbols:
        raise HTTPException(status_code=400, detail="At least one symbol is required.")
    rec = RunRecord(
        id=run_id,
        type="backtest",
        status="QUEUED",
        out_dir=str(out_dir),
        created_at=datetime.utcnow().isoformat(),
        meta={
            **req.model_dump(),
            "resolved_config": str(cfg_path),
            "resolved_symbols": symbols,
            "resolved_start": start,
            "resolved_end": end,
            "resolved_policy": policy,
        },
    )
    _store_run(rec)
    args = [
        "-m",
        "stockbot.backtest.run",
        "--config",
        str(cfg_path),
        "--policy",
        str(policy),
        "--out",
        str(Path(out_dir).resolve()),
        "--start",
        str(start),
        "--end",
        str(end),
        "--symbols",
        *[str(s) for s in symbols],
    ]
    if req.normalize:
        args.append("--normalize")
    bg.add_task(_run_subprocess_sync, args, rec)
    return JSONResponse({"job_id": run_id})


def list_runs():
    try:
        return RUN_REGISTRY.list()
    except Exception:
        rows = sorted(RUNS.values(), key=lambda r: r.created_at, reverse=True)
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


def get_run(run_id: str):
    r = _get_run_record(run_id)
    return {
        "id": r.id,
        "type": r.type,
        "status": r.status,
        "out_dir": r.out_dir,
        "created_at": r.created_at,
        "started_at": r.started_at,
        "finished_at": r.finished_at,
        "error": r.error,
    }


SAFE_NAME_MAP = {
    "metrics": "report/metrics.json",
    "equity": "report/equity.csv",
    "orders": "report/orders.csv",
    "trades": "report/trades.csv",
    "summary": "report/summary.json",
    "config": "config.snapshot.yaml",
    "model": "ppo_policy.zip",
    "job_log": "job.log",
}


def get_artifacts(run_id: str):
    paths = artifact_paths(Path(_get_run_record(run_id).out_dir))
    def mkapi(name: str, p: Path):
        return f"/api/stockbot/runs/{run_id}/files/{name}" if p.exists() else None
    return {k: mkapi(k, v) for k, v in paths.items()}


def get_artifact_file(run_id: str, name: str):
    r = _get_run_record(run_id)
    rel = SAFE_NAME_MAP.get(name)
    if not rel:
        raise HTTPException(status_code=404, detail="Unknown artifact")
    path = Path(r.out_dir) / rel
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path), filename=path.name)


def cancel_run(run_id: str):
    r = _get_run_record(run_id)
    if r.status in ("SUCCEEDED", "FAILED", "CANCELLED"):
        return JSONResponse({"ok": True, "status": r.status})
    pid = r.pid
    if not pid:
        r.status = "CANCELLED"
        _store_run(r)
        return JSONResponse({"ok": True, "status": r.status})
    try:
        import signal

        os.kill(int(pid), signal.SIGTERM)
        r.status = "CANCELLED"
        r.finished_at = datetime.utcnow().isoformat()
        _store_run(r)
        return JSONResponse({"ok": True, "status": r.status})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cancel: {e}")


def delete_run(run_id: str):
    r = _get_run_record(run_id)
    if r.status in ("RUNNING", "QUEUED", "PENDING"):
        raise HTTPException(status_code=400, detail="Cannot delete active run")
    try:
        if r.out_dir:
            out_path = Path(r.out_dir)
            if out_path.exists():
                import shutil

                shutil.rmtree(out_path, ignore_errors=True)
    except Exception:
        pass
    try:
        RUN_REGISTRY.delete(run_id)
    except Exception:
        pass
    RUNS.pop(run_id, None)
    return JSONResponse({"ok": True})


def bundle_zip(run_id: str, include_model: bool = True) -> FileResponse:
    r = _get_run_record(run_id)
    out_dir = Path(r.out_dir)
    paths = artifact_paths(out_dir)
    tmp = NamedTemporaryFile(prefix=f"stockbot_{run_id}_", suffix=".zip", delete=False)
    tmp_path = Path(tmp.name)
    tmp.close()
    with zipfile.ZipFile(tmp_path, mode="w", compression=zipfile.ZIP_DEFLATED) as z:
        for name, p in paths.items():
            if not p.exists():
                continue
            if not include_model and name == "model":
                continue
            if name in ("metrics", "equity", "orders", "trades", "summary"):
                arcname = f"report/{p.name}"
            else:
                arcname = p.name
            z.write(p, arcname)
    filename = f"{out_dir.name}.zip"
    return FileResponse(str(tmp_path), filename=filename, media_type="application/zip")


POLICIES_DIR = PROJECT_ROOT / "stockbot" / "policies"
POLICIES_DIR.mkdir(parents=True, exist_ok=True)


def _sanitize_filename(name: str) -> str:
    base = "".join(c if c.isalnum() or c in "._- " else "_" for c in name)
    if not base.lower().endswith(".zip"):
        base += ".zip"
    return base


async def save_policy_upload(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted.")
    safe_name = _sanitize_filename(file.filename)
    token = secrets.token_hex(6)
    final_name = f"{Path(safe_name).stem}_{token}.zip"
    dest = POLICIES_DIR / final_name
    with dest.open("wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
    return JSONResponse({"policy_path": str(dest.resolve())})


__all__ = [
    "start_train_job",
    "start_backtest_job",
    "list_runs",
    "get_run",
    "get_run_record",
    "get_artifacts",
    "get_artifact_file",
    "bundle_zip",
    "cancel_run",
    "delete_run",
    "save_policy_upload",
    "RUNS",
    "RUNS_DIR",
]
