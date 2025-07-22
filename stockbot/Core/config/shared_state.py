import json
import os
from threading import Event

# === GLOBALS ===
access_token = None
refresh_token = None
appKey = None
appSecret = None
quiet_mode = False
gui_output_queue = None
is_speaking = Event()
model = None
format_type = None
voice_event = None
voice_output_queue = None


# === SCHWAB AUTH SETUP ===
def set_schwab_credentials(key: str, secret: str):
    global appKey, appSecret
    appKey = key
    appSecret = secret


def load_access_token(path="tokens.json"):
    global access_token

    if not os.path.exists(path):
        raise FileNotFoundError(f"Token file '{path}' not found.")

    with open(path, "r") as f:
        data = json.load(f)

    if "access_token" not in data:
        raise KeyError("'access_token' not found in token file.")

    access_token = data["access_token"]


# === JARVIS SYSTEM PROMPT LOADER ===
# Load a prompt from a local txt file (used to prime the assistant)

script_dir = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(script_dir, "jarvis_prompt.txt")

print("Looking for prompt file at:", file_path)
print("File exists:", os.path.exists(file_path))

JARVIS_INSTRUCTION = ""
if os.path.exists(file_path):
    with open(file_path, "r", encoding="utf-8") as file:
        JARVIS_INSTRUCTION = file.read()
    print("Prompt loaded successfully.")
else:
    raise FileNotFoundError(f"Could not find jarvis_prompt.txt at: {file_path}")


# === DYNAMIC RUNTIME CONFIG LOADER ===
def load_runtime_config(path="Core/config/shared_state.json"):
    global model, format_type, access_token

    if not os.path.exists(path):
        print(f"[WARN] shared_state.json not found at {path}")
        return

    try:
        with open(path, "r") as f:
            data = json.load(f)
        model = data.get("model", model)
        format_type = data.get("format", format_type)
        access_token = data.get("access_token", access_token)
        print(f"[OK] Loaded runtime config: model={model}, format={format_type}")
    except Exception as e:
        print(f"[ERROR] Failed to load shared_state.json: {e}")
