# models/base_model.py
from abc import ABC, abstractmethod
from typing import Any, Dict

class BaseModel(ABC):
    def __init__(self, config: Dict[str, Any]):
        self.config = config

    @abstractmethod
    def predict(self, market_data: Dict[str, Any]) -> float:
        """
        Returns a float between 0 and 1 indicating confidence in upward movement.
        """
        pass