# jarvis_controller.py
from providers.provider_manager import ProviderManager

async def get_portfolio_data(broker: str, credentials: dict):
    provider = ProviderManager.get_provider(broker, credentials)
    return { "portfolio": provider.get_portfolio_data() }
