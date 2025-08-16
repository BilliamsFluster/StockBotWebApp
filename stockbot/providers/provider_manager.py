# provider_manager.py
from .schwab_provider import SchwabProvider
from .alpaca_provider import AlpacaProvider

class ProviderManager:
    _instances = {}
    _provider_classes = {
        "schwab": SchwabProvider,
        "alpaca": AlpacaProvider,
    }

    @classmethod
    def get_provider(cls, broker: str, credentials: dict):
        if broker not in cls._instances:
            if broker not in cls._provider_classes:
                raise ValueError(f"Unsupported broker: {broker}")
            provider_class = cls._provider_classes[broker]
            cls._instances[broker] = provider_class(**credentials)
        return cls._instances[broker]

