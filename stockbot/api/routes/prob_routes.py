from fastapi import APIRouter

from api.controllers.prob_controller import (
    ProbTrainRequest,
    ProbInferRequest,
    ProbInferResponse,
    train,
    infer,
)

router = APIRouter()


@router.post("/train")
async def train_endpoint(req: ProbTrainRequest):
    return train(req)


@router.post("/infer", response_model=ProbInferResponse)
async def infer_endpoint(req: ProbInferRequest):
    return infer(req)
