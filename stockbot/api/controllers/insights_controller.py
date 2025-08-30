from pydantic import BaseModel
from providers.provider_manager import ProviderManager

class InsightsRequest(BaseModel):
    broker: str
    credentials: dict


def generate_insights(req: InsightsRequest) -> dict:
    provider = ProviderManager.get_provider(req.broker, req.credentials)
    summary = provider.get_account_summary()
    equity = summary.get("equity", 0)
    bot_name = "default"
    insight_text = f"Account equity is ${equity:,.2f} while bot '{bot_name}' monitors the market."
    return {"insights": [insight_text], "accountValue": equity, "bot": bot_name}
