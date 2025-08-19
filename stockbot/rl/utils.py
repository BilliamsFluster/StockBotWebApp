from __future__ import annotations
from dataclasses import dataclass
from typing import Tuple, Optional
import numpy as np
from stable_baselines3.common.monitor import Monitor

from stockbot.env.config import EnvConfig
from stockbot.env.data_adapter import BarWindowSource, PanelSource
from stockbot.env.trading_env import StockTradingEnv
from stockbot.env.portfolio_env import PortfolioTradingEnv
from stockbot.env.wrappers import as_float32
from stockbot.env.obs_norm import ObsNorm
from stockbot.ingestion.yfinance_ingestion import YFinanceProvider

@dataclass
class Split:
    train: Tuple[str, str]
    eval: Tuple[str, str]

def make_env(cfg: EnvConfig, split: Split, mode: str = "train",
             normalize: bool = False, norm_state: Optional[dict] = None):
    """
    Build a monitored Gym env from EnvConfig + date split.
    If normalize=True, wraps with ObsNorm (train updates stats, eval freezes).
    """
    from dataclasses import replace
    run_cfg = replace(cfg,
                      start=(split.train[0] if mode == "train" else split.eval[0]),
                      end=(split.train[1] if mode == "train" else split.eval[1]))

    prov = YFinanceProvider()
    syms = list(run_cfg.symbols) if isinstance(run_cfg.symbols, (list, tuple)) else [run_cfg.symbols]
    if len(syms) > 1:
        panel = PanelSource(prov, run_cfg)
        env = PortfolioTradingEnv(panel, run_cfg)
    else:
        data = BarWindowSource(prov, run_cfg)
        env = StockTradingEnv(data, episode=run_cfg.episode, fees=run_cfg.fees, features=run_cfg.features)

    env = as_float32(env)
    if normalize:
        env = ObsNorm(env, train=(mode == "train"))
        if (mode != "train") and (norm_state is not None):
            env.set_state(norm_state)
    env = Monitor(env)
    return env

def episode_rollout(env, policy, deterministic: bool = True, seed: int = 0):
    obs, info = env.reset(seed=seed)
    done = trunc = False
    equities = []
    while not (done or trunc):
        action, _ = policy.predict(obs, deterministic=deterministic)
        obs, r, done, trunc, info = env.step(action)
        equities.append(float(info["equity"]))
    return np.array(equities, dtype=np.float64)
