import sys
import os

# Set up absolute imports for core project
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.append(project_root)

# 🔧 Imports
from Core.ollama.voice_assistant import voice_loop
from Core.config import shared_state

shared_state.load_runtime_config()
from queue import Queue
from threading import Event

import time

if __name__ == "__main__":
    print("🟢 voice_entrypoint starting...")

    # Setup communication primitives
    voice_output_queue = Queue()
    voice_event = Event()
    voice_event.set()  # ✅ Must be set initially or voice loop exits

    shared_state.voice_event = voice_event
    shared_state.voice_output_queue = voice_output_queue
    print("🔊 Starting voice assistant with model:", shared_state.model)
    # Ensure shared_state values are initialized
    shared_state.model = shared_state.model or "llama3"
    shared_state.format_type = shared_state.format_type or "text"
    shared_state.access_token = shared_state.access_token or "dummy-token"
    shared_state.is_speaking = shared_state.is_speaking or Event()

    print(f"🔊 Starting voice assistant loop with model: {shared_state.model}, format: {shared_state.format_type}")
    print(">>> voice_event is set:", shared_state.voice_event.is_set())
    

    # Call the loop
    voice_loop(
        shared_state.voice_event,
        shared_state.voice_output_queue,
        shared_state.model,
        shared_state.format_type,
        shared_state.access_token,
        shared_state.is_speaking
    )
