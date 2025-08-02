from fastapi import APIRouter, Request
from api.controllers import broker_controller
from api.models.broker_models import PortfolioRequest

router = APIRouter()


@router.post("/portfolio")
async def get_portfolio_data(req: PortfolioRequest):
    return await broker_controller.get_portfolio_data(req.broker, req.credentials)