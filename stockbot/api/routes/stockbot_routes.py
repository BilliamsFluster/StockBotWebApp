from fastapi import APIRouter, BackgroundTasks, File, UploadFile, Depends, Request, HTTPException, status
import os
from api.controllers.stockbot_controller import (
    TrainRequest,
    BacktestRequest,
    start_train_job,
    start_backtest_job,
    list_runs,
    get_run,
    get_artifacts,
    get_artifact_file,
    save_policy_upload,
    bundle_zip,
)
from api.controllers.insights_controller import InsightsRequest, generate_insights
from api.controllers.highlights_controller import HighlightsRequest, generate_highlights


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


@router.post("/policies")
async def upload_policy(file: UploadFile = File(...)):
    return await save_policy_upload(file)


@router.post("/insights")
def post_insights(req: InsightsRequest):
    return generate_insights(req)


@router.post("/highlights")
def post_highlights(req: HighlightsRequest):
    return generate_highlights(req)

