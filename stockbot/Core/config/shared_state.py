import json
import os
from multiprocessing import Event

access_token = None
refresh_token = None
appKey = None
appSecret = None
quiet_mode = False
gui_output_queue = None
is_speaking = Event()
model = None
format_type = None



# shared_state.py

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





# Step 1: Determine the directory this script is in
script_dir = os.path.dirname(os.path.abspath(__file__))

# Step 2: Define the path to the text file
file_path = os.path.join(script_dir, "jarvis_prompt.txt")

# Step 3: Print debug info
print("Looking for prompt file at:", file_path)
print("File exists:", os.path.exists(file_path))

# Step 4: Read the file content if it exists
if os.path.exists(file_path):
    with open(file_path, "r", encoding="utf-8") as file:
        JARVIS_INSTRUCTION = file.read()
    print("Prompt loaded successfully.")
else:
    raise FileNotFoundError(f"Could not find jarvis_instruction.txt at: {file_path}")