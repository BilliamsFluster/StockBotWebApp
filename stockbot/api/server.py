from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import subprocess
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PromptRequest(BaseModel):
    prompt: str
    model: str
    format: str

voice_process = None 


@app.post("/api/jarvis/ask")
async def ask_jarvis(request: PromptRequest):
    return {
        "response": f"Received prompt: {request.prompt} using {request.model} in {request.format}"
    }

@app.post("/api/jarvis/voice/start")
async def start_voice():
    global voice_process

    if voice_process and voice_process.poll() is None:
        return {"error": "Voice assistant already running."}

    print("🔍 Launching voice assistant from: Core/ollama/voice_entrypoint.py")

    try:
        voice_process = subprocess.Popen(
            ["python", "Core/ollama/voice_entrypoint.py"],
            env=os.environ
        )
        return {"message": "Voice assistant started."}
    except Exception as e:
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
