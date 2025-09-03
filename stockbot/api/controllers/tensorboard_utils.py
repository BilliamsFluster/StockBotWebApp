from __future__ import annotations


import hashlib
from pathlib import Path
from typing import Any, Dict, List

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from tensorboard.backend.event_processing.event_accumulator import EventAccumulator

from .run_utils import RunManager

# ---------------- TensorBoard utilities ----------------

def _find_tb_event_dirs(out_dir: Path) -> List[Path]:
    """Return directories under out_dir that contain TensorBoard event files."""
    candidates: List[Path] = []
    for p in [out_dir, out_dir / "tb", out_dir / "tensorboard"]:
        if p.exists() and p.is_dir():
            candidates.append(p)
    try:
        for child in out_dir.iterdir():
            if child.is_dir():
                candidates.append(child)
    except Exception:
        pass
    seen = set()
    uniq: List[Path] = []
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


def _load_event_accumulators(out_dir: Path) -> List[EventAccumulator]:
    accs: List[EventAccumulator] = []
    for d in _find_tb_event_dirs(out_dir):
        try:
            acc = EventAccumulator(str(d))
            acc.Reload()
            accs.append(acc)
        except Exception:
            continue
    return accs


def _tb_etag(out_dir: Path, extra: str = "") -> str:
    """Generate a weak ETag based on event file mtimes + sizes under out_dir."""
    parts: List[str] = []
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


def list_tags(run_manager: RunManager, run_id: str, request: Request | None = None):
    r = run_manager.get(run_id)
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
            raise HTTPException(status_code=304, detail="Not Modified")
    resp = JSONResponse(body)
    resp.headers["ETag"] = etag
    return resp


def scalar_series(run_manager: RunManager, run_id: str, tag: str) -> Dict[str, Any]:
    r = run_manager.get(run_id)
    out_dir = Path(r.out_dir)
    accs = _load_event_accumulators(out_dir)
    points: List[Dict[str, Any]] = []
    for acc in accs:
        try:
            evs = acc.Scalars(tag)
        except KeyError:
            continue
        except Exception:
            continue
        for ev in evs:
            try:
                points.append({
                    "step": int(getattr(ev, "step", 0) or 0),
                    "wall_time": float(getattr(ev, "wall_time", 0.0) or 0.0),
                    "value": float(getattr(ev, "value", 0.0) or 0.0),
                })
            except Exception:
                continue
    points.sort(key=lambda p: (p["step"], p["wall_time"]))
    seen_steps = set()
    dedup: List[Dict[str, Any]] = []
    for p in points:
        s = p["step"]
        if s in seen_steps:
            continue
        seen_steps.add(s)
        dedup.append(p)
    return {"tag": tag, "points": dedup}


def histogram_series(run_manager: RunManager, run_id: str, tag: str, request: Request | None = None):
    r = run_manager.get(run_id)
    out_dir = Path(r.out_dir)
    accs = _load_event_accumulators(out_dir)
    points: List[Dict[str, Any]] = []
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
                buckets = []
                try:
                    for b in getattr(hv, "buckets", []) or []:
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
    etag = _tb_etag(out_dir, extra=f"hist:{tag}")
    if request is not None and etag:
        inm = request.headers.get("if-none-match")
        if inm and inm == etag:
            raise HTTPException(status_code=304, detail="Not Modified")
    resp = JSONResponse(body)
    if etag:
        resp.headers["ETag"] = etag
    return resp


def grad_matrix(run_manager: RunManager, run_id: str, request: Request | None = None):
    """Return a compact gradient matrix (layers × steps) for a training run."""
    r = run_manager.get(run_id)
    out_dir = Path(r.out_dir)
    accs = _load_event_accumulators(out_dir)

    prefix = "grads/by_layer/"
    layer_series: Dict[str, Dict[int, float]] = {}
    steps_set: set[int] = set()
    tags: List[str] = []

    for acc in accs:
        try:
            for t in acc.Tags().get("scalars", []) or []:
                if t.startswith(prefix):
                    tags.append(t)
                    layer = t[len(prefix) :]
                    series = layer_series.setdefault(layer, {})
                    try:
                        evs = acc.Scalars(t)
                    except KeyError:
                        continue
                    except Exception:
                        continue
                    for ev in evs:
                        try:
                            step = int(getattr(ev, "step", 0) or 0)
                            val = float(getattr(ev, "value", 0.0) or 0.0)
                        except Exception:
                            continue
                        series[step] = val
                        steps_set.add(step)
        except Exception:
            continue

    layers = sorted(layer_series.keys())
    steps = sorted(steps_set)
    values: List[List[float | None]] = []
    for s in steps:
        row: List[float | None] = []
        for layer in layers:
            row.append(layer_series.get(layer, {}).get(s))
        values.append(row)

    body = {"layers": layers, "steps": steps, "values": values}
    etag = _tb_etag(out_dir, extra=(",".join(sorted(tags))))
    if request is not None:
        inm = request.headers.get("if-none-match")
        if inm and inm == etag:
            raise HTTPException(status_code=304, detail="Not Modified")
    resp = JSONResponse(body)
    resp.headers["ETag"] = etag
    return resp


def scalars_batch(run_manager: RunManager, run_id: str, tags: List[str], request: Request | None = None):
    r = run_manager.get(run_id)
    out_dir = Path(r.out_dir)
    accs = _load_event_accumulators(out_dir)
    result: Dict[str, List[Dict[str, Any]]] = {t: [] for t in tags}
    for tag in tags:
        pts: List[Dict[str, Any]] = []
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
        seen = set()
        dedup: List[Dict[str, Any]] = []
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
