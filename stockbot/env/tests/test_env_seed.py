from stockbot.env.config import EnvConfig
from stockbot.env.data_adapter import BarWindowSource
from stockbot.env.trading_env import StockTradingEnv
from stockbot.ingestion.yfinance_provider import YFinanceProvider
import numpy as np

def test_reset_seed_repro():
    cfg = EnvConfig(symbol="AAPL", interval="1d", start="2020-01-01", end="2020-06-30")
    data = BarWindowSource(YFinanceProvider(), cfg)
    env = StockTradingEnv(data, episode=cfg.episode, fees=cfg.fees, features=cfg.features)
    o1,_ = env.reset(seed=999)
    o2,_ = env.reset(seed=999)
    np.testing.assert_allclose(o1["window"], o2["window"])
