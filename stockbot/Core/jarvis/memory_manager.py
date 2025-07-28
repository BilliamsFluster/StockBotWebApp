# File: memory_manager.py

from typing import List, Tuple, Dict
from enum import Enum

class Role(str, Enum):
    USER = "USER"
    JARVIS = "JARVIS"

class MemoryManager:
    def __init__(self):
        self.memory_store: Dict[str, List[Tuple[str, str]]] = {}
        self.max_turns = 5  # Limit number of user-bot turns to retain

    def format_memory(self, user_id: str, as_json: bool = False) -> str:
        history = self.memory_store.get(user_id, [])[-self.max_turns * 2:]  # *2 to account for both user + bot

        if as_json:
            return [{"role": role.lower(), "content": msg} for role, msg in history]

        return "\n".join(
            f"User: {msg}" if role == Role.USER else f"Jarvis: {msg}" for role, msg in history
        )

    def add_turn(self, user_id: str, user_msg: str, jarvis_reply: str):
        self.memory_store.setdefault(user_id, []).append((Role.USER, user_msg))
        self.memory_store[user_id].append((Role.JARVIS, jarvis_reply))

        # Prune memory after adding if it exceeds max_turns
        if len(self.memory_store[user_id]) > self.max_turns * 2:
            self.memory_store[user_id] = self.memory_store[user_id][-self.max_turns * 2:]

    def reset_memory(self, user_id: str):
        self.memory_store[user_id] = []

    def get_raw_memory(self, user_id: str) -> List[Tuple[str, str]]:
        return self.memory_store.get(user_id, [])
