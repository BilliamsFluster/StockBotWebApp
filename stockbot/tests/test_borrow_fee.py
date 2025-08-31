import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

sys.path.append(str(Path(__file__).resolve().parents[2]))

from stockbot.env.config import EnvConfig, FeeModel, MarginConfig, EpisodeConfig, FeatureConfig
from stockbot.env.portfolio_env import PortfolioTradingEnv
from stockbot.env.portfolio import Position


class DummyPanel:
    def __init__(self, df):
        self.symbols = ["XYZ"]
        self.panel = {"XYZ": df}
        self.index = df.index
        self._cols = list(df.columns)

    def cols_required(self):
        return self._cols


def make_env():
    idx = pd.date_range("2020-01-01", periods=3, freq="D")
    data = {
        "open": [100.0, 100.0, 100.0],
        "high": [100.0, 100.0, 100.0],
        "low": [100.0, 100.0, 100.0],
        "close": [100.0, 100.0, 100.0],
        "volume": [1000.0, 1000.0, 1000.0],
    }
    df = pd.DataFrame(data, index=idx)
    panel = DummyPanel(df)
    cfg = EnvConfig(
        symbols=("XYZ",),
        fees=FeeModel(
            commission_per_share=0.0,
            commission_pct_notional=0.0,
            borrow_fee_apr=0.25,
            slippage_bps=0.0,
        ),
        margin=MarginConfig(cash_borrow_apr=0.0),
        episode=EpisodeConfig(
            start_cash=1000.0,
            lookback=1,
            max_steps=1,
            mapping_mode="tanh_leverage",
        ),
        features=FeatureConfig(use_custom_pipeline=False, indicators=()),
    )
    env = PortfolioTradingEnv(panel, cfg)
    env.reset()
    env.port.positions["XYZ"] = Position(qty=-1.0, avg_cost=100.0)
    env.port.cash += 100.0  # proceeds from the short sale
    return env


def test_short_borrow_fee_affects_equity_and_reward():
    env = make_env()
    dt_years = 1.0 / 252.0
    action = np.array([np.arctanh(-0.1)], dtype=np.float32)
    _, reward, _, _, info = env.step(action)

    short_val = 100.0
    expected_cost = short_val * 0.25 * dt_years
    assert env.port.short_market_value == pytest.approx(short_val)
    assert env.port.cash == pytest.approx(1100.0 - expected_cost)
    assert info["equity"] == pytest.approx(1000.0 - expected_cost)
    assert reward == pytest.approx(-expected_cost / 1000.0)
