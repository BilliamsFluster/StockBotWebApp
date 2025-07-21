# Core/config/config_manager.py

import os, json
from tkinter.simpledialog import askstring
from tkinter import Tk



# Determine the project root (two levels up from this file)
PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), os.pardir, os.pardir)
)

CONFIG_PATH = os.path.join(PROJECT_ROOT, "tradingbot_config.json")

# ─── CONFIG ────────────────────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    "pinecone_api_key": "",
    "pinecone_env": "us-east-1",
    "pinecone_index": "stock-bot",
    "namespace": None,
    "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
    "embed_dim": 384,
    "chunk_size": 800,
    "chunk_overlap": 200
}

def load_config():
    """Load or interactively create config."""
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r") as f:
            cfg = json.load(f)
    else:
        # no config yet; ask user for the minimal secrets
        root = Tk()
        root.withdraw()  # hide main window
        cfg = DEFAULT_CONFIG.copy()
        cfg["pinecone_api_key"] = askstring(
            "Pinecone Setup",
            "Enter your Pinecone API Key:",
            parent=root
        ) or ""
        cfg["pinecone_env"] = askstring(
            "Pinecone Setup",
            "Enter your Pinecone ENV (e.g. us-east-1):",
            initialvalue=cfg["pinecone_env"],
            parent=root
        ) or cfg["pinecone_env"]
        cfg["pinecone_index"] = askstring(
            "Pinecone Setup",
            "Enter your Pinecone index name:",
            initialvalue=cfg["pinecone_index"],
            parent=root
        ) or cfg["pinecone_index"]
        root.destroy()

        # write it out so next time we skip prompts
        with open(CONFIG_PATH, "w") as f:
            json.dump(cfg, f, indent=2)
    return cfg
