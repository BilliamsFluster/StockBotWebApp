# stockbot/env/train_sanity.py
from datetime import datetime
from stable_baselines3 import PPO

from stockbot.ingestion.yfinance_ingestion import YFinanceProvider
from stockbot.ingestion.ingestion_base import BarInterval  # if your base is named 'ingestion_base', update this import accordingly
from stockbot.env.data_adapter import BarWindowSource
from stockbot.env.trading_env import StockTradingEnv
from stockbot.env.wrappers import as_float32

prov = YFinanceProvider()
# quick single-asset sanity train:
cfg_symbol = "AAPL"
data = BarWindowSource(prov, cfg_symbol, BarInterval.DAY_1, start=datetime(2015,1,1), end=datetime(2022,12,31), adjusted=True)
env = StockTradingEnv(data)
env = as_float32(env)

model = PPO("MultiInputPolicy", env, verbose=1)
model.learn(total_timesteps=10_000)
