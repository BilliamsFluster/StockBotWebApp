# jarvis_controller.py
from providers.provider_manager import ProviderManager
from fastapi import HTTPException

import requests

async def get_portfolio_data(broker: str, credentials: dict):
    try:
        provider = ProviderManager.get_provider(broker, credentials)
        return { "portfolio": provider.get_portfolio_data() }
    except requests.exceptions.HTTPError as he:  # surface upstream status code
        status = getattr(he.response, "status_code", 500)
        if status == 401:
            raise HTTPException(status_code=401, detail="Unauthorized: check API key/secret and mode (paper vs live).")
        raise HTTPException(status_code=status, detail=f"Broker API error ({status}).")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Broker provider error: {e}")
