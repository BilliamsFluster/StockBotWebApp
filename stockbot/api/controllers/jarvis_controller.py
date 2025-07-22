from fastapi import Request
from api.models.jarvis_models import PromptRequest, StartVoiceRequest
import subprocess, os, json, asyncio
from sse_starlette.sse import EventSourceResponse

# Local modules
from Core.config import shared_state
from Core.web.web_search import fetch_financial_snippets
from Core.API.data_fetcher import get_account_data_for_ai
from Core.ollama.ollama_llm import generate_analysis

listeners: set[asyncio.Queue] = set()
voice_process = None

async def ask_jarvis(request):
    try:
        headlines = fetch_financial_snippets()
        account_data = get_account_data_for_ai()
        combined_prompt = (
            f"{request.prompt}\n\n"
            f"---\nRecent Market Headlines:\n{headlines}\n\n"
            f"---\nAccount Summary:\n{account_data}"
        )
        result = generate_analysis(
            combined_prompt, model=request.model, output_format=request.format
        )
        return {"response": result}
    except Exception as e:
        print("🔴 Jarvis failed:", str(e))
        return {"error": "Failed to generate response"}

async def start_voice(request):
    global voice_process
    if voice_process and voice_process.poll() is None:
        return {"error": "Voice assistant already running."}

    config = {
        "model": request.model,
        "format": request.format,
        "access_token": "abc123"
    }

    json_path = os.path.abspath("Core/config/shared_state.json")
    os.makedirs(os.path.dirname(json_path), exist_ok=True)
    with open(json_path, "w") as f:
        json.dump(config, f)

    try:
        python_path = os.path.abspath("venv/Scripts/python.exe")
        voice_process = subprocess.Popen(
            [python_path, "Core/ollama/voice_entrypoint.py"],
            env=os.environ
        )
        return {"message": "Voice assistant started."}
    except Exception as e:
        print("❌ Launch failed:", str(e))
        return {"error": f"Failed to start voice assistant: {str(e)}"}

async def stop_voice():
    global voice_process
    if voice_process and voice_process.poll() is None:
        voice_process.terminate()
        voice_process.wait()
        voice_process = None
        return {"message": "Voice assistant stopped."}
    return {"error": "Voice assistant not running."}

async def voice_event(request: Request):
    payload = await request.json()
    text = payload.get("text")
    for q in listeners:
        await q.put(text)
    return {"ok": True}

async def voice_stream():
    queue: asyncio.Queue = asyncio.Queue()
    listeners.add(queue)

    async def event_generator():
        try:
            while True:
                text = await queue.get()
                yield {"event": "message", "data": text}
        except asyncio.CancelledError:
            pass
        finally:
            listeners.remove(queue)

    return EventSourceResponse(event_generator())
