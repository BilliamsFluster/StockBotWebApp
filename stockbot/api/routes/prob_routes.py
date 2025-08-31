from fastapi import APIRouter

from api.controllers.prob_controller import (
    ProbTrainRequest,
    ProbInferRequest,
    train,
    infer,
)

router = APIRouter()


@router.post("/train")
async def train_endpoint(req: ProbTrainRequest):
    return train(req)


@router.post("/infer")
async def infer_endpoint(req: ProbInferRequest):
    return infer(req)
