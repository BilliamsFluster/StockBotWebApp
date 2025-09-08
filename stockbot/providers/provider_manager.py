# provider_manager.py
from .schwab_provider import SchwabProvider
from .alpaca_provider import AlpacaProvider

class ProviderManager:
    _provider_classes = {
        "schwab": SchwabProvider,
        "alpaca": AlpacaProvider,
    }

    @classmethod
    def get_provider(cls, broker: str, credentials: dict):
        """
        Return a fresh provider instance for the requested broker.

        Rationale: credentials may differ per request/user; caching a singleton by
        broker name can leak credentials and cause confusing 401s if a prior
        instance was created with invalid keys. Provider objects are lightweight
        (a configured requests.Session), so per-request construction is acceptable.
        """
        if broker not in cls._provider_classes:
            raise ValueError(f"Unsupported broker: {broker}")
        provider_class = cls._provider_classes[broker]
        return provider_class(**credentials)

