import os
import sys
import shlex
import subprocess
import zipfile
from tempfile import NamedTemporaryFile
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict, Literal
import secrets


from fastapi import BackgroundTasks, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field

# ---------------- Paths ----------------

def _guess_project_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if parent.name.casefold() == "stockbot":
            return parent.parent
        pkg = parent / "stockbot"
        if pkg.is_dir() and (pkg / "__init__.py").exists():
            return parent
    return Path.cwd()

PROJECT_ROOT = Path(os.environ.get("PROJECT_ROOT", _guess_project_root()))
RUNS_DIR = PROJECT_ROOT / "stockbot" / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)

# Allow-list server-write roots (optional but recommended)
ALLOWED_OUTPUT_ROOTS: List[Path] = [RUNS_DIR]
if os.environ.get("STOCKBOT_EXTRA_OUT_ROOT"):
    ALLOWED_OUTPUT_ROOTS.append(Path(os.environ["STOCKBOT_EXTRA_OUT_ROOT"]).resolve())

# ---------------- Types ----------------

RunType = Literal["train", "backtest"]
RunStatus = Literal["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]

class TrainRequest(BaseModel):
    config_path: str = "stockbot/env/env.example.yaml"
    normalize: bool = True
    policy: Literal["mlp", "window_cnn"] = "window_cnn"
    timesteps: int = 150_000
    seed: int = 42
    out_tag: Optional[str] = None
    out_dir: Optional[str] = None  # optional; if omitted -> RUNS_DIR/<tag>
    # Optional explicit split:
    train_start: Optional[str] = None
    train_end: Optional[str] = None
    eval_start: Optional[str] = None
    eval_end: Optional[str] = None

class BacktestRequest(BaseModel):
    config_path: str = "stockbot/env/env.example.yaml"
    policy: str = "equal"
    symbols: List[str] = Field(default_factory=lambda: ["AAPL", "MSFT"])
    start: str
    end: str
    out_tag: Optional[str] = None
    out_dir: Optional[str] = None  # optional; if omitted -> RUNS_DIR/<tag>

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

RUNS: Dict[str, RunRecord] = {}

# -------------- Helpers ---------------

def _sanitize_tag(tag: str) -> str:
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in tag)

def _is_under(p: Path, root: Path) -> bool:
    try:
        p.resolve().relative_to(root.resolve())
        return True
    except Exception:
        return False

def _validate_out_base(base: Path) -> None:
    if not ALLOWED_OUTPUT_ROOTS:
        return
    for root in ALLOWED_OUTPUT_ROOTS:
        if _is_under(base, root):
            return
    raise HTTPException(
        status_code=400,
        detail=f"out_dir not allowed: {base}. Allowed roots: {', '.join(str(r) for r in ALLOWED_OUTPUT_ROOTS)}"
    )

def _choose_outdir(req_out_dir: Optional[str], out_tag: Optional[str]) -> Path:
    if req_out_dir:
        base = Path(req_out_dir).expanduser().resolve()
        _validate_out_base(base)
        base.mkdir(parents=True, exist_ok=True)
        final = base / _sanitize_tag(out_tag) if out_tag else base
    else:
        tag = _sanitize_tag(out_tag or "run")
        final = RUNS_DIR / tag
    final.mkdir(parents=True, exist_ok=True)
    return final

def _artifact_paths(out_dir: Path) -> Dict[str, Path]:
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

# -------- Subprocess runner ---------

def _run_subprocess_sync(args: List[str], rec: RunRecord):
    rec.status = "RUNNING"
    rec.started_at = datetime.utcnow().isoformat()
    RUNS[rec.id] = rec

    python_bin = sys.executable
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

    try:
        cmdline = " ".join([shlex.quote(python_bin), *(shlex.quote(a) for a in args)])
    except Exception:
        cmdline = f"{python_bin} " + " ".join(args)

    with log_path.open("ab") as log:
        log.write(f"[{datetime.utcnow().isoformat()}] CMD: {cmdline}\n".encode())
        proc = subprocess.Popen(
            [python_bin, *args],
            cwd=str(PROJECT_ROOT),
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
            shell=False
        )
        rec.pid = proc.pid
        code = proc.wait()
        log.write(f"[{datetime.utcnow().isoformat()}] EXIT: {code}\n".encode())

    rec.finished_at = datetime.utcnow().isoformat()
    rec.status = "SUCCEEDED" if code == 0 else "FAILED"
    rec.error = None if code == 0 else f"Exited with code {code}"
    RUNS[rec.id] = rec

# --------------- API ----------------

async def start_train_job(req: TrainRequest, bg: BackgroundTasks):
    import uuid
    out_dir = _choose_outdir(req.out_dir, req.out_tag)
    run_id = uuid.uuid4().hex[:10]

    rec = RunRecord(
        id=run_id, type="train", status="QUEUED",
        out_dir=str(out_dir),
        created_at=datetime.utcnow().isoformat(),
        meta=req.model_dump(),
    )
    RUNS[run_id] = rec

    # Pass absolute out path
    args = [
        "-m", "stockbot.rl.train_ppo",
        "--config", req.config_path,
        "--out", str(out_dir),
        "--timesteps", str(req.timesteps),
        "--seed", str(req.seed),
    ]
    if req.normalize:
        args.append("--normalize")
    if req.policy:
        args.extend(["--policy", req.policy])
    if req.train_start and req.train_end and req.eval_start and req.eval_end:
        args.extend([
            "--train-start", req.train_start,
            "--train-end", req.train_end,
            "--eval-start", req.eval_start,
            "--eval-end", req.eval_end,
        ])

    bg.add_task(_run_subprocess_sync, args, rec)
    return JSONResponse({"job_id": run_id})

async def start_backtest_job(req: BacktestRequest, bg: BackgroundTasks):
    import uuid
    out_dir = _choose_outdir(req.out_dir, req.out_tag)
    run_id = uuid.uuid4().hex[:10]

    rec = RunRecord(
        id=run_id, type="backtest", status="QUEUED",
        out_dir=str(out_dir),
        created_at=datetime.utcnow().isoformat(),
        meta=req.model_dump(),
    )
    RUNS[run_id] = rec

    args = [
        "-m", "stockbot.backtest.run",
        "--config", req.config_path,
        "--policy", req.policy,
        "--out", str(out_dir),
        "--start", req.start,
        "--end", req.end,
        "--symbols", *req.symbols,
    ]

    bg.add_task(_run_subprocess_sync, args, rec)
    return JSONResponse({"job_id": run_id})

def list_runs():
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
        } for r in rows
    ]

def get_run(run_id: str):
    r = RUNS.get(run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
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

def get_artifacts(run_id: str):
    r = RUNS.get(run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    paths = _artifact_paths(Path(r.out_dir))
    def mkapi(name: str, p: Path):
        return f"/api/stockbot/runs/{run_id}/files/{name}" if p.exists() else None
    return {k: mkapi(k, v) for k, v in paths.items()}

SAFE_NAME_MAP = {
    "metrics": "report/metrics.json",
    "equity":  "report/equity.csv",
    "orders":  "report/orders.csv",
    "trades":  "report/trades.csv",
    "summary": "report/summary.json",
    "config":  "config.snapshot.yaml",
    "model":   "ppo_policy.zip",
    "job_log": "job.log",
}

def get_artifact_file(run_id: str, name: str):
    r = RUNS.get(run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    rel = SAFE_NAME_MAP.get(name)
    if not rel:
        raise HTTPException(status_code=404, detail="Unknown artifact")
    path = Path(r.out_dir) / rel
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path), filename=path.name)

# Bundle everything into a ZIP and stream it
def bundle_zip(run_id: str, include_model: bool = True) -> FileResponse:
    r = RUNS.get(run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")

    out_dir = Path(r.out_dir)
    paths = _artifact_paths(out_dir)

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

# --- add a policies directory next to runs ---
POLICIES_DIR = PROJECT_ROOT / "stockbot" / "policies"
POLICIES_DIR.mkdir(parents=True, exist_ok=True)
print(f"[StockBotController] POLICIES_DIR = {POLICIES_DIR}")

def _sanitize_filename(name: str) -> str:
    # basic zip-only sanitizer
    base = "".join(c if c.isalnum() or c in "._- " else "_" for c in name)
    if not base.lower().endswith(".zip"):
        base += ".zip"
    return base

async def save_policy_upload(file: UploadFile = File(...)):
    """
    Save uploaded PPO .zip under POLICIES_DIR, return {"policy_path": "<absolute path>"}.
    """
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted.")

    # randomize to avoid collisions
    safe_name = _sanitize_filename(file.filename)
    token = secrets.token_hex(6)
    final_name = f"{Path(safe_name).stem}_{token}.zip"
    dest = POLICIES_DIR / final_name

    # stream to disk
    with dest.open("wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    return JSONResponse({"policy_path": str(dest.resolve())})