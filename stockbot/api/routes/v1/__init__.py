from fastapi import APIRouter
from api.routes.jarvis_routes import router as jarvis_router

router = APIRouter()

router.include_router(jarvis_router, prefix="/jarvis")
