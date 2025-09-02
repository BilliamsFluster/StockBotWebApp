from __future__ import annotations

import asyncio
import os
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, WebSocket, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from api.models.run_models import BacktestRequest, TrainRequest
from api.services.run_service import (
    start_train_job,
    start_backtest_job,
    list_runs,
    get_run,
    get_artifacts,
    get_artifact_file,
    bundle_zip,
    cancel_run,
    delete_run,
    save_policy_upload,
    RUNS,
)
from api.utils.tb_utils import (
    tb_list_tags_for_run,
    tb_scalar_series_for_run,
    tb_histogram_series_for_run,
    tb_grad_matrix_for_run,
    tb_scalars_batch_for_run,
)
from api.controllers.insights_controller import InsightsRequest, generate_insights
from api.controllers.highlights_controller import HighlightsRequest, generate_highlights

router = APIRouter()


@router.post("/train")
async def post_train(req: TrainRequest, bg: BackgroundTasks):
    return await start_train_job(req, bg)


@router.post("/backtest")
async def post_backtest(req: BacktestRequest, bg: BackgroundTasks):
    return await start_backtest_job(req, bg)


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
    return tb_histogram_series_for_run(run_id, tag, request)


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


@router.websocket("/runs/{run_id}/ws")
async def ws_run_status(ws: WebSocket, run_id: str):
    await ws.accept()
    try:
        last = None
        while True:
            rec = RUNS.get(run_id)
            if not rec:
                await ws.send_json({"error": "not found"})
                break
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
    async def event_gen():
        last = None
        while True:
            rec = RUNS.get(run_id)
            if not rec:
                yield "event: error\n" + f"data: {{\"error\": \"not found\"}}\n\n"
                return
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
                import json
                yield "data: " + json.dumps(payload) + "\n\n"
                last = payload
            if rec.status in ("SUCCEEDED", "FAILED", "CANCELLED"):
                return
            await asyncio.sleep(1.0)

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@router.post("/policies")
async def upload_policy(file: UploadFile = File(...)):
    return await save_policy_upload(file)


@router.post("/insights")
def post_insights(req: InsightsRequest):
    return generate_insights(req)


@router.post("/highlights")
def post_highlights(req: HighlightsRequest):
    return generate_highlights(req)
