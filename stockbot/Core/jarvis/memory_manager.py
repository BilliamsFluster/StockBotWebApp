# File: memory_manager.py

from typing import List, Tuple, Dict

class MemoryManager:
    def __init__(self):
        self.memory_store: Dict[str, List[Tuple[str, str]]] = {}
        self.max_turns = 5  # Limit to avoid token overflow

    def format_memory(self, user_id: str) -> str:
        history = self.memory_store.get(user_id, [])[-self.max_turns:]
        return "\n".join(
            f"User: {msg}" if role == "USER" else f"Jarvis: {msg}" for role, msg in history
        )

    def add_turn(self, user_id: str, user_msg: str, jarvis_reply: str):
        self.memory_store.setdefault(user_id, []).append(("USER", user_msg))
        self.memory_store[user_id].append(("JARVIS", jarvis_reply))

    def reset_memory(self, user_id: str):
        self.memory_store[user_id] = []
