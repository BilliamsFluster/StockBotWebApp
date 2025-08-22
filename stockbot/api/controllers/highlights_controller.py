from pydantic import BaseModel
from providers.provider_manager import ProviderManager
from utils.web_search import fetch_financial_snippets

class HighlightsRequest(BaseModel):
    broker: str
    credentials: dict


def generate_highlights(req: HighlightsRequest) -> dict:
    provider = ProviderManager.get_provider(req.broker, req.credentials)
    provider_name = provider.__class__.__name__.replace("Provider", "")
    highlights = fetch_financial_snippets()
    bot_name = "default"
    return {"provider": provider_name, "bot": bot_name, "highlights": highlights}
