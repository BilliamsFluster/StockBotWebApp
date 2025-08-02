from pydantic import BaseModel

class PortfolioRequest(BaseModel):
    broker: str
    credentials: dict