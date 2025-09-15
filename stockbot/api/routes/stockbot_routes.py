from fastapi import APIRouter, BackgroundTasks, File, UploadFile, Depends, Request, WebSocket, HTTPException, status
from fastapi.responses import StreamingResponse
import asyncio
import os
import json
import hashlib
import yaml
from pathlib import Path
from api.controllers.stockbot_controller import (
    TrainRequest,
    BacktestRequest,
    start_train_job,
    start_backtest_job,
    start_train_job as start_cv_job,
    list_runs,
    get_run,
    get_artifacts,
    get_artifact_file,
    tb_list_tags_for_run,
    tb_scalar_series_for_run,
    tb_histogram_series_for_run,
    tb_grad_matrix_for_run,
    tb_scalars_batch_for_run,
    save_policy_upload,
    bundle_zip,
    cancel_run,
    delete_run,
)
from api.controllers.insights_controller import InsightsRequest, generate_insights
from api.controllers.highlights_controller import HighlightsRequest, generate_highlights
from api.controllers.trade_controller import (
    TradeStartRequest,
    TradeStatusRequest,
    start_live,
    status_live,
    stop_live,
)
import asyncio
import os
import json
import time
from pathlib import Path


'''def verify_api_key(request: Request): -- security will be implemented soon
    expected = os.getenv("STOCKBOT_API_KEY")
    if not expected:
        raise RuntimeError("STOCKBOT_API_KEY not configured")
    api_key = request.headers.get("X-API-Key")
    if api_key != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


router = APIRouter(dependencies=[Depends(verify_api_key)])'''
router = APIRouter()



@router.post("/train")
async def post_train(req: TrainRequest, bg: BackgroundTasks):
    return await start_train_job(req, bg)


@router.post("/backtest")
async def post_backtest(req: BacktestRequest, bg: BackgroundTasks):
    return await start_backtest_job(req, bg)


@router.post("/cv")
async def post_cv(req: TrainRequest, bg: BackgroundTasks):
    return await start_cv_job(req, bg)


@router.get("/runs")
def get_runs():
    return list_runs()


@router.get("/runs/{run_id}")
def get_run_status(run_id: str):
    return get_run(run_id)


@router.get("/runs/{run_id}/artifacts")
def get_run_artifacts(run_id: str):
    return get_artifacts(run_id)


@router.get("/runs/{run_id}/files/{name}")
def get_run_artifact_file(run_id: str, name: str):
    return get_artifact_file(run_id, name)


@router.get("/runs/{run_id}/bundle")
def get_run_bundle(run_id: str, include_model: bool = True):
    return bundle_zip(run_id, include_model=include_model)


# ---- TensorBoard data ----
@router.get("/runs/{run_id}/tb/tags")
def get_run_tb_tags(run_id: str, request: Request):
    return tb_list_tags_for_run(run_id, request)


@router.get("/runs/{run_id}/tb/scalars")
def get_run_tb_scalars(run_id: str, tag: str):
    return tb_scalar_series_for_run(run_id, tag)


@router.get("/runs/{run_id}/tb/histograms")
def get_run_tb_histograms(run_id: str, tag: str, request: Request):
    return tb_histogram_series_for_run(run_id, tag)


@router.get("/runs/{run_id}/tb/grad-matrix")
def get_run_tb_grad_matrix(run_id: str, request: Request):
    return tb_grad_matrix_for_run(run_id, request)


@router.get("/runs/{run_id}/tb/scalars-batch")
def get_run_tb_scalars_batch(run_id: str, tags: str, request: Request):
    tag_list = [t for t in (tags or "").split(",") if t]
    return tb_scalars_batch_for_run(run_id, tag_list, request)


@router.post("/runs/{run_id}/cancel")
def post_cancel_run(run_id: str):
    return cancel_run(run_id)


@router.delete("/runs/{run_id}")
def delete_run_route(run_id: str):
    return delete_run(run_id)


# ---- Live trading endpoints ----


@router.post("/trade/start")
def trade_start(req: TradeStartRequest):
    return start_live(req)


@router.post("/trade/status")
def trade_status(req: TradeStatusRequest):
    return status_live(req)


@router.post("/trade/stop")
def trade_stop():
    return stop_live()


# Optional: WebSocket live status (parallel to SSE stream)
@router.websocket("/runs/{run_id}/ws")
async def ws_run_status(ws: WebSocket, run_id: str):
    await ws.accept()
    try:
        from api.controllers.stockbot_controller import RUN_MANAGER  # lazy import
        last = None
        while True:
            rec = RUN_MANAGER.get(run_id)
            payload = {
                "id": rec.id,
                "type": rec.type,
                "status": rec.status,
                "out_dir": rec.out_dir,
                "created_at": rec.created_at,
                "started_at": rec.started_at,
                "finished_at": rec.finished_at,
                "error": rec.error,
            }
            if payload != last:
                await ws.send_json(payload)
                last = payload
            if rec.status in ("SUCCEEDED", "FAILED", "CANCELLED"):
                break
            await asyncio.sleep(1.0)
    except Exception:
        pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass


@router.get("/runs/{run_id}/stream")
async def stream_run_status(run_id: str):
    """Server-Sent Events stream of run status until terminal; emits JSON per event."""
    from api.controllers.stockbot_controller import RUN_MANAGER  # lazy import to avoid cycles

    async def event_gen():
        last = None
        sent_init = False
        while True:
            rec = RUN_MANAGER.get(run_id)
            if not sent_init:
                if isinstance(rec.meta, dict):
                    payload_obj = rec.meta.get("payload") or rec.meta
                    cfg_path = rec.meta.get("config_snapshot") or rec.meta.get("resolved_config")
                else:
                    payload_obj = {}
                    cfg_path = None
                cfg = {}
                if cfg_path:
                    try:
                        cfg = yaml.safe_load(Path(cfg_path).read_text()) or {}
                    except Exception:
                        cfg = {}
                try:
                    payload_hash = hashlib.sha256(json.dumps(payload_obj or {}, sort_keys=True).encode()).hexdigest()
                except Exception:
                    payload_hash = ""
                init = {"payload_hash": payload_hash, "config": cfg}
                yield "event: init\n" + "data: " + json.dumps(init) + "\n\n"
                sent_init = True

            payload = {
                "id": rec.id,
                "type": rec.type,
                "status": rec.status,
                "out_dir": rec.out_dir,
                "created_at": rec.created_at,
                "started_at": rec.started_at,
                "finished_at": rec.finished_at,
                "error": rec.error,
            }
            if payload != last:
                yield "data: " + json.dumps(payload) + "\n\n"
                last = payload
            # break if terminal
            if rec.status in ("SUCCEEDED", "FAILED", "CANCELLED"):
                return
            await asyncio.sleep(1.0)

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# ---- Telemetry SSE (per-bar and events) ----

def _telemetry_paths(out_dir: Path):
    telem = out_dir / "live_telemetry.jsonl"
    ev = out_dir / "live_events.jsonl"
    roll = out_dir / "live_rollups.jsonl"
    return telem, ev, roll


async def _tail_jsonl(path: Path, *, from_start: bool = False, event_name: str = "message"):
    """Async generator that tails a JSONL file and yields SSE frames."""
    sent_init = False
    # Wait for file to appear with backoff
    delay = 0.1
    waited = 0.0
    while not path.exists():
        await asyncio.sleep(delay)
        waited += delay
        delay = min(delay * 1.5, 2.0)
        if waited > 60.0:
            # give up after a minute with an init error
            yield f"event: error\ndata: {{\"error\": \"file_not_found\"}}\n\n"
            return
    try:
        with path.open("r", encoding="utf-8") as f:
            if not from_start:
                # seek to end so we only stream fresh lines
                f.seek(0, os.SEEK_END)
            while True:
                line = f.readline()
                if not line:
                    await asyncio.sleep(0.25)
                    continue
                line = line.strip()
                if not line:
                    continue
                # Small sanity: ensure it's JSON; fallback to raw line
                try:
                    _ = json.loads(line)
                except Exception:
                    payload = json.dumps({"raw": line})
                else:
                    payload = line
                yield f"event: {event_name}\n" + "data: " + payload + "\n\n"
    except asyncio.CancelledError:
        return


@router.get("/runs/{run_id}/telemetry")
async def stream_run_telemetry(run_id: str, from_start: bool = False):
    out_dir = _resolve_out_dir_for_run(run_id)
    if out_dir is None:
        async def not_found():
            yield "event: error\n" + "data: {\"error\": \"run_not_found\"}\n\n"
        return StreamingResponse(not_found(), media_type="text/event-stream")
    telem_path, _ev_path, _ = _telemetry_paths(out_dir)

    async def gen():
        # initial metadata event (best-effort)
        try:
            from api.controllers.stockbot_controller import RUN_MANAGER
            rec = RUN_MANAGER.get(run_id)
            meta = rec.meta if isinstance(rec.meta, dict) else {}
            init = {
                "run_id": rec.id,
                "type": rec.type,
                "created_at": rec.created_at,
                "config": meta.get("resolved_config") or meta.get("config_snapshot") or None,
            }
        except Exception:
            init = {"run_id": run_id}
        yield "event: init\n" + "data: " + json.dumps(init) + "\n\n"
        async for frame in _tail_jsonl(telem_path, from_start=from_start, event_name="bar"):
            yield frame

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/runs/{run_id}/events")
async def stream_run_events(run_id: str, from_start: bool = True):
    out_dir = _resolve_out_dir_for_run(run_id)
    if out_dir is None:
        async def not_found():
            yield "event: error\n" + "data: {\"error\": \"run_not_found\"}\n\n"
        return StreamingResponse(not_found(), media_type="text/event-stream")
    _telem_path, ev_path, _ = _telemetry_paths(out_dir)

    async def gen():
        init = {"run_id": run_id}
        yield "event: init\n" + "data: " + json.dumps(init) + "\n\n"
        async for frame in _tail_jsonl(ev_path, from_start=from_start, event_name="event"):
            yield frame

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/policies")
async def upload_policy(file: UploadFile = File(...)):
    return await save_policy_upload(file)


def _resolve_out_dir_for_run(run_id: str) -> Path | None:
    """Resolve out_dir for a run id without raising 404.

    Tries registry first; if missing, falls back to RUNS_DIR/<run_id>.
    """
    try:
        from api.controllers.stockbot_controller import RUN_MANAGER
        rec = RUN_MANAGER.get(run_id)
        return Path(rec.out_dir)
    except Exception:
        try:
            from api.controllers.stockbot_controller import RUNS_DIR
            p = Path(RUNS_DIR) / run_id
            return p if p.exists() else None
        except Exception:
            return None

@router.post("/insights")
def post_insights(req: InsightsRequest):
    return generate_insights(req)


@router.post("/highlights")
def post_highlights(req: HighlightsRequest):
    return generate_highlights(req)

