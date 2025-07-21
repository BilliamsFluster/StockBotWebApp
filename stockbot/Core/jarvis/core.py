import os
import json
from datetime import datetime
import Core.config.shared_state as shared_state
from Core.ollama.RAG import rag
from Core.jarvis.models import generate_analysis

# Memory storage path
MEMORY_PATH = os.path.join(os.path.dirname(__file__), "memory.json")
# Toggle debug mode
DEBUG_MODE = os.getenv("JARVIS_DEBUG", "false").lower() == "false"

# -- Memory Management --
# Automatic injection of system instruction and memory into prompts.

def load_memory() -> dict:
    """Load the persistent memory store (profile + trades)."""
    if not os.path.exists(MEMORY_PATH):
        return {"profile": {}, "trades": []}
    with open(MEMORY_PATH, "r") as f:
        return json.load(f)


def save_memory(mem: dict):
    """Persist the memory store back to disk."""
    with open(MEMORY_PATH, "w") as f:
        json.dump(mem, f, indent=2)


def format_memory(mem: dict) -> str:
    """Format system instruction plus memory into a prompt preamble."""
    # Always include the core personality instruction
    lines = [shared_state.JARVIS_INSTRUCTION]
    prof = mem.get("profile", {})
    if prof.get("name"):
        lines.append(f"• Name: {prof['name']}")
    if prof.get("style"):
        lines.append(f"• Style: {prof['style']}")
    for fact in prof.get("facts", []):
        lines.append(f"• {fact}")
    trades = mem.get("trades", [])[-5:]
    if trades:
        lines.append("• Recent trades:")
        for t in trades:
            ts = datetime.fromisoformat(t["date"]).strftime("%b %d")
            lines.append(
                f"    – {t['action']} {t['qty']} {t['symbol']} @ {t['price']} on {ts}"
            )
    # Combine into single system block
    return "System:" + "\n" + "\n".join(lines) + "\n\n"


def append_trade(trade_event: dict):
    """
    Add a new trade to persistent memory.
    No-op if DEBUG_MODE to avoid polluting memory during debugging.
    """
    if DEBUG_MODE:
        return
    mem = load_memory()
    mem.setdefault("trades", []).append(trade_event)
    save_memory(mem)


def set_profile_field(key: str, value):
    """
    Set or update a profile field (e.g. name, style).
    """
    if DEBUG_MODE:
        return
    mem = load_memory()
    profile = mem.setdefault("profile", {})
    profile[key] = value
    save_memory(mem)


def add_profile_fact(fact: str):
    """
    Append a new fact string to the profile's facts list.
    """
    if DEBUG_MODE:
        return
    mem = load_memory()
    profile = mem.setdefault("profile", {})
    facts = profile.setdefault("facts", [])
    facts.append(fact)
    save_memory(mem)

# -- Core API Calls --

def call_jarvis(user_prompt: str,
                model: str = "deepseek-r1:14b") -> str:
    """
    Non-streaming entry point. Automatically injects system instruction,
    memory, and returns the full response in plain text (markdown stripped).
    """
    # Force plain text output to strip headings and markdown
    if DEBUG_MODE:
        full_prompt = user_prompt
    else:
        full_prompt = format_memory(load_memory()) + user_prompt
    return generate_analysis(
        prompt=full_prompt,
        model=model,
        output_format="text",
        stream=False
    )



def call_jarvis_stream(user_prompt: str,
                       model: str = "vanilj/palmyra-fin-70b-32k",
                       output_format: str = "text"):
    """
    Injects full persona prompt, memory, and context into LLM stream call.
    Designed to make the assistant feel more human and voice-aware.
    """

    # (1) Load Jarvis persona
    persona = shared_state.JARVIS_INSTRUCTION.strip()

    # (2) Add persistent memory (profile, trades, etc.)
    memory = format_memory(load_memory())

    # (3) RAG context (headlines, etc.)
    context = rag.call_rag(user_prompt)

    # (4) Tone reinforcement for speech
    tone_injection = (
        "Respond like you're speaking aloud: real, human, confident.\n"
        "No lists. No markdown. No robotic structure.\n"
        "Sound like you're in the room with the user—make it conversational and natural.\n"
    )

    # (5) Final prompt construction
    final_prompt = (
        f"{persona}\n\n"
        f"{memory}"
        f"Context:\n{context}\n\n"
        f"User: {user_prompt}\n\n"
        f"{tone_injection}"
    )

    # (6) Send to Ollama model and stream output
    return generate_analysis(
        prompt=final_prompt,
        model=model,
        output_format="text",  # Always enforce text here for TTS friendliness
        stream=True
    )


