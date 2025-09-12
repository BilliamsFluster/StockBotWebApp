from fastapi import APIRouter, Request, UploadFile, File, WebSocket, WebSocketDisconnect, Depends
from fastapi.responses import FileResponse
from api.controllers import jarvis_controller as ctrl
from jarvis.jarvis_service import JarvisService

#mm = MemoryManager(storage_dir="data/memory")

router = APIRouter()

#ollama_agent = OllamaAgent("llama3:8b", mm)
#hugging_face_agent = HuggingFaceAgent(
#    model="ceadar-ie/FinanceConnect-13B",
#    use_local=True,
#    memory_manager=mm,
#    local_cache_root=r"D:\huggingface\transformers",  # root that contains models--...
#    gen_timeout=15,                                   # watchdog seconds
#    default_max_new_tokens=96,                        # quick voice replies
#)

#jarvis_service = JarvisService(llm_agent=ollama_agent)

@router.post("/chat/ask", response_model=ctrl.ChatAskOut)
def chat_ask(
    req: ctrl.ChatAskIn,
    service: JarvisService = Depends(ctrl.get_jarvis_service),
):
    # Pass the DI-injected service to the controller
    return ctrl.chat_ask(req, service=service)


@router.websocket("/voice/ws")
async def jarvis_voice_ws(
    websocket: WebSocket,
    service: JarvisService = Depends(ctrl.get_jarvis_service),
):
    # Pass the DI-injected service to the controller
    await ctrl.voice_ws(websocket, service=service)

@router.post("/edit/plan", response_model=ctrl.EditPlanOut)
def edit_plan(
    req: ctrl.EditPlanIn,
    service: JarvisService = Depends(ctrl.get_jarvis_service),
):
    # Pass the DI-injected service to the controller
    return ctrl.plan_edit(req, service=service)
