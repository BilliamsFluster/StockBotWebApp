from fastapi import APIRouter, Request, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from api.controllers import jarvis_controller
from jarvis.ws_handler import handle_voice_ws
from jarvis.jarvis_service import JarvisService
from jarvis.ollama_agent import OllamaAgent

from api.models.jarvis_models import PromptRequest, StartVoiceRequest, SchwabAuthRequest

router = APIRouter()
ollama_agent = OllamaAgent("qwen3:8b")
jarvis_service = JarvisService(llm_agent=ollama_agent)

@router.post("/chat/ask")
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

@router.post("/authorize")
async def authorize_schwab(req: SchwabAuthRequest):
    return jarvis_controller.store_schwab_tokens(req)

@router.get("/portfolio")
async def get_portfolio_data():
    return await jarvis_controller.get_portfolio_data()


@router.post("/audio")
async def jarvis_audio(file: UploadFile = File(...)):
    return await jarvis_controller.process_jarvis_audio(file)

@router.get("/audio/play")
def play_jarvis_audio():
    return FileResponse(jarvis_controller.get_jarvis_audio_file(), media_type="audio/mpeg")


@router.websocket("/voice/ws")
async def jarvis_voice_ws(websocket: WebSocket):
    await handle_voice_ws(websocket, jarvis_service)

