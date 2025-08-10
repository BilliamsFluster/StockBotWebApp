from abc import ABC, abstractmethod
from typing import Dict, List, Any
from jarvis.memory_manager import MemoryManager

class BaseAgent(ABC):
    FLAG_MAP: Dict[str, Dict[str, List[str]]] = {
        "needs_summary":      {"keywords": ["portfolio", "summary", "account value", "total balance"], "method": "get_account_summary"},
        "needs_positions":    {"keywords": ["holdings", "positions", "assets", "what do i own"],       "method": "get_positions"},
        "needs_orders":       {"keywords": ["orders", "pending orders", "placed orders"],               "method": "get_orders"},
        "needs_transactions": {"keywords": ["transactions", "history", "activity", "recent activity"], "method": "get_transactions"},
    }

    def __init__(self, model: str, memory_manager: MemoryManager):
        self.model = model
        self.memory_manager = memory_manager

    def detect_flags(self, prompt: str) -> Dict[str, bool]:
        lower = prompt.lower()
        return {flag: any(kw in lower for kw in spec["keywords"]) for flag, spec in self.FLAG_MAP.items()}

    def _resolve_flag_context(self, flags: Dict[str, bool]) -> Dict[str, Any]:
        ctx = {}
        for flag, is_on in flags.items():
            if not is_on:
                continue
            method_name = self.FLAG_MAP[flag]["method"]
            method = getattr(self, method_name, None)
            if callable(method):
                try:
                    ctx[flag] = method()
                except Exception as e:
                    ctx[flag] = {"error": str(e)}
        return ctx

    @abstractmethod
    def generate(self, prompt: str, output_format: str = "text") -> str:
        """
        Generates a response from the language model as an asynchronous stream.

        Args:
            user_input (str): The text input from the user to be processed by the model.
            output_format (str): The desired format for the output stream (e.g., "text").

        Yields:
            str: Chunks of the generated text as they become available.
        """
        # This is an abstract method, so it must be implemented by subclasses.
        # The 'yield' keyword here is a placeholder to indicate it's a generator.
        raise NotImplementedError
