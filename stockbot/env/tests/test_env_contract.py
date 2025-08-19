from datetime import datetime
from stockbot.env.config import EnvConfig
from stockbot.env.data_adapter import BarWindowSource
from stockbot.env.trading_env import StockTradingEnv
from stockbot.ingestion.yfinance_ingestion import YFinanceProvider

def test_contract_smoke():
    cfg = EnvConfig(symbol="AAPL", interval="1d", start="2020-01-01", end="2020-06-30")
    data = BarWindowSource(YFinanceProvider(), cfg)
    env = StockTradingEnv(data, episode=cfg.episode, fees=cfg.fees, features=cfg.features)
    obs, info = env.reset(seed=123)
    assert "window" in obs and "portfolio" in obs
    assert obs["window"].shape[0] == cfg.episode.lookback

    done = trunc = False
    steps = 0
    while not (done or trunc):
        obs, r, done, trunc, info = env.step(env.action_space.sample())
        steps += 1
        assert abs((env._cash + env._shares * info["price"]) - info["equity"]) < 1e-6
    assert steps > 1
