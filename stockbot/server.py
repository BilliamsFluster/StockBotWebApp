from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes.jarvis_routes import router as jarvis_router
from api.routes.broker_routes import router as broker_router


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
app.include_router(jarvis_router, prefix="/api/jarvis")
app.include_router(broker_router, prefix="/api/stockbot/broker")
