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

from fastapi import BackgroundTasks, HTTPException, UploadFile, File, WebSocket
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field
from tensorboard.backend.event_processing.event_accumulator import (
    EventAccumulator,
)
import time
import hashlib
from fastapi import Request

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

RunType = Literal["train", "backtest"]
RunStatus = Literal["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]

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

class TrainRequest(BaseModel):
    # training flags
    config_path: str = "stockbot/env/env.example.yaml"
    normalize: bool = True
    policy: Literal["mlp", "window_cnn", "window_lstm"] = "window_cnn"
    timesteps: int = 150_000
    seed: int = 42
    out_tag: Optional[str] = None
    out_dir: Optional[str] = None  # optional; if omitted -> RUNS_DIR/<tag>

    # Optional explicit split:
    train_start: Optional[str] = None
    train_end: Optional[str] = None
    eval_start: Optional[str] = None
    eval_end: Optional[str] = None

    # UI-driven env overrides (all optional)
    symbols: Optional[List[str]] = None
    start: Optional[str] = None
    end: Optional[str] = None
    interval: Optional[str] = None
    adjusted: Optional[bool] = None

    fees: Optional[FeesModel] = None
    margin: Optional[MarginModel] = None
    exec: Optional[ExecModel] = None
    episode: Optional[EpisodeModel] = None
    features: Optional[FeatureModel] = None
    reward: Optional[RewardModel] = None

    # Optional PPO hyperparameters (forwarded if provided)
    n_steps: Optional[int] = None
    batch_size: Optional[int] = None
    learning_rate: Optional[float] = None
    gamma: Optional[float] = None
    gae_lambda: Optional[float] = None
    clip_range: Optional[float] = None
    entropy_coef: Optional[float] = None
    vf_coef: Optional[float] = None
    max_grad_norm: Optional[float] = None
    dropout: Optional[float] = None

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

# ---------------- TensorBoard utilities ----------------
def _find_tb_event_dirs(out_dir: Path) -> list[Path]:
    """
    Return a list of directories under out_dir that contain TensorBoard event files.
    We check out_dir itself, a common subdir 'tb', and any immediate subdirectories.
    """
    candidates: list[Path] = []
    # explicit known locations
    for p in [out_dir, out_dir / "tb", out_dir / "tensorboard"]:
        if p.exists() and p.is_dir():
            candidates.append(p)
    # include single-level children as well (SB3 may create runs like <out_dir>/PPO_1)
    try:
        for child in out_dir.iterdir():
            if child.is_dir():
                candidates.append(child)
    except Exception:
        pass

    # de-duplicate while preserving order
    seen = set()
    uniq: list[Path] = []
    for c in candidates:
        if str(c) in seen:
            continue
        seen.add(str(c))
        uniq.append(c)

    def has_events(d: Path) -> bool:
        try:
            for f in d.iterdir():
                if f.is_file() and f.name.startswith("events.out.tfevents"):
                    return True
        except Exception:
            return False
        return False

    return [d for d in uniq if has_events(d)]


def _load_event_accumulators(out_dir: Path) -> list[EventAccumulator]:
    accs: list[EventAccumulator] = []
    for d in _find_tb_event_dirs(out_dir):
        try:
            acc = EventAccumulator(str(d))
            acc.Reload()
            accs.append(acc)
        except Exception:
            # ignore broken dirs
            continue
    return accs


def _tb_etag(out_dir: Path, extra: str = "") -> str:
    """Generate a weak ETag based on event file mtimes + sizes under out_dir/tb.*"""
    parts: list[str] = []
    for d in _find_tb_event_dirs(out_dir):
        try:
            for f in d.iterdir():
                if f.is_file() and f.name.startswith("events.out.tfevents"):
                    st = f.stat()
                    parts.append(f"{f.name}:{int(st.st_mtime_ns)}:{st.st_size}")
        except Exception:
            continue
    h = hashlib.sha1(("|".join(sorted(parts)) + "|" + extra).encode()).hexdigest()
    return f"W/\"{h}\""


def tb_list_tags_for_run(run_id: str, request: Request | None = None):
    r = RUNS.get(run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")
    out_dir = Path(r.out_dir)
    accs = _load_event_accumulators(out_dir)
    scalars: set[str] = set()
    histos: set[str] = set()
    for acc in accs:
        try:
            tags = acc.Tags()
        except Exception:
            continue
        for t in tags.get("scalars", []) or []:
            scalars.add(t)
        for t in tags.get("histograms", []) or []:
            histos.add(t)
    body = {"scalars": sorted(scalars), "histograms": sorted(histos)}
    etag = _tb_etag(out_dir, extra="tags")
    if request is not None:
        inm = request.headers.get("if-none-match")
        if inm and inm == etag:
            # 304 with empty body is fine; FastAPI will send default
            raise HTTPException(status_code=304, detail="Not Modified")
    resp = JSONResponse(body)
    resp.headers["ETag"] = etag
    return resp


def tb_scalar_series_for_run(run_id: str, tag: str) -> dict:
    r = RUNS.get(run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")
    out_dir = Path(r.out_dir)
    accs = _load_event_accumulators(out_dir)
    points: list[dict] = []
    for acc in accs:
        try:
            evs = acc.Scalars(tag)
        except KeyError:
            continue
        except Exception:
            continue
        for ev in evs:
            # TensorBoard scalar event has .step, .wall_time, .value
            try:
                points.append({
                    "step": int(getattr(ev, "step", 0) or 0),
                    "wall_time": float(getattr(ev, "wall_time", 0.0) or 0.0),
                    "value": float(getattr(ev, "value", 0.0) or 0.0),
                })
            except Exception:
                continue
    # sort & de-dupe (keep earliest per step)
    points.sort(key=lambda p: (p["step"], p["wall_time"]))
    seen_steps = set()
    dedup: list[dict] = []
    for p in points:
        s = p["step"]
        if s in seen_steps:
            continue
        seen_steps.add(s)
        dedup.append(p)
    return {"tag": tag, "points": dedup}


def tb_histogram_series_for_run(run_id: str, tag: str, request: Request | None = None):
    r = RUNS.get(run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")
    out_dir = Path(r.out_dir)
    accs = _load_event_accumulators(out_dir)
    points: list[dict] = []
    for acc in accs:
        try:
            evs = acc.Histograms(tag)
        except KeyError:
            continue
        except Exception:
            continue
        for ev in evs:
            try:
                hv = getattr(ev, "histogram_value", None) or getattr(ev, "value", None)
                item = {
                    "step": int(getattr(ev, "step", 0) or 0),
                    "wall_time": float(getattr(ev, "wall_time", 0.0) or 0.0),
                    "min": float(getattr(hv, "min", 0.0) or 0.0) if hv else None,
                    "max": float(getattr(hv, "max", 0.0) or 0.0) if hv else None,
                    "num": float(getattr(hv, "num", 0.0) or 0.0) if hv else None,
                    "sum": float(getattr(hv, "sum", 0.0) or 0.0) if hv else None,
                    "sum_squares": float(getattr(hv, "sum_squares", 0.0) or 0.0) if hv else None,
                }
                # Attempt buckets
                buckets = []
                try:
                    for b in getattr(hv, "buckets", []) or []:  # type: ignore[attr-defined]
                        left = getattr(b, "left", None)
                        right = getattr(b, "right", None)
                        count = getattr(b, "count", None)
                        if left is not None and right is not None and count is not None:
                            buckets.append([float(left), float(right), float(count)])
                except Exception:
                    buckets = []
                if buckets:
                    item["buckets"] = buckets
                points.append(item)
            except Exception:
                continue
    points.sort(key=lambda p: (p.get("step", 0), p.get("wall_time", 0.0)))
    body = {"tag": tag, "points": points}
    # ETag keyed by tag
    r = RUNS.get(run_id)
    out_dir = Path(r.out_dir) if r else None
    etag = _tb_etag(out_dir, extra=f"hist:{tag}") if out_dir else None
    if request is not None and etag:
        inm = request.headers.get("if-none-match")
        if inm and inm == etag:
            raise HTTPException(status_code=304, detail="Not Modified")
    resp = JSONResponse(body)
    if etag:
        resp.headers["ETag"] = etag
    return resp


def tb_grad_matrix_for_run(run_id: str, request: Request | None = None):
    """Aggregate per-layer grad norms logged as scalars under prefix grads/by_layer/.
    Returns { layers: [...], steps: [...], values: number[][] }
    """
    r = RUNS.get(run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")
    out_dir = Path(r.out_dir)
    accs = _load_event_accumulators(out_dir)

    # Collect layer names
    layer_names: set[str] = set()
    per_layer: dict[str, dict[int, float]] = {}
    for acc in accs:
        try:
            tags = acc.Tags().get("scalars", []) or []
        except Exception:
            continue
        for t in tags:
            if isinstance(t, str) and t.startswith("grads/by_layer/"):
                layer = t.split("grads/by_layer/", 1)[1]
                if not layer:
                    continue
                layer_names.add(layer)
                # Load series for this layer
                try:
                    evs = acc.Scalars(t)
                except Exception:
                    continue
                layer_map = per_layer.setdefault(layer, {})
                for ev in evs:
                    try:
                        s = int(getattr(ev, "step", 0) or 0)
                        v = float(getattr(ev, "value", 0.0) or 0.0)
                        if s not in layer_map:
                            layer_map[s] = v
                    except Exception:
                        continue

    if not layer_names:
        body = {"layers": [], "steps": [], "values": []}
        return JSONResponse(body)

    layers = sorted(layer_names)
    # Collect all steps
    step_set: set[int] = set()
    for layer, m in per_layer.items():
        step_set.update(m.keys())
    steps = sorted(step_set)

    # Build matrix rows
    values: list[list[float | None]] = []
    for s in steps:
        row: list[float | None] = []
        for layer in layers:
            v = per_layer.get(layer, {}).get(s)
            row.append(v if isinstance(v, (int, float)) else None)
        values.append(row)

    body = {"layers": layers, "steps": steps, "values": values}
    etag = _tb_etag(out_dir, extra="grad_matrix")
    if request is not None:
        inm = request.headers.get("if-none-match")
        if inm and inm == etag:
            raise HTTPException(status_code=304, detail="Not Modified")
    resp = JSONResponse(body)
    resp.headers["ETag"] = etag
    return resp


def tb_scalars_batch_for_run(run_id: str, tags: list[str], request: Request | None = None):
    """Batch-fetch multiple scalar tags for a run: returns { tag: [{step,wall_time,value}, ...], ... }"""
    r = RUNS.get(run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")
    out_dir = Path(r.out_dir)
    accs = _load_event_accumulators(out_dir)
    result: dict[str, list[dict]] = {t: [] for t in tags}
    for tag in tags:
        pts: list[dict] = []
        for acc in accs:
            try:
                evs = acc.Scalars(tag)
            except KeyError:
                continue
            except Exception:
                continue
            for ev in evs:
                try:
                    pts.append({
                        "step": int(getattr(ev, "step", 0) or 0),
                        "wall_time": float(getattr(ev, "wall_time", 0.0) or 0.0),
                        "value": float(getattr(ev, "value", 0.0) or 0.0),
                    })
                except Exception:
                    continue
        pts.sort(key=lambda p: (p["step"], p["wall_time"]))
        # de-dupe per step
        seen = set()
        dedup = []
        for p in pts:
            s = p["step"]
            if s in seen:
                continue
            seen.add(s)
            dedup.append(p)
        result[tag] = dedup
    body = {"series": result}
    etag = _tb_etag(out_dir, extra=(",".join(sorted(tags))))
    if request is not None:
        inm = request.headers.get("if-none-match")
        if inm and inm == etag:
            raise HTTPException(status_code=304, detail="Not Modified")
    resp = JSONResponse(body)
    resp.headers["ETag"] = etag
    return resp

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

def _build_env_overrides(req: TrainRequest) -> Dict[str, Any]:
    """
    Build a dict with only the keys the user provided (so we don't stomp defaults).
    Matches EnvConfig’s schema.
    """
    env: Dict[str, Any] = {}

    # top-level env fields
    if req.symbols is not None:  env["symbols"] = list(req.symbols)
    if req.start is not None:    env["start"] = req.start
    if req.end is not None:      env["end"] = req.end
    if req.interval is not None: env["interval"] = req.interval
    if req.adjusted is not None: env["adjusted"] = bool(req.adjusted)

    # sub-blocks
    if req.fees is not None:     env["fees"] = req.fees.model_dump()
    if req.margin is not None:   env["margin"] = req.margin.model_dump()
    if req.exec is not None:     env["exec"] = req.exec.model_dump()
    if req.episode is not None:  env["episode"] = req.episode.model_dump()
    if req.features is not None: env["features"] = req.features.model_dump()
    if req.reward is not None:   env["reward"] = req.reward.model_dump()

    return env

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

    RUNS[rec.id] = rec

# --------------- API ----------------

async def start_train_job(req: TrainRequest, bg: BackgroundTasks):
    import uuid

    # choose run folder
    out_dir = _choose_outdir(req.out_dir, req.out_tag)
    run_id = uuid.uuid4().hex[:10]

    # load base YAML
    base_cfg = _load_yaml(req.config_path)

    # apply UI overrides (only provided keys)
    overrides = _build_env_overrides(req)
    merged_cfg = _deep_merge(base_cfg, overrides)

    # write config snapshot into run folder
    snapshot_path = Path(out_dir) / "config.snapshot.yaml"
    _dump_yaml(merged_cfg, snapshot_path)

    # record run
    rec = RunRecord(
        id=run_id, type="train", status="QUEUED",
        out_dir=str(out_dir),
        created_at=datetime.utcnow().isoformat(),
        meta={
            **req.model_dump(),
            "config_snapshot": str(snapshot_path),
        },
    )
    RUNS[run_id] = rec

    # build args targeting the SNAPSHOT (not the original)
    args = [
        "-m", "stockbot.rl.train_ppo",
        "--config", str(snapshot_path.resolve()),   # <— absolute path
        "--out", str(Path(out_dir).resolve()),
        "--timesteps", str(req.timesteps),
        "--seed", str(req.seed),
    ]
    if req.normalize:
        args.append("--normalize")
    if req.policy:
        args.extend(["--policy", req.policy])

    # Optional PPO hyperparameters
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

    # explicit split (optional)
    if req.train_start and req.train_end and req.eval_start and req.eval_end:
        args.extend([
            "--train-start", req.train_start,
            "--train-end",   req.train_end,
            "--eval-start",  req.eval_start,
            "--eval-end",    req.eval_end,
        ])

    # enqueue
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
        prev = RUNS.get(req.run_id)
        if not prev:
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
        },
    )
    RUNS[run_id] = rec

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

def _artifact_map_for_run(run_id: str) -> Dict[str, Path]:
    r = RUNS.get(run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    return _artifact_paths(Path(r.out_dir))

def get_artifacts(run_id: str):
    paths = _artifact_map_for_run(run_id)
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

# Cancel a running job by pid
def cancel_run(run_id: str):
    r = RUNS.get(run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")
    if r.status in ("SUCCEEDED", "FAILED", "CANCELLED"):
        return JSONResponse({"ok": True, "status": r.status})
    pid = r.pid
    if not pid:
        r.status = "CANCELLED"
        RUNS[run_id] = r
        return JSONResponse({"ok": True, "status": r.status})
    try:
        import signal, os
        os.kill(int(pid), signal.SIGTERM)
        r.status = "CANCELLED"
        r.finished_at = datetime.utcnow().isoformat()
        RUNS[run_id] = r
        return JSONResponse({"ok": True, "status": r.status})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cancel: {e}")

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
