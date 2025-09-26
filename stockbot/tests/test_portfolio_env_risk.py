from pathlib import Path
import sys

import numpy as np
import pandas as pd
import pytest

sys.path.append(str(Path(__file__).resolve().parents[2]))

from stockbot.env.config import (  # noqa: E402
    EnvConfig,
    EpisodeConfig,
    ExecConfig,
    FeatureConfig,
    FeeModel,
    MarginConfig,
)
from stockbot.env.portfolio_env import PortfolioTradingEnv  # noqa: E402


class DummyPanel:
    def __init__(self, df):
        self.symbols = ["XYZ"]
        self.panel = {"XYZ": df}
        self.index = df.index
        self._cols = list(df.columns)

    def cols_required(self):
        return self._cols


def make_env():
    idx = pd.to_datetime(
        [
            "2020-01-01 09:30:00",
            "2020-01-01 10:30:00",
            "2020-01-01 11:30:00",
        ]
    )
    data = {
        "open": [100.0, 100.0, 80.0],
        "high": [100.0, 100.0, 80.0],
        "low": [100.0, 80.0, 80.0],
        "close": [100.0, 80.0, 80.0],
        "volume": [1_000_000.0, 1_000_000.0, 1_000_000.0],
    }
    df = pd.DataFrame(data, index=idx)
    panel = DummyPanel(df)
    cfg = EnvConfig(
        symbols=("XYZ",),
        fees=FeeModel(
            commission_per_share=0.0,
            commission_pct_notional=0.0,
            slippage_bps=0.0,
        ),
        exec=ExecConfig(participation_cap=1.0),
        margin=MarginConfig(
            cash_borrow_apr=0.0,
            max_position_weight=1.0,
            max_gross_leverage=1.0,
            daily_loss_limit=0.10,
        ),
        episode=EpisodeConfig(
            start_cash=1000.0,
            lookback=1,
            max_steps=3,
            mapping_mode="tanh_leverage",
        ),
        features=FeatureConfig(use_custom_pipeline=False, indicators=()),
    )
    env = PortfolioTradingEnv(panel, cfg)
    env.reset()
    return env


def test_daily_loss_limit_halts_and_flattens():
    env = make_env()
    action_long = np.array([5.0], dtype=np.float32)

    # First step: take the long position and realize a 20% drawdown intraday.
    env.step(action_long)
    assert env.risk_state.nav_day_open == pytest.approx(env.cfg.episode.start_cash)

    # Second step occurs within the same session; guard should halt trading.
    _, _, _, _, info = env.step(action_long)

    assert "daily_dd_halt" in info["risk_events"]
    assert np.allclose(info["weights_capped"], 0.0)
