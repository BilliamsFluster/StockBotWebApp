from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from api.routes.jarvis_routes import router as jarvis_router
from api.routes.broker_routes import router as broker_router
from api.routes.stockbot_routes import router as stockbot_router
from api.controllers.stockbot_controller import RUNS_DIR
from pathlib import Path

from providers.provider_manager import ProviderManager

app = FastAPI()
Pro = ProviderManager()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
app.include_router(jarvis_router,  prefix="/api/jarvis")
app.include_router(broker_router,  prefix="/api/stockbot/broker")
app.include_router(stockbot_router, prefix="/api/stockbot")


app.mount("/runs", StaticFiles(directory=str(RUNS_DIR), html=False), name="runs")
