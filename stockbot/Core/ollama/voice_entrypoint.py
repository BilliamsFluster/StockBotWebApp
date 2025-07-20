import sys
import os

# Add project root (e.g., stockbot/) to sys.path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.append(project_root)


from Core.ollama.voice_assistant import voice_loop
import Core.config.shared_state as shared_state
from multiprocessing import Queue, Event


if __name__ == "__main__":
    voice_output_queue = Queue()
    voice_event = Event()
    shared_state.voice_event = voice_event
    shared_state.voice_output_queue = voice_output_queue

    print("🔊 Starting voice assistant loop...")
    voice_loop(shared_state.voice_output_queue, shared_state.voice_event)

