from abc import ABC, abstractmethod

class BaseAgent(ABC):
    def __init__(self, model: str):
        self.model = model

    @abstractmethod
    def generate(self, prompt: str, output_format: str = "text") -> str:
        pass
