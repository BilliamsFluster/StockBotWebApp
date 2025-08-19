# stockbot/env/tests/test_env_step.py
import numpy as np
from datetime import datetime
from stockbot.ingestion.yfinance_ingestion import YFinanceProvider
from stockbot.ingestion.ingestion_base import BarInterval
from stockbot.env.data_adapter import BarWindowSource
from stockbot.env.trading_env import StockTradingEnv

def test_reset_step_smoke():
    data = BarWindowSource(YFinanceProvider(), "AAPL", BarInterval.DAY_1,
                           datetime(2020,1,1), datetime(2020,12,31))
    env = StockTradingEnv(data)
    obs, info = env.reset(seed=123)
    assert "window" in obs and "portfolio" in obs
    for _ in range(5):
        a = env.action_space.sample()
        obs, r, term, trunc, info = env.step(a)
    assert obs["window"].shape[0] == env.lookback
