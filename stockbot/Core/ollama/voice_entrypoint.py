import sys
import os

# Set up absolute imports for core project
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.append(project_root)

from Core.ollama.voice_assistant import voice_loop
from queue import Queue
from threading import Event

if __name__ == "__main__":
    print("🟢 voice_entrypoint starting...")

    # ✅ Load model config from environment
    model = os.getenv("MODEL", "llama3")
    format_type = os.getenv("FORMAT", "text")
    access_token = os.getenv("ACCESS_TOKEN", "dummy-token")

    # ✅ Setup runtime flags and queues
    voice_output_queue = Queue()
    voice_event = Event()
    voice_event.set()

    is_speaking = Event()

    # ✅ Log the values
    print(f"🔊 Starting voice assistant loop with model: {model}, format: {format_type}")
    print(f"🔑 Access token: {access_token[:10]}...")

    # ✅ Start the voice loop
    voice_loop(
        voice_event,
        voice_output_queue,
        model,
        format_type,
        access_token,
        is_speaking
    )
