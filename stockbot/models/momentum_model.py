# models/ml_momentum.py
from typing import Any, Dict
from models.base_model import BaseModel
import random

class MomentumModel(BaseModel):
    def predict(self, market_data: Dict[str, Any]) -> float:
        """
        Dummy model that returns a random confidence level based on mock data.
        Replace with real ML inference later.
        """
        price_history = market_data.get("price_history", [])

        if len(price_history) < 3:
            return 0.5  # Uncertain

        if price_history[-1] > price_history[-2] > price_history[-3]:
            return random.uniform(0.7, 1.0)
        elif price_history[-1] < price_history[-2] < price_history[-3]:
            return random.uniform(0.0, 0.3)
        else:
            return random.uniform(0.4, 0.6)
