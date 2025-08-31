from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from fastapi.staticfiles import StaticFiles
from api.routes.broker_routes import router as broker_router
from api.routes.stockbot_routes import router as stockbot_router
from api.routes.prob_routes import router as prob_router
from api.controllers.stockbot_controller import RUNS_DIR
from pathlib import Path

from providers.provider_manager import ProviderManager

app = FastAPI()
Pro = ProviderManager()

allowed = os.getenv("ALLOWED_ORIGINS")
if not allowed and os.getenv("NODE_ENV") == "production":
    raise RuntimeError("ALLOWED_ORIGINS must be set in production")

origins = [o.strip() for o in allowed.split(",")] if allowed else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
if os.getenv("INCLUDE_JARVIS", "true").lower() not in ("0", "false"):
    from api.routes.jarvis_routes import router as jarvis_router
    app.include_router(jarvis_router,  prefix="/api/jarvis")

app.include_router(broker_router,  prefix="/api/stockbot/broker")
app.include_router(stockbot_router, prefix="/api/stockbot")
app.include_router(prob_router,    prefix="/api/stockbot/prob")


app.mount("/runs", StaticFiles(directory=str(RUNS_DIR), html=False), name="runs")
