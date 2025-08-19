# train_sanity.py (dev script)
from stable_baselines3 import PPO
from stockbot.ingestion.yfinance_provider import YFinanceProvider
from stockbot.ingestion.base import BarInterval
from stockbot.env.data_adapter import BarWindowSource
from stockbot.env.trading_env import StockTradingEnv
from stockbot.env.wrappers import as_float32
from datetime import datetime

prov = YFinanceProvider()
data = BarWindowSource(prov, "AAPL", BarInterval.DAY_1,
                       start=datetime(2015,1,1), end=datetime(2022,12,31))
env = StockTradingEnv(data)
env = as_float32(env)

model = PPO("MultiInputPolicy", env, verbose=1)  # MultiInputPolicy handles Dict obs. :contentReference[oaicite:8]{index=8}
model.learn(total_timesteps=10_000)
