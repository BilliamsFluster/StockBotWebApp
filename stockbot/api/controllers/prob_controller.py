from pathlib import Path
from pydantic import BaseModel
from typing import List, Dict

from prob import train_model, infer_sequence


class ProbTrainRequest(BaseModel):
    series: List[float]
    n_states: int = 2
    out_dir: str


class ProbInferRequest(BaseModel):
    series: List[float]
    model_dir: str


class ProbInferResponse(BaseModel):
    posteriors: List[Dict[str, float]]
    p_up: float
    expected_return: float
    variance: float


def train(req: ProbTrainRequest) -> dict:
    out = Path(req.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    train_model(req.series, req.n_states, str(out))
    return {"out_dir": str(out)}


def infer(req: ProbInferRequest) -> ProbInferResponse:
    res = infer_sequence(req.model_dir, req.series)
    return ProbInferResponse(**res)
