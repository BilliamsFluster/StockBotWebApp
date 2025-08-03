# stockbot/api/agent/base_agent.py

from abc import ABC, abstractmethod
import re
from typing import Dict, List

class BaseAgent(ABC):
    """
    Abstract LLM agent base class. 
    Provides common flag-detection before calling generate().
    """

    # each subclass can override or extend this map
    FLAG_MAP: Dict[str, Dict[str, List[str]]] = {
        # flag_name: { "keywords": [...], "method": provider_method_name }
        "needs_summary":      { "keywords": ["portfolio", "summary", "account value", "total balance"], "method": "get_account_summary" },
        "needs_positions":    { "keywords": ["holdings", "positions", "assets", "what do i own"],   "method": "get_positions"     },
        "needs_orders":       { "keywords": ["orders", "pending orders", "placed orders"],           "method": "get_orders"        },
        "needs_transactions": { "keywords": ["transactions", "history", "activity", "recent activity"], "method": "get_transactions" },
        # you can add “needs_market_data” or any other flags here
    }

    def __init__(self, model: str):
        self.model = model

    def detect_flags(self, prompt: str) -> Dict[str, bool]:
        """
        Scan the prompt for each keyword set and return a dict of booleans.
        """
        lower = prompt.lower()
        return {
            flag: any(kw in lower for kw in spec["keywords"])
            for flag, spec in self.FLAG_MAP.items()
        }

    @abstractmethod
    def generate(self, prompt: str, output_format: str = "text") -> str:
        """
        Subclasses implement the actual LLM call here.
        """
        pass
