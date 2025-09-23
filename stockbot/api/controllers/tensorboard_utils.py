from __future__ import annotations

import hashlib
import json
import csv
import math
import threading
import time
from collections import OrderedDict
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


_ACC_CACHE: "OrderedDict[str, tuple[str, EventAccumulator]]" = OrderedDict()
_CACHE_LIMIT = 6
_PROGRESS_CACHE: "OrderedDict[str, tuple[str, Dict[str, List[Dict[str, Any]]]]]" = OrderedDict()
_PROGRESS_CACHE_LIMIT = 6
_CACHE_BUILDERS: set[str] = set()


def _dir_signature(directory: Path) -> str:
    parts: list[str] = []
    try:
        for f in directory.iterdir():
            if f.is_file() and f.name.startswith("events.out.tfevents"):
                st = f.stat()
                parts.append(f"{int(st.st_mtime_ns)}:{st.st_size}")
    except Exception:
        return ""
    return "|".join(sorted(parts))


def _get_accumulator(directory: Path) -> EventAccumulator:
    key = str(directory.resolve())
    signature = _dir_signature(directory)
    cached = _ACC_CACHE.get(key) if signature else None
    if cached and cached[0] == signature:
        _ACC_CACHE.move_to_end(key)
        return cached[1]
    acc = EventAccumulator(str(directory))
    acc.Reload()
    if signature:
        _ACC_CACHE[key] = (signature, acc)
        _ACC_CACHE.move_to_end(key)
        while len(_ACC_CACHE) > _CACHE_LIMIT:
            _ACC_CACHE.popitem(last=False)
    return acc


def _downsample_points(points: List[Dict[str, Any]], limit: int = 2000) -> List[Dict[str, Any]]:
    size = len(points)
    if size <= limit:
        return points
    stride = max(1, math.floor(size / limit))
    sampled = points[::stride]
    if sampled and sampled[-1] is not points[-1]:
        sampled.append(points[-1])
    if len(sampled) > limit:
        sampled = sampled[-limit:]
    return sampled


def _progress_signature(path: Path) -> str:
    try:
        st = path.stat()
    except Exception:
        return ""
    return f"{int(st.st_mtime_ns)}:{st.st_size}"


def _load_progress_scalars(out_dir: Path) -> Dict[str, List[Dict[str, Any]]]:
    progress_path = out_dir / "progress.csv"
    if not progress_path.exists():
        return {}
    signature = _progress_signature(progress_path)
    key = str(progress_path.resolve())
    cached = _PROGRESS_CACHE.get(key) if signature else None
    if cached and cached[0] == signature:
        _PROGRESS_CACHE.move_to_end(key)
        return cached[1]
    series: Dict[str, List[Dict[str, Any]]] = {}
    try:
        with progress_path.open("r", newline="") as handle:
            reader = csv.DictReader(handle)
            for index, row in enumerate(reader):
                raw_step = row.get("time/total_timesteps") or row.get("total_timesteps") or row.get("timesteps")
                try:
                    step = int(float(raw_step)) if raw_step else index
                except Exception:
                    step = index
                wall = row.get("time/time_elapsed") or row.get("time_elapsed")
                try:
                    wall_time = float(wall) if wall else float(index)
                except Exception:
                    wall_time = float(index)
                for tag, value in row.items():
                    if not value or tag in {"time/total_timesteps", "total_timesteps", "timesteps", "time/time_elapsed", "time_elapsed"}:
                        continue
                    try:
                        numeric = float(value)
                    except Exception:
                        continue
                    points = series.setdefault(tag, [])
                    points.append({
                        "step": step,
                        "wall_time": wall_time,
                        "value": numeric,
                    })
    except Exception:
        series = {}
    if series:
        for tag, points in list(series.items()):
            series[tag] = _downsample_points(points)
        _PROGRESS_CACHE[key] = (signature, series)
        _PROGRESS_CACHE.move_to_end(key)
        while len(_PROGRESS_CACHE) > _PROGRESS_CACHE_LIMIT:
            _PROGRESS_CACHE.popitem(last=False)
        return series
    return {}


def _load_scalar_cache(out_dir: Path) -> Dict[str, List[Dict[str, Any]]]:
    cache_path = out_dir / "tb_cache" / "scalars.json"
    signature = _dir_signature(out_dir)
    if not signature or not cache_path.exists():
        return {}
    try:
        raw = json.loads(cache_path.read_text())
        if raw.get("signature") == signature:
            data = raw.get("series") or {}
            return {k: list(v) for k, v in data.items()}
    except Exception:
        return {}
    return {}


def _store_scalar_cache(out_dir: Path, data: Dict[str, List[Dict[str, Any]]]):
    signature = _dir_signature(out_dir)
    if not signature or not data:
        return
    cache_dir = out_dir / "tb_cache"
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path = cache_dir / "scalars.json"
        cache_path.write_text(json.dumps({"signature": signature, "series": data}))
    except Exception:
        pass


def _load_tags_cache(out_dir: Path) -> Dict[str, List[str]]:
    cache_path = out_dir / "tb_cache" / "tags.json"
    signature = _dir_signature(out_dir)
    if not signature or not cache_path.exists():
        return {}
    try:
        raw = json.loads(cache_path.read_text())
        if raw.get("signature") == signature:
            return {
                "scalars": list(raw.get("scalars") or []),
                "histograms": list(raw.get("histograms") or []),
            }
    except Exception:
        return {}
    return {}


def _store_tags_cache(out_dir: Path, scalars: List[str], histograms: List[str]):
    signature = _dir_signature(out_dir)
    if not signature:
        return
    cache_dir = out_dir / "tb_cache"
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path = cache_dir / "tags.json"
        cache_path.write_text(
            json.dumps({
                "signature": signature,
                "scalars": list(scalars),
                "histograms": list(histograms),
            })
        )
    except Exception:
        pass


def _load_grad_cache(out_dir: Path) -> Dict[str, Any]:
    cache_path = out_dir / "tb_cache" / "grad.json"
    signature = _dir_signature(out_dir)
    if not signature or not cache_path.exists():
        return {}
    try:
        raw = json.loads(cache_path.read_text())
        if raw.get("signature") == signature:
            return {
                "layers": raw.get("layers") or [],
                "steps": raw.get("steps") or [],
                "values": raw.get("values") or [],
            }
    except Exception:
        return {}
    return {}


def _store_grad_cache(out_dir: Path, layers: List[str], steps: List[int], values: List[List[float | None]]):
    signature = _dir_signature(out_dir)
    if not signature:
        return
    cache_dir = out_dir / "tb_cache"
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path = cache_dir / "grad.json"
        cache_path.write_text(
            json.dumps({
                "signature": signature,
                "layers": layers,
                "steps": steps,
                "values": values,
            })
        )
    except Exception:
        pass


def _merge_series(base: Dict[str, List[Dict[str, Any]]], updates: Dict[str, List[Dict[str, Any]]]):
    for tag, points in updates.items():
        existing = base.get(tag)
        combined = existing + list(points) if existing else list(points)
        combined.sort(key=lambda p: (p.get("step", 0), p.get("wall_time", 0.0)))
        seen = set()
        dedup: List[Dict[str, Any]] = []
        for item in combined:
            step = item.get("step")
            if step in seen:
                continue
            seen.add(step)
            dedup.append(item)
        base[tag] = dedup


def _build_full_cache(run_manager: RunManager, run_id: str):
    try:
        record = run_manager.get(run_id)
    except Exception:
        return
    out_dir = Path(record.out_dir)
    if _load_scalar_cache(out_dir) and _load_tags_cache(out_dir) and _load_grad_cache(out_dir):
        return

    accs = []
    try:
        for directory in _find_tb_event_dirs(out_dir):
            accs.append(_get_accumulator(directory))
    except Exception:
        accs = []

    scalar_series: Dict[str, List[Dict[str, Any]]] = {}
    histogram_tags: set[str] = set()

    for acc in accs:
        try:
            tags = acc.Tags()
        except Exception:
            continue
        for t in tags.get("scalars", []) or []:
            try:
                events = acc.Scalars(t)
            except Exception:
                continue
            pts: List[Dict[str, Any]] = []
            for ev in events:
                try:
                    pts.append({
                        "step": int(getattr(ev, "step", 0) or 0),
                        "wall_time": float(getattr(ev, "wall_time", 0.0) or 0.0),
                        "value": float(getattr(ev, "value", 0.0) or 0.0),
                    })
                except Exception:
                    continue
            if pts:
                scalar_series.setdefault(t, []).extend(pts)
        for t in tags.get("histograms", []) or []:
            histogram_tags.add(t)

    if scalar_series:
        for tag, points in list(scalar_series.items()):
            points.sort(key=lambda p: (p.get("step", 0), p.get("wall_time", 0.0)))
            seen = set()
            dedup: List[Dict[str, Any]] = []
            for item in points:
                step = item.get("step")
                if step in seen:
                    continue
                seen.add(step)
                dedup.append(item)
            scalar_series[tag] = dedup
        _store_scalar_cache(out_dir, scalar_series)

    scalar_keys = sorted(scalar_series.keys())
    hist_keys = sorted(histogram_tags)
    if scalar_keys or hist_keys:
        _store_tags_cache(out_dir, scalar_keys, hist_keys)

    prefix = "grads/by_layer/"
    layer_series: Dict[str, Dict[int, float]] = {}
    steps_set: set[int] = set()
    for acc in accs:
        try:
            tags = acc.Tags().get("scalars", []) or []
        except Exception:
            continue
        for t in tags:
            if not t.startswith(prefix):
                continue
            layer = t[len(prefix) :]
            series = layer_series.setdefault(layer, {})
            try:
                evs = acc.Scalars(t)
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
    if layer_series:
        layers = sorted(layer_series.keys())
        steps = sorted(steps_set)
        values: List[List[float | None]] = []
        for s in steps:
            row: List[float | None] = []
            for layer in layers:
                row.append(layer_series.get(layer, {}).get(s))
            values.append(row)
        _store_grad_cache(out_dir, layers, steps, values)


def ensure_cache_async(run_manager: RunManager, run_id: str):
    try:
        record = run_manager.get(run_id)
    except Exception:
        return
    out_dir = Path(record.out_dir)
    if _load_scalar_cache(out_dir) and _load_tags_cache(out_dir) and _load_grad_cache(out_dir):
        return
    if run_id in _CACHE_BUILDERS:
        return

    def worker():
        try:
            _build_full_cache(run_manager, run_id)
        finally:
            _CACHE_BUILDERS.discard(run_id)

    _CACHE_BUILDERS.add(run_id)
    threading.Thread(target=worker, name=f"tb-cache-{run_id}", daemon=True).start()


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
    if extra:
        parts.append(extra)
    h = hashlib.sha1('|'.join(sorted(parts)).encode()).hexdigest()
    return f'W/"{h}"'


def list_tags(run_manager: RunManager, run_id: str, request: Request | None = None):
    r = run_manager.get(run_id)
    out_dir = Path(r.out_dir)

    cache = _load_tags_cache(out_dir)
    if cache:
        scalars = sorted(set(cache.get("scalars") or []))
        histos = sorted(set(cache.get("histograms") or []))
    else:
        progress = _load_progress_scalars(out_dir)
        scalars_set: set[str] = set(progress.keys()) if progress else set()
        scalar_cache = _load_scalar_cache(out_dir)
        if scalar_cache:
            scalars_set.update(scalar_cache.keys())
        scalars = sorted(scalars_set)
        histos = []
        ensure_cache_async(run_manager, run_id)

    extra = "tags:" + ";".join(scalars) + "|" + ";".join(histos)
    etag = _tb_etag(out_dir, extra=extra)
    if request is not None:
        inm = request.headers.get("if-none-match")
        if inm and inm == etag:
            raise HTTPException(status_code=304, detail="Not Modified")
    resp = JSONResponse({"scalars": scalars, "histograms": histos})
    resp.headers["ETag"] = etag
    return resp


def scalar_series(run_manager: RunManager, run_id: str, tag: str) -> Dict[str, Any]:
    r = run_manager.get(run_id)
    out_dir = Path(r.out_dir)

    progress = _load_progress_scalars(out_dir)
    if progress:
        pts = progress.get(tag)
        if pts:
            return {"tag": tag, "points": pts}

    cache_data = _load_scalar_cache(out_dir)
    if cache_data:
        cached_pts = cache_data.get(tag)
        if cached_pts:
            return {"tag": tag, "points": _downsample_points(list(cached_pts))}

    ensure_cache_async(run_manager, run_id)
    deadline = time.time() + 5.0
    while run_id in _CACHE_BUILDERS and time.time() < deadline:
        time.sleep(0.2)
        cache_data = _load_scalar_cache(out_dir)
        if cache_data:
            cached_pts = cache_data.get(tag)
            if cached_pts:
                return {"tag": tag, "points": _downsample_points(list(cached_pts))}

    cache_data = _load_scalar_cache(out_dir)
    if cache_data:
        cached_pts = cache_data.get(tag)
        if cached_pts:
            return {"tag": tag, "points": _downsample_points(list(cached_pts))}

    return {"tag": tag, "points": []}


def histogram_series(run_manager: RunManager, run_id: str, tag: str, request: Request | None = None):
    r = run_manager.get(run_id)
    out_dir = Path(r.out_dir)
    accs = []
    try:
        for directory in _find_tb_event_dirs(out_dir):
            accs.append(_get_accumulator(directory))
    except Exception:
        accs = []

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
    r = run_manager.get(run_id)
    out_dir = Path(r.out_dir)

    cache = _load_grad_cache(out_dir)
    if cache:
        body = {
            "layers": cache.get("layers") or [],
            "steps": cache.get("steps") or [],
            "values": cache.get("values") or [],
        }
    else:
        ensure_cache_async(run_manager, run_id)
        deadline = time.time() + 5.0
        while run_id in _CACHE_BUILDERS and time.time() < deadline:
            time.sleep(0.2)
            cache = _load_grad_cache(out_dir)
            if cache:
                break
        cache = _load_grad_cache(out_dir)
        if cache:
            body = {
                "layers": cache.get("layers") or [],
                "steps": cache.get("steps") or [],
                "values": cache.get("values") or [],
            }
        else:
            body = {"layers": [], "steps": [], "values": []}

    extra = "grad:" + ";".join(body["layers"]) + "|" + ";".join(map(str, body["steps"]))
    etag = _tb_etag(out_dir, extra=extra)
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
    unique_tags = list(dict.fromkeys(tags))
    series: Dict[str, List[Dict[str, Any]]] = {tag: [] for tag in unique_tags}

    progress = _load_progress_scalars(out_dir)
    if progress:
        for tag in unique_tags:
            pts = progress.get(tag)
            if pts:
                series[tag] = pts

    scalar_cache = _load_scalar_cache(out_dir)
    if scalar_cache:
        for tag in unique_tags:
            if series[tag]:
                continue
            cached = scalar_cache.get(tag)
            if cached:
                series[tag] = _downsample_points(list(cached))

    missing = [tag for tag in unique_tags if not series[tag]]
    if missing:
        ensure_cache_async(run_manager, run_id)
        deadline = time.time() + 5.0
        while missing and run_id in _CACHE_BUILDERS and time.time() < deadline:
            time.sleep(0.2)
            scalar_cache = _load_scalar_cache(out_dir)
            if not scalar_cache:
                continue
            for tag in list(missing):
                cached = scalar_cache.get(tag)
                if cached:
                    series[tag] = _downsample_points(list(cached))
                    missing.remove(tag)
        scalar_cache = _load_scalar_cache(out_dir)
        if scalar_cache:
            for tag in missing:
                cached = scalar_cache.get(tag)
                if cached:
                    series[tag] = _downsample_points(list(cached))

    body = {"series": {tag: series.get(tag, []) for tag in unique_tags}}
    extra = "batch:" + ";".join(sorted(unique_tags))
    etag = _tb_etag(out_dir, extra=extra)
    if request is not None:
        inm = request.headers.get("if-none-match")
        if inm and inm == etag:
            raise HTTPException(status_code=304, detail="Not Modified")
    resp = JSONResponse(body)
    resp.headers["ETag"] = etag
    return resp
