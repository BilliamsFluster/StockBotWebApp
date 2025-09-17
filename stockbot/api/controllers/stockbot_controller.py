# stockbot/api/controllers/stockbot_controller.py

import os
import sys
import shlex
import subprocess
import zipfile
import math
from tempfile import NamedTemporaryFile
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, List, Optional, Dict, Literal
from collections import deque
import secrets
import yaml
import shutil
import json

import numpy as np
import pandas as pd

from fastapi import BackgroundTasks, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
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


def _iter_file_bytes(path: Path, chunk_size: int = 1024 * 1024):
    """Yield chunks from *path* without loading the whole file into memory."""

    def _gen():
        with path.open("rb") as fh:
            while True:
                chunk = fh.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    return _gen()

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
    eval_window_days: Optional[int] = None


class FeaturesModel(BaseModel):
    # Be permissive here; controller maps to EnvConfig later
    feature_set: List[str] = Field(default_factory=lambda: ["ohlcv_ta_basic"]) 
    ta_basic_opts: Optional[Dict[str, bool]] = None
    normalize_observation: bool = True
    embargo_bars: int = 1
    # NEW: optional direct indicators list and data source selection
    indicators: Optional[List[str]] = None
    data_source: Optional[Literal["yfinance", "cached", "auto"]] = "yfinance"


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
    min_hold_bars: Optional[int] = 0
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

def _env_snapshot_from_train(req: "TrainRequest") -> Dict[str, Any]:
    """Map TrainRequest payload to an EnvConfig-compatible YAML dict.

    Starts from env.example.yaml and overlays UI selections so YFinance-based
    training uses the requested symbols/dates/costs/features/sizing.
    """
    base = _load_yaml("stockbot/env/env.example.yaml");

    ds = req.dataset
    base["symbols"] = list(ds.symbols)
    base["interval"] = ds.interval
    base["start"] = ds.start_date
    base["end"] = ds.end_date
    base["adjusted"] = bool(ds.adjusted_prices)
    if getattr(ds, "eval_window_days", None) is not None:
        base["eval_window_days"] = int(ds.eval_window_days)

    # Episode lookback
    base.setdefault("episode", {})
    base["episode"]["lookback"] = int(ds.lookback)

    # Features
    feats = req.features
    base.setdefault("features", {})
    # If explicit indicators are provided (e.g., ["minimal"]) prefer built-ins
    # so the indicator list is respected. Otherwise allow custom pipeline.
    if getattr(feats, "indicators", None):
        base["features"]["use_custom_pipeline"] = False
        base["features"]["indicators"] = list(feats.indicators)  # type: ignore[attr-defined]
    else:
        base["features"]["use_custom_pipeline"] = True

    # Fees / costs
    costs = req.costs
    base.setdefault("fees", {})
    base["fees"]["commission_per_share"] = float(costs.commission_per_share)
    base["fees"]["taker_fee_bps"] = float(costs.taker_fee_bps)
    base["fees"]["maker_rebate_bps"] = float(costs.maker_rebate_bps)
    base["fees"]["half_spread_bps"] = float(costs.half_spread_bps)

    # Execution
    ex = req.execution_model
    base.setdefault("exec", {})
    base["exec"]["fill_policy"] = ex.fill_policy
    base["exec"]["participation_cap"] = float(ex.max_participation)
    # Additional execution knobs carried through for completeness
    try:
        base["exec"]["order_type"] = ex.order_type
    except Exception:
        pass
    try:
        base["exec"]["limit_offset_bps"] = float(ex.limit_offset_bps)
    except Exception:
        pass
    try:
        base["exec"]["spread_source"] = ex.spread_source
    except Exception:
        pass
    try:
        base["exec"]["vol_lookback"] = int(ex.vol_lookback)
    except Exception:
        pass
    # impact_k supplied under costs in UI
    try:
        base["exec"]["impact_k"] = float(costs.impact_k)
    except Exception:
        pass

    # Sizing / episode mapping knobs
    sz = req.sizing
    if hasattr(sz, "mapping_mode"):
        base["episode"]["mapping_mode"] = sz.mapping_mode
    if getattr(sz, "invest_max", None) is not None:
        base["episode"]["invest_max"] = float(sz.invest_max)
    if getattr(sz, "max_step_change", None) is not None:
        base["episode"]["max_step_change"] = float(sz.max_step_change)
    if getattr(sz, "rebalance_eps", None) is not None:
        base["episode"]["rebalance_eps"] = float(sz.rebalance_eps)
    if getattr(sz, "min_hold_bars", None) is not None and int(sz.min_hold_bars or 0) > 0:
        base["episode"]["min_hold_bars"] = int(sz.min_hold_bars or 0)

    # Margin guardrails (per-name cap only for now)
    base.setdefault("margin", {})
    try:
        cap = float(getattr(sz.guards, "per_name_weight_cap", 0.0))  # type: ignore[attr-defined]
        if cap > 0:
            base["margin"]["max_position_weight"] = cap
    except Exception:
        pass
    # NEW: map gross leverage and daily loss guard into margin config
    try:
        gl_cap = getattr(sz, "gross_leverage_cap", None)
        if gl_cap is not None:
            base["margin"]["max_gross_leverage"] = float(gl_cap)
    except Exception:
        pass
    try:
        dd_pct = float(getattr(sz.guards, "daily_loss_limit_pct", 0.0))  # type: ignore[attr-defined]
        if dd_pct > 0:
            # Env expects fraction for margin.daily_loss_limit
            base["margin"]["daily_loss_limit"] = dd_pct / 100.0
    except Exception:
        pass

    # Reward
    rw = req.reward
    base.setdefault("reward", {})
    try:
        mode = rw.base if hasattr(rw, "base") else None
        if mode in ("delta_nav", "log_nav"):
            base["reward"]["mode"] = mode
    except Exception:
        pass
    for k in ("w_drawdown", "w_turnover", "w_vol", "w_leverage"):
        try:
            v = getattr(rw, k)
            if v is not None:
                base["reward"][k] = float(v)
        except Exception:
            pass

    return base

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
    # Telemetry wiring for child process
    try:
        out_abs = str(Path(rec.out_dir).resolve())
        env["STOCKBOT_RUN_ID"] = rec.id
        env["STOCKBOT_OUT_DIR"] = out_abs
        env["STOCKBOT_TELEMETRY_PATH"] = str(Path(out_abs) / "live_telemetry.jsonl")
        env["STOCKBOT_EVENT_PATH"] = str(Path(out_abs) / "live_events.jsonl")
        env["STOCKBOT_ROLLUP_PATH"] = str(Path(out_abs) / "live_rollups.jsonl")
        # best-effort git sha for telemetry
        try:
            import subprocess as _sp
            sha = _sp.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=str(PROJECT_ROOT)).decode().strip()
            env["STOCKBOT_GIT_SHA"] = sha
        except Exception:
            pass
    except Exception:
        pass

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
    # Build EnvConfig-shaped snapshot so trainer respects UI dataset/costs/etc
    try:
        env_snapshot = _env_snapshot_from_train(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to build env snapshot: {e}")
    _dump_yaml(env_snapshot, snapshot_path)
    payload_path = Path(out_dir) / "payload.json"
    try:
        payload_path.write_text(json.dumps(req.model_dump(), indent=2))
    except Exception:
        pass

    # Pre-build dataset manifest and observation schema using the P2 feature layer
    # Do this in the background so it doesn't delay process launch.
    try:
        from stockbot.env.env_builder import prepare_env

        # Non-blocking: schedule as background task. Training can start immediately.
        # The trainer will proceed even if these artifacts are not ready yet.
        bg.add_task(prepare_env, req.model_dump(), out_dir)
    except Exception as e:  # pragma: no cover - best effort only
        print(f"[start_train_job] env prep scheduling failed: {e}")

    # augment meta with dataset manifest hash if present
    meta = {
        "payload": req.model_dump(),
        "config_snapshot": str(snapshot_path),
        "payload_path": str(payload_path),
    }
    try:
        manifest_path = Path(out_dir) / "dataset_manifest.json"
        if manifest_path.exists():
            import json as _json
            manifest = _json.loads(manifest_path.read_text())
            if "content_hash" in manifest:
                meta["dataset_manifest_hash"] = manifest["content_hash"]
    except Exception:
        pass

    rec = RunRecord(
        id=run_id,
        type="train",
        status="QUEUED",
        out_dir=str(out_dir),
        created_at=datetime.utcnow().isoformat(),
        meta=meta,
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

    # Observation normalization toggle (env-side RL wrapper)
    try:
        if bool(req.features.normalize_observation):
            args.append("--normalize")
    except Exception:
        pass

    # Data source toggle for training env (yfinance|cached|auto)
    ds = None
    try:
        # Prefer Pydantic attribute access
        if getattr(req, "features", None) is not None:
            ds = getattr(req.features, "data_source", None)  # type: ignore[attr-defined]
    except Exception:
        ds = None
    if ds is None:
        # Fallback to dict-style from model_dump
        try:
            dumped = req.model_dump() if hasattr(req, "model_dump") else {}
            ds = ((dumped or {}).get("features") or {}).get("data_source")
        except Exception:
            ds = None
    if ds in ("yfinance", "cached", "auto"):
        args.extend(["--data-source", ds])

    bg.add_task(_run_subprocess_sync, args, rec)
    return JSONResponse({"job_id": run_id})

async def start_backtest_job(req: BacktestRequest, bg: BackgroundTasks):
    import uuid

    run_id = uuid.uuid4().hex[:10]
    # If caller didn't provide an out_tag, default to run_id to avoid collisions
    tag = req.out_tag if getattr(req, "out_tag", None) else run_id
    out_dir = _choose_outdir(req.out_dir, tag)

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


def get_metrics_json(run_id: str):
    _rec, out_dir = _resolve_run_context(run_id)
    if out_dir is None:
        raise HTTPException(status_code=404, detail="Run not found")
    rel = SAFE_NAME_MAP.get("metrics")
    if not rel:
        raise HTTPException(status_code=404, detail="Artifact mapping missing")
    data = _read_json_file(out_dir / rel)
    return JSONResponse(data)


def get_summary_json(run_id: str):
    _rec, out_dir = _resolve_run_context(run_id)
    if out_dir is None:
        raise HTTPException(status_code=404, detail="Run not found")
    rel = SAFE_NAME_MAP.get("summary")
    if not rel:
        raise HTTPException(status_code=404, detail="Artifact mapping missing")
    data = _read_json_file(out_dir / rel)
    return JSONResponse(data)


def get_rolling_metrics_json(run_id: str):
    _rec, out_dir = _resolve_run_context(run_id)
    if out_dir is None:
        raise HTTPException(status_code=404, detail="Run not found")
    df = _load_dataframe(out_dir, ROLLING_FILE_CANDIDATES)
    df = df.copy()
    try:
        df["ts"] = _coerce_ts_column(df, "ts")
    except HTTPException:
        pass
    if "ts" in df.columns:
        df = df.sort_values("ts")
    records = []
    for rec in df.to_dict(orient="records"):
        row: dict[str, Any] = {}
        for k, v in rec.items():
            if k == "ts":
                row[k] = _epoch_ms_from_any(v)
            elif isinstance(v, (np.floating, np.integer)):
                row[k] = float(v)
            else:
                row[k] = v
        records.append(row)
    return JSONResponse({
        "items": records,
        "returned": len(records),
        "total": len(records),
    })


def get_series_data(
    run_id: str,
    key: str,
    from_ts: str | None = None,
    to_ts: str | None = None,
    max_points: int | None = None,
):
    _rec, out_dir = _resolve_run_context(run_id)
    if out_dir is None:
        raise HTTPException(status_code=404, detail="Run not found")
    candidates = SERIES_FILE_CANDIDATES.get(key)
    if not candidates:
        raise HTTPException(status_code=404, detail="Unknown series key")
    df = _load_dataframe(out_dir, candidates)
    df = df.copy()
    if "ts" in df.columns:
        try:
            df["ts"] = _coerce_ts_column(df, "ts")
        except HTTPException:
            pass
    if "ts" not in df.columns:
        raise HTTPException(status_code=400, detail="Series requires a 'ts' column")
    df = df.dropna(subset=["ts"]).sort_values("ts")

    start_dt = _parse_time_param(from_ts)
    end_dt = _parse_time_param(to_ts)
    if start_dt is not None:
        df = df[df["ts"] >= start_dt]
    if end_dt is not None:
        df = df[df["ts"] <= end_dt]

    total = len(df)
    if total == 0:
        return JSONResponse({
            "items": [],
            "returned": 0,
            "total": 0,
            "t_min": None,
            "t_max": None,
            "downsampled": False,
        })

    try:
        max_pts = int(max_points) if max_points is not None else 1500
    except Exception:
        max_pts = 1500
    max_pts = max(100, min(max_pts, 10000))

    if key == "cash" and "cash" in df.columns:
        keep = ["ts", "cash", "equity"] if "equity" in df.columns else ["ts", "cash"]
        df = df[keep]

    value_col = "equity" if "equity" in df.columns else None
    if value_col is None:
        for col in df.columns:
            if col == "ts":
                continue
            if pd.api.types.is_numeric_dtype(df[col]):
                value_col = col
                break
    downsampled = False
    if value_col and len(df) > max_pts:
        ts_arr = df["ts"].astype("int64").to_numpy(dtype=float)
        vals = (
            pd.to_numeric(df[value_col], errors="coerce")
            .fillna(method="ffill")
            .fillna(method="bfill")
            .fillna(0.0)
        )
        val_arr = vals.to_numpy(dtype=float)
        idx = _largest_triangle_three_buckets(ts_arr, val_arr, max_pts)
        df = df.iloc[idx]
        downsampled = True

    df = df.sort_values("ts")
    rows: list[dict[str, Any]] = []
    for rec in df.to_dict(orient="records"):
        row: dict[str, Any] = {}
        for k, v in rec.items():
            if k == "ts":
                row[k] = _epoch_ms_from_any(v)
            elif isinstance(v, (np.floating, np.integer)):
                row[k] = float(v)
            else:
                row[k] = v
        rows.append(row)

    t_min = rows[0]["ts"] if rows else None
    t_max = rows[-1]["ts"] if rows else None

    return JSONResponse({
        "items": rows,
        "returned": len(rows),
        "total": total,
        "t_min": t_min,
        "t_max": t_max,
        "downsampled": downsampled,
    })


def list_run_events(run_id: str, cursor: str | None = None, limit: int = 500):
    _rec, out_dir = _resolve_run_context(run_id)
    if out_dir is None:
        raise HTTPException(status_code=404, detail="Run not found")
    rel = SAFE_NAME_MAP.get("live_events")
    if not rel:
        raise HTTPException(status_code=404, detail="Artifact mapping missing")
    path = out_dir / rel
    if not path.exists():
        return JSONResponse({
            "items": [],
            "cursor": 0,
            "next_cursor": 0,
            "returned": 0,
            "has_more": False,
            "file_size": 0,
        })
    try:
        limit_val = int(limit)
    except Exception:
        limit_val = 500
    limit_val = max(1, min(limit_val, 2000))
    cursor_val = 0
    if cursor is not None:
        try:
            cursor_val = int(cursor)
        except Exception:
            cursor_val = 0
        if cursor_val < 0:
            try:
                file_size = path.stat().st_size
                cursor_val = max(file_size + cursor_val, 0)
            except Exception:
                cursor_val = 0
    payload = _paginate_jsonl(path, cursor_val, limit_val)
    payload["returned"] = len(payload.get("items", []))
    return JSONResponse(payload)


def list_run_trades(run_id: str, cursor: str | None = None, limit: int = 500):
    _rec, out_dir = _resolve_run_context(run_id)
    if out_dir is None:
        raise HTTPException(status_code=404, detail="Run not found")
    df = _load_dataframe(out_dir, TRADES_FILE_CANDIDATES)
    df = df.copy()
    if "ts" in df.columns:
        df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="coerce")
        df = df.dropna(subset=["ts"]).sort_values("ts")
    total = len(df)
    try:
        start = int(cursor) if cursor is not None else 0
    except Exception:
        start = 0
    if start < 0:
        start = max(total + start, 0)
    try:
        limit_val = int(limit)
    except Exception:
        limit_val = 500
    limit_val = max(1, min(limit_val, 2000))
    end = min(start + limit_val, total)
    window = df.iloc[start:end]
    rows: list[dict[str, Any]] = []
    for rec in window.to_dict(orient="records"):
        row: dict[str, Any] = {}
        for k, v in rec.items():
            if k == "ts":
                row[k] = _epoch_ms_from_any(v)
            elif isinstance(v, (np.floating, np.integer)):
                row[k] = float(v)
            else:
                row[k] = v
        rows.append(row)
    return JSONResponse({
        "items": rows,
        "cursor": start,
        "next_cursor": end if end < total else end,
        "returned": len(rows),
        "total": total,
        "has_more": end < total,
    })


def get_state_snapshot_at(run_id: str, ts: str):
    _rec, out_dir = _resolve_run_context(run_id)
    if out_dir is None:
        raise HTTPException(status_code=404, detail="Run not found")
    target = _parse_time_param(ts)
    if target is None:
        raise HTTPException(status_code=400, detail="Invalid timestamp")
    candidates = SERIES_FILE_CANDIDATES.get("state_snapshots")
    if not candidates:
        raise HTTPException(status_code=404, detail="Snapshot mapping missing")
    try:
        df = _load_dataframe(out_dir, candidates)
    except HTTPException:
        df = _load_dataframe(out_dir, SERIES_FILE_CANDIDATES["equity"])
    df = df.copy()
    if "ts" not in df.columns:
        raise HTTPException(status_code=400, detail="Snapshot data missing 'ts'")
    df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="coerce")
    df = df.dropna(subset=["ts"])
    if df.empty:
        raise HTTPException(status_code=404, detail="No snapshot data available")
    diff = (df["ts"] - target).abs()
    idx = int(diff.idxmin())
    record = df.loc[idx].to_dict()
    payload: dict[str, Any] = {}
    for k, v in record.items():
        if k == "ts":
            payload[k] = _epoch_ms_from_any(v)
        elif isinstance(v, (np.floating, np.integer)):
            payload[k] = float(v)
        else:
            payload[k] = v
    payload["requested_ts"] = _epoch_ms_from_any(target)
    return JSONResponse(payload)

SAFE_NAME_MAP = {
    "metrics": "report/metrics.json",
    "equity":  "report/equity.csv",
    "equity_parquet": "report/equity.parquet",
    "orders":  "report/orders.csv",
    "orders_parquet": "report/orders.parquet",
    "trades":  "report/trades.csv",
    "trades_parquet": "report/trades.parquet",
    "trades_jsonl": "report/trades.jsonl",
    "rolling_metrics": "report/rolling_metrics.csv",
    "rolling_metrics_parquet": "report/rolling_metrics.parquet",
    "summary": "report/summary.json",
    "state_snapshots": "report/state_snapshots.parquet",
    "cv_report": "cv_report.json",
    "stress_report": "stress_report.json",
    # Regime artifacts (best-effort; may not exist)
    "gamma_train_yf": "regime_posteriors.yf.csv",
    "gamma_eval_yf": "regime_posteriors.eval.yf.csv",
    "gamma_prebuilt": "regime_posteriors.csv",
    "config":  "config.snapshot.yaml",
    "model":   "ppo_policy.zip",
    "job_log": "job.log",
    "payload": "payload.json",
    # Live telemetry files for the new monitor UI
    "live_telemetry": "live_telemetry.jsonl",
    "live_events": "live_events.jsonl",
    "live_rollups": "live_rollups.jsonl",
    "live_audit": "live_audit.jsonl",
}

SERIES_FILE_CANDIDATES: Dict[str, tuple[str, ...]] = {
    "equity": ("report/equity.parquet", "report/equity.csv"),
    "cash": ("report/equity.parquet", "report/equity.csv"),
    "state_snapshots": (
        "report/state_snapshots.parquet",
        "report/equity.parquet",
        "report/equity.csv",
    ),
}

ROLLING_FILE_CANDIDATES = (
    "report/rolling_metrics.parquet",
    "report/rolling_metrics.csv",
)

TRADES_FILE_CANDIDATES = (
    "report/trades.parquet",
    "report/trades.csv",
)


def _read_json_file(path: Path) -> dict:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found") from None
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {exc}") from exc
    try:
        return json.loads(text or "{}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to parse JSON: {exc}") from exc


def _load_dataframe(out_dir: Path, candidates: tuple[str, ...]) -> pd.DataFrame:
    last_error: Exception | None = None
    for rel in candidates:
        path = out_dir / rel
        if not path.exists():
            continue
        try:
            if path.suffix == ".parquet":
                return pd.read_parquet(path)
            return pd.read_csv(path)
        except Exception as exc:
            last_error = exc
            continue
    if last_error is not None:
        raise HTTPException(status_code=500, detail=f"Failed to load data: {last_error}") from last_error
    raise HTTPException(status_code=404, detail="Artifact not found")


def _coerce_ts_column(df: pd.DataFrame, column: str = "ts") -> pd.Series:
    if column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{column}' missing from data")
    series = pd.to_datetime(df[column], utc=True, errors="coerce")
    if series.isna().all():
        raise HTTPException(status_code=400, detail=f"Failed to parse timestamps in '{column}' column")
    return series


def _epoch_ms_from_any(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, float):
        return int(value)
    if isinstance(value, (pd.Timestamp, )):
        ts = value.tz_convert("UTC") if value.tzinfo else value.tz_localize("UTC")
        return int(ts.value // 1_000_000)
    if isinstance(value, datetime):
        ts = value.astimezone(timezone.utc)
        return int(ts.timestamp() * 1000)
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return 0
        try:
            return int(float(value))
        except Exception:
            try:
                ts = pd.to_datetime(value, utc=True)
                if pd.isna(ts):
                    return 0
                return int(ts.value // 1_000_000)
            except Exception:
                return 0
    return 0


def _parse_time_param(val: str | None) -> Optional[pd.Timestamp]:
    if val is None:
        return None
    sval = str(val).strip()
    if not sval:
        return None
    try:
        return pd.to_datetime(float(sval), unit="ms", utc=True)
    except Exception:
        pass
    try:
        return pd.to_datetime(sval, utc=True)
    except Exception:
        return None


def _largest_triangle_three_buckets(ts: np.ndarray, values: np.ndarray, threshold: int) -> np.ndarray:
    length = len(ts)
    if threshold <= 0 or length <= threshold:
        return np.arange(length)
    if length <= 2:
        return np.arange(length)

    bucket_size = (length - 2) / float(threshold - 2)
    sampled = [0]
    a = 0

    for i in range(threshold - 2):
        range_start = int(math.floor((i + 1) * bucket_size)) + 1
        range_end = int(math.floor((i + 2) * bucket_size)) + 1
        range_end = min(range_end, length)
        if range_end <= range_start:
            continue

        avg_range_start = range_start
        avg_range_end = int(math.floor((i + 2) * bucket_size)) + 1
        avg_range_end = min(avg_range_end, length)
        if avg_range_end <= avg_range_start:
            avg_x = ts[range_start]
            avg_y = values[range_start]
        else:
            avg_x = float(np.mean(ts[avg_range_start:avg_range_end]))
            avg_y = float(np.mean(values[avg_range_start:avg_range_end]))

        seg_x = ts[range_start:range_end]
        seg_y = values[range_start:range_end]
        a_x = ts[a]
        a_y = values[a]
        area = np.abs((a_x - avg_x) * (seg_y - a_y) - (a_y - avg_y) * (seg_x - a_x))
        if area.size == 0:
            continue
        idx = int(np.argmax(area))
        a = range_start + idx
        sampled.append(a)

    sampled.append(length - 1)
    return np.unique(np.asarray(sampled, dtype=int))


def _paginate_jsonl(path: Path, cursor: int, limit: int) -> dict:
    try:
        file_size = path.stat().st_size
    except Exception:
        file_size = None

    cursor_val = max(0, int(cursor))
    items: list[Any] = []
    start_cursor = cursor_val
    next_cursor = cursor_val
    eof = False

    try:
        with path.open("r", encoding="utf-8", errors="ignore") as fh:
            if cursor_val > 0:
                try:
                    fh.seek(cursor_val)
                except OSError:
                    fh.seek(0)
                fh.readline()
            start_cursor = fh.tell()
            while len(items) < limit:
                line = fh.readline()
                if not line:
                    eof = True
                    break
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    obj = json.loads(stripped)
                except Exception:
                    obj = {"raw": stripped}
                items.append(obj)
            next_cursor = fh.tell()
    except FileNotFoundError:
        return {
            "items": [],
            "cursor": 0,
            "next_cursor": 0,
            "has_more": False,
            "file_size": 0,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {exc}") from exc

    has_more = bool(items) and not eof
    if not has_more and file_size is not None and next_cursor < file_size:
        has_more = True

    return {
        "items": items,
        "cursor": start_cursor,
        "next_cursor": next_cursor,
        "has_more": has_more,
        "file_size": file_size,
    }

def _resolve_run_context(run_id: str) -> tuple[RunRecord | None, Path | None]:
    """Return (run_record, out_dir) for *run_id* without raising if missing."""

    record: RunRecord | None = None
    try:
        record = RUN_MANAGER.get(run_id)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        record = None
    except Exception:
        record = None

    if record and getattr(record, "out_dir", None):
        out_path = Path(record.out_dir)
        if out_path.exists():
            return record, out_path

    fallback = RUNS_DIR / run_id
    if fallback.exists():
        return record, fallback

    return record, None


def _empty_tail_response():
    return JSONResponse({
        "items": [],
        "returned": 0,
        "total": 0,
        "has_more": False,
    })


def _empty_chunk_response(file_size: int | None = None):
    return JSONResponse({
        "items": [],
        "cursor": 0,
        "next_cursor": 0,
        "has_more": False,
        "file_size": file_size if file_size is not None else 0,
    })


def get_telemetry_tail(run_id: str, limit: int = 4000):
    _rec, out_dir = _resolve_run_context(run_id)
    if out_dir is None:
        raise HTTPException(status_code=404, detail="Run not found")
    try:
        limit = int(limit)
    except Exception:
        limit = 4000
    if limit <= 0:
        limit = 1
    limit = min(limit, 10000)

    rel = SAFE_NAME_MAP.get("live_telemetry")
    if not rel:
        raise HTTPException(status_code=404, detail="Telemetry mapping missing")

    path = out_dir / rel
    if not path.exists():
        return _empty_tail_response()

    total = 0
    buf: deque[Any] = deque(maxlen=limit)
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                stripped = line.strip()
                if not stripped:
                    continue
                total += 1
                try:
                    obj = json.loads(stripped)
                except Exception:
                    obj = {"raw": stripped}
                buf.append(obj)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read telemetry: {e}")

    items = list(buf)
    if total == 0:
        return _empty_tail_response()

    return JSONResponse({
        "items": items,
        "returned": len(items),
        "total": total,
        "has_more": total > len(items),
    })


def get_telemetry_chunk(run_id: str, cursor: int | None = None, limit: int = 1000):
    _rec, out_dir = _resolve_run_context(run_id)
    if out_dir is None:
        raise HTTPException(status_code=404, detail="Run not found")
    rel = SAFE_NAME_MAP.get("live_telemetry")
    if not rel:
        raise HTTPException(status_code=404, detail="Telemetry mapping missing")

    path = out_dir / rel
    if not path.exists():
        return _empty_chunk_response(file_size=0)

    try:
        limit = int(limit)
    except Exception:
        limit = 1000
    if limit <= 0:
        limit = 1
    limit = min(limit, 5000)

    try:
        file_size = path.stat().st_size
    except Exception:
        file_size = None

    cursor_val = 0
    if cursor is not None:
        try:
            cursor_val = int(cursor)
        except Exception:
            cursor_val = 0
    if file_size is not None and cursor_val > file_size:
        cursor_val = file_size
    if cursor_val < 0:
        if file_size is not None:
            cursor_val = max(file_size + cursor_val, 0)
        else:
            cursor_val = 0

    items: list[Any] = []
    start_cursor = 0
    next_cursor = cursor_val
    eof_reached = False

    try:
        with path.open("r", encoding="utf-8", errors="ignore") as fh:
            if cursor_val > 0:
                try:
                    fh.seek(cursor_val)
                except OSError:
                    fh.seek(0)
                # Align to the next full line to avoid returning partial JSON
                fh.readline()
            start_cursor = fh.tell()
            while len(items) < limit:
                line = fh.readline()
                if not line:
                    eof_reached = True
                    break
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    obj = json.loads(stripped)
                except Exception:
                    obj = {"raw": stripped}
                items.append(obj)
            next_cursor = fh.tell()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read telemetry chunk: {exc}")

    has_more = not eof_reached and len(items) >= limit
    if not has_more and file_size is not None and next_cursor < file_size:
        has_more = True

    if not items and start_cursor == 0 and (file_size is None or file_size == 0):
        return _empty_chunk_response(file_size=file_size)

    payload = {
        "items": items,
        "cursor": start_cursor,
        "next_cursor": next_cursor,
        "has_more": has_more,
        "file_size": file_size,
    }
    return JSONResponse(payload)

def get_artifact_file(run_id: str, name: str):
    r = RUN_MANAGER.get(run_id)
    rel = SAFE_NAME_MAP.get(name)
    if not rel:
        raise HTTPException(status_code=404, detail="Unknown artifact")
    path = Path(r.out_dir) / rel
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    # Live, growing files can cause Content-Length mismatches with FileResponse
    # when the file size changes between header calculation and body send.
    # For these, serve a static text snapshot instead of a direct file handle.
    LIVE_TEXT_NAMES = {"live_telemetry", "live_events", "live_rollups", "live_audit", "job_log", "trades_jsonl"}
    if name in LIVE_TEXT_NAMES:
        try:
            iterator = _iter_file_bytes(path)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to stream file: {exc}")
        # NDJSON / log text — stream as plain text so callers can incrementally consume it
        return StreamingResponse(iterator, media_type="text/plain; charset=utf-8")
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
