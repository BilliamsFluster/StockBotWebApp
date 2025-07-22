from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import subprocess
import os
import json
from sse_starlette.sse import EventSourceResponse
from fastapi import Request
import asyncio

listeners: set[asyncio.Queue] = set()

# Your internal modules
import Core.config.shared_state as shared_state
from Core.web.web_search import fetch_financial_snippets
from Core.API.data_fetcher import get_account_data_for_ai
from Core.ollama.ollama_llm import generate_analysis

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Models ===

class PromptRequest(BaseModel):
    prompt: str 
    model: str
    format: str

class StartVoiceRequest(BaseModel):
    model: str
    format: str

voice_process = None

# === Endpoints ===

@app.post("/api/jarvis/ask")
async def ask_jarvis(request: PromptRequest):
    try:
        headlines = fetch_financial_snippets()
        account_data = get_account_data_for_ai()

        combined_prompt = (
            f"{request.prompt}\n\n"
            f"---\nRecent Market Headlines:\n{headlines}\n\n"
            f"---\nAccount Summary:\n{account_data}"
        )

        result = generate_analysis(
            combined_prompt,
            model=request.model,
            output_format=request.format
        )

        return {"response": result}
    except Exception as e:
        print("🔴 Jarvis failed:", str(e))
        return {"error": "Failed to generate response"}


@app.post("/api/jarvis/voice/start")
async def start_voice(request: StartVoiceRequest):
    global voice_process

    if voice_process and voice_process.poll() is None:
        return {"error": "Voice assistant already running."}

    print("🔍 Launching voice assistant from: Core/ollama/voice_entrypoint.py")

    try:
        # Write shared_state.json
        config = {
            "model": request.model,
            "format": request.format,
            "access_token": "abc123"  # Optional: replace if needed
        }

        json_path = os.path.abspath("Core/config/shared_state.json")
        os.makedirs(os.path.dirname(json_path), exist_ok=True)

        with open(json_path, "w") as f:
            json.dump(config, f)

        # Launch subprocess
        python_path = os.path.abspath("venv/Scripts/python.exe")
        voice_process = subprocess.Popen(
            [python_path, "Core/ollama/voice_entrypoint.py"],
            env=os.environ
        )

        return {"message": "Voice assistant started."}
    except Exception as e:
        print("❌ Failed to launch voice assistant:", str(e))
        return {"error": f"Failed to start voice assistant: {str(e)}"}


@app.post("/api/jarvis/voice/stop")
async def stop_voice():
    global voice_process

    if voice_process and voice_process.poll() is None:
        voice_process.terminate()
        voice_process.wait()
        voice_process = None
        return {"message": "Voice assistant stopped."}

    return {"error": "Voice assistant not running."}



@app.post("/api/jarvis/voice/event")
async def voice_event(request: Request):
    """Receive speech sentences from subprocess via POST."""
    payload = await request.json()
    text = payload.get("text")
    for q in listeners:
        await q.put(text)
    return {"ok": True}

@app.get("/api/jarvis/voice/stream")
async def voice_stream():
    """SSE endpoint that frontend subscribes to."""
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
