from pathlib import Path
import numpy as np
import pandas as pd
import pytest
import sys

sys.path.append(str(Path(__file__).resolve().parents[2]))

from stockbot.env.config import EnvConfig, FeeModel, MarginConfig, EpisodeConfig, FeatureConfig
from stockbot.env.portfolio_env import PortfolioTradingEnv
from stockbot.strategy.regime_sizing import RegimeScalerConfig


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
            borrow_fee_apr=0.0,
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
    gamma_seq = np.tile(np.array([0.2, 0.8], dtype=np.float32), (len(idx), 1))
    regime_cfg = RegimeScalerConfig(state_scalars=[0.5, 1.5])
    env = PortfolioTradingEnv(panel, cfg, regime_gamma=gamma_seq, regime_scaler=regime_cfg)
    env.guards_cfg.per_name_cap = 2.0
    env.sizing_cfg.vol_target.enabled = False
    env.sizing_cfg.kelly.enabled = False
    return env, gamma_seq


def test_regime_gamma_applied():
    env, gamma_seq = make_env()
    obs, _ = env.reset()
    assert np.allclose(obs["gamma"], gamma_seq[1])
    action = np.array([np.arctanh(0.1)], dtype=np.float32)
    env.step(action)
    qty = env.port.positions["XYZ"].qty
    assert qty == pytest.approx(1.3)
