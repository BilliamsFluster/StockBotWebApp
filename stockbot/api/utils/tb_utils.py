from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Dict, List

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from tensorboard.backend.event_processing.event_accumulator import EventAccumulator

from api.services.run_service import get_run_record


def _find_tb_event_dirs(out_dir: Path) -> List[Path]:
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


def tb_list_tags_for_run(run_id: str, request: Request | None = None):
    r = get_run_record(run_id)
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


def tb_scalar_series_for_run(run_id: str, tag: str) -> dict:
    r = get_run_record(run_id)
    out_dir = Path(r.out_dir)
    accs = _load_event_accumulators(out_dir)
    points: List[dict] = []
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
    dedup: List[dict] = []
    for p in points:
        s = p["step"]
        if s in seen_steps:
            continue
        seen_steps.add(s)
        dedup.append(p)
    return {"tag": tag, "points": dedup}


def tb_histogram_series_for_run(run_id: str, tag: str, request: Request | None = None):
    r = get_run_record(run_id)
    out_dir = Path(r.out_dir)
    accs = _load_event_accumulators(out_dir)
    points: List[dict] = []
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
                    "sum": float(getattr(hv, "sum", 0.0) or 0.0) if hv else None,
                    "sum_squares": float(getattr(hv, "sum_squares", 0.0) or 0.0) if hv else None,
                    "bucket_limit": list(getattr(hv, "bucket_limit", []) or []),
                    "bucket": list(getattr(hv, "bucket", []) or []),
                }
                points.append(item)
            except Exception:
                continue
    etag = _tb_etag(out_dir, extra=f"hist:{tag}")
    if request is not None:
        inm = request.headers.get("if-none-match")
        if inm and inm == etag:
            raise HTTPException(status_code=304, detail="Not Modified")
    resp = JSONResponse({"tag": tag, "points": points})
    resp.headers["ETag"] = etag
    return resp


def tb_grad_matrix_for_run(run_id: str, request: Request | None = None):
    r = get_run_record(run_id)
    out_dir = Path(r.out_dir)
    accs = _load_event_accumulators(out_dir)
    mat: Dict[str, Dict[int, float]] = {}
    for acc in accs:
        try:
            tags = [t for t in acc.Tags().get("scalars", []) or [] if t.startswith("grads/by_layer/")]
        except Exception:
            continue
        for t in tags:
            name = t.split("grads/by_layer/")[-1]
            try:
                evs = acc.Scalars(t)
            except Exception:
                continue
            for ev in evs:
                step = int(getattr(ev, "step", 0) or 0)
                val = float(getattr(ev, "value", 0.0) or 0.0)
                mat.setdefault(name, {})[step] = val
    etag = _tb_etag(out_dir, extra="grad-matrix")
    if request is not None:
        inm = request.headers.get("if-none-match")
        if inm and inm == etag:
            raise HTTPException(status_code=304, detail="Not Modified")
    resp = JSONResponse({"matrix": mat})
    resp.headers["ETag"] = etag
    return resp


def tb_scalars_batch_for_run(run_id: str, tags: List[str], request: Request | None = None):
    r = get_run_record(run_id)
    out_dir = Path(r.out_dir)
    accs = _load_event_accumulators(out_dir)
    result: Dict[str, List[dict]] = {}
    for tag in tags:
        result[tag] = []
    for acc in accs:
        for tag in tags:
            try:
                evs = acc.Scalars(tag)
            except Exception:
                continue
            for ev in evs:
                result[tag].append({
                    "step": int(getattr(ev, "step", 0) or 0),
                    "wall_time": float(getattr(ev, "wall_time", 0.0) or 0.0),
                    "value": float(getattr(ev, "value", 0.0) or 0.0),
                })
    etag = _tb_etag(out_dir, extra="batch")
    if request is not None:
        inm = request.headers.get("if-none-match")
        if inm and inm == etag:
            raise HTTPException(status_code=304, detail="Not Modified")
    resp = JSONResponse({"series": result})
    resp.headers["ETag"] = etag
    return resp


__all__ = [
    "tb_list_tags_for_run",
    "tb_scalar_series_for_run",
    "tb_histogram_series_for_run",
    "tb_grad_matrix_for_run",
    "tb_scalars_batch_for_run",
]
