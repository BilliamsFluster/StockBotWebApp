# stockbot/api/controllers/stockbot_controller.py

import os
import sys
import shlex
import subprocess
import zipfile
from tempfile import NamedTemporaryFile
from pathlib import Path
from datetime import datetime
from typing import Any, List, Optional, Dict, Literal
import secrets
import yaml
import shutil
import json

from fastapi import BackgroundTasks, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from fastapi import Request
from pydantic import BaseModel, Field

from .run_utils import RunManager, RunRecord
from . import tensorboard_utils as tb_utils

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

RUN_MANAGER = RunManager(RUNS_DIR)

print(f"[StockBotController] PROJECT_ROOT = {PROJECT_ROOT}")  # helpful log

def _resolve_under_project(path: str | Path) -> Path:
    p = Path(path)
    if not p.is_absolute():
        p = (PROJECT_ROOT / p).resolve()
    return p

# Allow-list server-write roots (optional but recommended)
ALLOWED_OUTPUT_ROOTS: List[Path] = [RUNS_DIR]
if os.environ.get("STOCKBOT_EXTRA_OUT_ROOT"):
    ALLOWED_OUTPUT_ROOTS.append(Path(os.environ["STOCKBOT_EXTRA_OUT_ROOT"]).resolve())

# ---------------- Types ----------------

# --- UI-driven sub-configs that mirror your EnvConfig schema ---
class FeesModel(BaseModel):
    commission_per_share: float = 0.0
    commission_pct_notional: float = 0.0005
    slippage_bps: float = 1.0
    borrow_fee_apr: float = 0.0

class MarginModel(BaseModel):
    max_gross_leverage: float = 1.0
    maintenance_margin: float = 0.25
    cash_borrow_apr: float = 0.05
    intraday_only: bool = False

class ExecModel(BaseModel):
    order_type: Literal["market", "limit"] = "market"
    limit_offset_bps: float = 0.0
    participation_cap: float = 0.1
    impact_k: float = 0.0
    spread_source: Literal["fee_model", "hl"] = "fee_model"
    vol_lookback: int = 20

class EpisodeModel(BaseModel):
    lookback: int = 64
    max_steps: Optional[int] = 256
    start_cash: float = 100_000.0
    allow_short: bool = True
    rebalance_eps: float = 0.0
    randomize_start: bool = False
    horizon: Optional[int] = None

    # NEW knobs for action mapping/turnover control
    max_step_change: float = 0.10          # per-step weight/position cap (0.10 -> 10%)
    invest_max: float = 1.00               # max fraction of equity to deploy (portfolio env)
    mapping_mode: Literal["simplex_cash", "tanh_leverage"] = "simplex_cash"

class FeatureModel(BaseModel):
    use_custom_pipeline: bool = True
    window: int = 64
    indicators: List[str] = Field(default_factory=lambda: ["logret", "rsi14"])

class RewardModel(BaseModel):
    mode: Literal["delta_nav", "log_nav"] = "delta_nav"
    w_drawdown: float = 0.0
    w_turnover: float = 0.0
    w_vol: float = 0.0
    vol_window: int = 10
    w_leverage: float = 0.0
    stop_eq_frac: float = 0.0
    sharpe_window: Optional[int] = None
    sharpe_scale: Optional[float] = None

class DatasetModel(BaseModel):
    symbols: List[str]
    start_date: str
    end_date: str
    interval: Literal["1d", "1h", "15m"] = "1d"
    adjusted_prices: bool = True
    lookback: int = 64
    train_eval_split: Literal["last_year", "80_20", "custom_ranges"] = "last_year"
    custom_ranges: Optional[List[Dict[str, List[str]]]] = None


class FeaturesModel(BaseModel):
    feature_set: List[Literal["ohlcv", "ohlcv_ta_basic", "ohlcv_ta_rich"]] = Field(
        default_factory=lambda: ["ohlcv_ta_basic"]
    )
    ta_basic_opts: Optional[Dict[str, bool]] = None
    normalize_observation: bool = True
    embargo_bars: int = 1


class CostsModel(BaseModel):
    commission_per_share: float = 0.0005
    taker_fee_bps: float = 1.0
    maker_rebate_bps: float = -0.2
    half_spread_bps: float = 0.5
    impact_k: float = 8.0


class ExecutionModel(BaseModel):
    fill_policy: Literal["next_open", "vwap_window"] = "next_open"
    vwap_minutes: Optional[int] = 15
    max_participation: float = 0.1


class CVModel(BaseModel):
    scheme: Literal["purged_walk_forward"] = "purged_walk_forward"
    n_folds: int = 6
    embargo_bars: int = 5


class StressWindow(BaseModel):
    label: str
    start: str
    end: str


class RegimeModel(BaseModel):
    enabled: bool = True
    n_states: int = 3
    emissions: str = "gaussian"
    features: List[Literal["ret", "vol", "skew", "dispersion", "breadth"]] = Field(
        default_factory=lambda: ["ret", "vol", "dispersion"]
    )
    append_beliefs_to_obs: bool = True


class ModelModel(BaseModel):
    policy: Literal["mlp", "window_cnn", "window_lstm"] = "window_cnn"
    total_timesteps: int = 1_000_000
    n_steps: int = 4096
    batch_size: int = 1024
    learning_rate: float = 3e-5
    gamma: float = 0.997
    gae_lambda: float = 0.985
    clip_range: float = 0.15
    ent_coef: float = 0.04
    vf_coef: float = 1.0
    max_grad_norm: float = 1.0
    dropout: float = 0.1
    seed: Optional[int] = None


class KellyModel(BaseModel):
    enabled: bool = True
    lambda_: float = Field(0.5, alias="lambda")
    state_scalars: Optional[List[float]] = None


class VolTargetModel(BaseModel):
    enabled: bool = True
    annual_target: float = 0.10


class GuardsModel(BaseModel):
    daily_loss_limit_pct: float = 1.0
    per_name_weight_cap: float = 0.1
    sector_cap_pct: Optional[float] = None


class SizingModel(BaseModel):
    mapping_mode: Literal["simplex_cash", "tanh_leverage"] = "simplex_cash"
    invest_max: Optional[float] = 0.7
    gross_leverage_cap: Optional[float] = 1.5
    max_step_change: float = 0.08
    rebalance_eps: float = 0.02
    kelly: KellyModel = KellyModel()
    vol_target: VolTargetModel = VolTargetModel()
    guards: GuardsModel = GuardsModel()


class RewardModelNew(BaseModel):
    base: Literal["delta_nav", "log_nav"] = "log_nav"
    w_drawdown: float = 0.10
    w_turnover: float = 0.001
    w_vol: float = 0.0
    w_leverage: float = 0.0


class ArtifactsModel(BaseModel):
    save_tb: bool = True
    save_action_hist: bool = True
    save_regime_plots: bool = True


class TrainRequest(BaseModel):
    dataset: DatasetModel
    features: FeaturesModel
    costs: CostsModel
    execution_model: ExecutionModel
    cv: CVModel
    stress_windows: List[StressWindow] = Field(default_factory=list)
    regime: RegimeModel
    model: ModelModel
    sizing: SizingModel
    reward: RewardModelNew
    artifacts: ArtifactsModel

class BacktestRequest(BaseModel):
    config_path: str = "stockbot/env/env.example.yaml"
    policy: str = "equal"  # "equal" | "flat" | "first_long" | path/to/ppo.zip
    symbols: List[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    out_tag: Optional[str] = None
    out_dir: Optional[str] = None  # optional; if omitted -> RUNS_DIR/<tag>
    run_id: Optional[str] = None
    normalize: bool = True  # NEW: eval-side normalization toggle

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

# ---------------- TensorBoard API wrappers ----------------

def tb_list_tags_for_run(run_id: str, request: Request | None = None):
    return tb_utils.list_tags(RUN_MANAGER, run_id, request)

def tb_scalar_series_for_run(run_id: str, tag: str) -> Dict[str, Any]:
    return tb_utils.scalar_series(RUN_MANAGER, run_id, tag)

def tb_histogram_series_for_run(run_id: str, tag: str, request: Request | None = None):
    return tb_utils.histogram_series(RUN_MANAGER, run_id, tag, request)

def tb_grad_matrix_for_run(run_id: str, request: Request | None = None):
    return tb_utils.grad_matrix(RUN_MANAGER, run_id, request)

def tb_scalars_batch_for_run(run_id: str, tags: List[str], request: Request | None = None):
    return tb_utils.scalars_batch(RUN_MANAGER, run_id, tags, request)

def _deep_merge(dst: Dict[str, Any], src: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deep merge src into dst (in place) and return dst.
    - dicts are merged recursively
    - None in src is ignored (keeps dst)
    - lists/other types overwrite
    """
    for k, v in src.items():
        if v is None:
            continue
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            _deep_merge(dst[k], v)
        else:
            dst[k] = v
    return dst

def _load_yaml(path: str | Path) -> Dict[str, Any]:
    p = _resolve_under_project(path)            # <— resolve relative to PROJECT_ROOT
    if not p.exists():
        raise HTTPException(status_code=400, detail=f"config_path not found: {p}")
    try:
        return yaml.safe_load(p.read_text()) or {}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse YAML: {e}")

def _dump_yaml(d: Dict[str, Any], path: Path) -> None:
    try:
        path.write_text(yaml.safe_dump(d, sort_keys=False))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write YAML snapshot: {e}")

# -------- Subprocess runner ---------

def _run_subprocess_sync(args: List[str], rec: RunRecord):
    rec.status = "RUNNING"
    rec.started_at = datetime.utcnow().isoformat()
    RUN_MANAGER.store(rec)

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

    # ---- Defensive: forbid None and coerce to str
    clean_args: List[str] = []
    for a in args:
        if a is None:
            raise ValueError("Internal error: command contained None")
        clean_args.append(str(a))

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
            # log the exception as well
            log.write(f"[{datetime.utcnow().isoformat()}] ERROR: {e!r}\n".encode())
            rec.finished_at = datetime.utcnow().isoformat()
            rec.status = "FAILED"
            rec.error = repr(e)

    RUN_MANAGER.store(rec)

# --------------- API ----------------

async def start_train_job(req: TrainRequest, bg: BackgroundTasks):
    import uuid

    run_id = uuid.uuid4().hex[:10]
    out_dir = _choose_outdir(None, run_id)

    snapshot_path = Path(out_dir) / "config.snapshot.yaml"
    _dump_yaml(req.model_dump(), snapshot_path)
    payload_path = Path(out_dir) / "payload.json"
    try:
        payload_path.write_text(json.dumps(req.model_dump(), indent=2))
    except Exception:
        pass

    # Pre-build dataset manifest and observation schema using the P2 feature layer
    try:
        from stockbot.env.env_builder import prepare_env

        prepare_env(req.model_dump(), out_dir)
    except Exception as e:  # pragma: no cover - best effort only
        print(f"[start_train_job] env prep failed: {e}")

    rec = RunRecord(
        id=run_id,
        type="train",
        status="QUEUED",
        out_dir=str(out_dir),
        created_at=datetime.utcnow().isoformat(),
        meta={
            "payload": req.model_dump(),
            "config_snapshot": str(snapshot_path),
            "payload_path": str(payload_path),
        },
    )
    RUN_MANAGER.store(rec)

    args = [
        "-m",
        "stockbot.rl.train_ppo",
        "--config",
        str(snapshot_path.resolve()),
        "--out",
        str(Path(out_dir).resolve()),
        "--timesteps",
        str(req.model.total_timesteps),
    ]
    if req.model.seed is not None:
        args.extend(["--seed", str(req.model.seed)])
    if req.model.policy:
        args.extend(["--policy", req.model.policy])
    args.extend([
        "--n-steps",
        str(req.model.n_steps),
        "--batch-size",
        str(req.model.batch_size),
        "--learning-rate",
        str(req.model.learning_rate),
        "--gamma",
        str(req.model.gamma),
        "--gae-lambda",
        str(req.model.gae_lambda),
        "--clip-range",
        str(req.model.clip_range),
        "--ent-coef",
        str(req.model.ent_coef),
        "--vf-coef",
        str(req.model.vf_coef),
        "--max-grad-norm",
        str(req.model.max_grad_norm),
        "--dropout",
        str(req.model.dropout),
    ])

    bg.add_task(_run_subprocess_sync, args, rec)
    return JSONResponse({"job_id": run_id})

async def start_backtest_job(req: BacktestRequest, bg: BackgroundTasks):
    import uuid

    out_dir = _choose_outdir(req.out_dir, req.out_tag)
    run_id = uuid.uuid4().hex[:10]

    # pull fields but keep None if not explicitly provided
    policy  = (req.policy or "equal")
    symbols = [s.strip() for s in (req.symbols or []) if isinstance(s, str) and s.strip()] if req.symbols else None
    start   = (req.start or "").strip() if req.start else None
    end     = (req.end or "").strip() if req.end else None

    # resolve template config (to compare defaults)
    cfg_path = _resolve_under_project(req.config_path or "stockbot/env/env.example.yaml")
    try:
        tmpl_cfg = yaml.safe_load(cfg_path.read_text()) or {}
    except Exception:
        tmpl_cfg = {}

    def _norm_syms(x):
        return [str(s).strip() for s in (x or []) if str(s).strip()]

    tmpl_syms = _norm_syms(tmpl_cfg.get("symbols", []))
    tmpl_start = str(tmpl_cfg.get("start") or "").strip()
    tmpl_end   = str(tmpl_cfg.get("end") or "").strip()

    # If run_id is present, start with snapshot & model, then only override with non-template values
    if getattr(req, "run_id", None):
        try:
            prev = RUN_MANAGER.get(req.run_id)
        except HTTPException:
            raise HTTPException(status_code=400, detail="run_id not found")

        prev_out = Path(prev.out_dir)
        snap = prev_out / "config.snapshot.yaml"
        if not snap.exists():
            raise HTTPException(status_code=400, detail="config.snapshot.yaml not found for run")
        cfg_path = snap.resolve()

        try:
            snap_cfg = yaml.safe_load(snap.read_text()) or {}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse snapshot: {e}")

        snap_syms = _norm_syms(snap_cfg.get("symbols", []))
        snap_start = str(snap_cfg.get("start") or "").strip()
        snap_end   = str(snap_cfg.get("end") or "").strip()

        # Heuristic: if the request provided template defaults, treat as "not explicitly set"
        # so we inherit from the snapshot.
        if symbols is None or symbols == tmpl_syms:
            symbols = snap_syms
        if not start or start == tmpl_start:
            start = snap_start
        if not end or end == tmpl_end:
            end = snap_end

        # Auto-use trained model unless the caller gave a custom policy zip or a named baseline
        model_path = prev_out / "ppo_policy.zip"
        if (not req.policy or req.policy in ("", "equal", "flat", "first_long")) and model_path.exists():
            policy = str(model_path.resolve())

    # Final validation
    if not start or not end:
        raise HTTPException(status_code=400, detail="start and end are required (YYYY-MM-DD).")
    if not symbols:
        raise HTTPException(status_code=400, detail="At least one symbol is required.")

    # Persist & run
    payload_path = Path(out_dir) / "payload.json"
    try:
        payload_path.write_text(json.dumps(req.model_dump(), indent=2))
    except Exception:
        pass

    rec = RunRecord(
        id=run_id, type="backtest", status="QUEUED",
        out_dir=str(out_dir),
        created_at=datetime.utcnow().isoformat(),
        meta={
            **req.model_dump(),
            "resolved_config": str(cfg_path),
            "resolved_symbols": symbols,
            "resolved_start": start,
            "resolved_end": end,
            "resolved_policy": policy,
            "payload_path": str(payload_path),
        },
    )
    RUN_MANAGER.store(rec)

    args = [
        "-m", "stockbot.backtest.run",
        "--config", str(cfg_path),
        "--policy", str(policy),
        "--out", str(Path(out_dir).resolve()),
        "--start", str(start),
        "--end", str(end),
        "--symbols", *[str(s) for s in symbols],
    ]
    if req.normalize:
        args.append("--normalize")
    bg.add_task(_run_subprocess_sync, args, rec)
    return JSONResponse({"job_id": run_id})

def list_runs():
    return RUN_MANAGER.list()

def get_run(run_id: str):
    r = RUN_MANAGER.get(run_id)
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
    paths = RUN_MANAGER.artifact_map_for_run(run_id)
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
    "payload": "payload.json",
}

def get_artifact_file(run_id: str, name: str):
    r = RUN_MANAGER.get(run_id)
    rel = SAFE_NAME_MAP.get(name)
    if not rel:
        raise HTTPException(status_code=404, detail="Unknown artifact")
    path = Path(r.out_dir) / rel
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path), filename=path.name)

# Cancel a running job by pid
def cancel_run(run_id: str):
    r = RUN_MANAGER.get(run_id)
    if r.status in ("SUCCEEDED", "FAILED", "CANCELLED"):
        return JSONResponse({"ok": True, "status": r.status})
    pid = r.pid
    if not pid:
        r.status = "CANCELLED"
        RUN_MANAGER.store(r)
        return JSONResponse({"ok": True, "status": r.status})
    try:
        import signal, os
        os.kill(int(pid), signal.SIGTERM)
        r.status = "CANCELLED"
        r.finished_at = datetime.utcnow().isoformat()
        RUN_MANAGER.store(r)
        return JSONResponse({"ok": True, "status": r.status})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cancel: {e}")

def delete_run(run_id: str):
    r = RUN_MANAGER.get(run_id)
    if r.status in ("RUNNING", "QUEUED", "PENDING"):
        raise HTTPException(status_code=400, detail="Cannot delete active run")
    try:
        if r.out_dir:
            out_path = Path(r.out_dir)
            if out_path.exists():
                shutil.rmtree(out_path, ignore_errors=True)
    except Exception:
        pass
    RUN_MANAGER.remove(run_id)
    return JSONResponse({"ok": True})

# Bundle everything into a ZIP and stream it
def bundle_zip(run_id: str, include_model: bool = True) -> FileResponse:
    r = RUN_MANAGER.get(run_id)

    out_dir = Path(r.out_dir)
    paths = RUN_MANAGER.artifact_paths(out_dir)

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
