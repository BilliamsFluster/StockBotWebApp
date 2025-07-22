from fastapi import APIRouter, Request
from api.controllers import jarvis_controller
from api.models.jarvis_models import PromptRequest, StartVoiceRequest

router = APIRouter()


@router.post("/ask")
async def ask_jarvis(req: PromptRequest):
    return await jarvis_controller.ask_jarvis(req)

@router.post("/voice/start")
async def start_voice(req: StartVoiceRequest):
    return await jarvis_controller.start_voice(req)

@router.post("/voice/stop")
async def stop_voice():
    return await jarvis_controller.stop_voice()

@router.post("/voice/event")
async def voice_event(request: Request):
    return await jarvis_controller.voice_event(request)

@router.get("/voice/stream")
async def voice_stream():
    return await jarvis_controller.voice_stream()
