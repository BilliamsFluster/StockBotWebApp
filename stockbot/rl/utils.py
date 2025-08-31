from __future__ import annotations
from dataclasses import dataclass, replace
from typing import Tuple, Optional, Dict, Callable, Any
import numpy as np
import gymnasium as gym
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

def make_env(
    cfg: EnvConfig,
    split: Split,
    mode: str = "train",
    normalize: bool = False,
    norm_state: Optional[dict] = None,
):
    """Build a monitored Gym env from EnvConfig + date split."""
    run_cfg = replace(
        cfg,
        start=(split.train[0] if mode == "train" else split.eval[0]),
        end=(split.train[1] if mode == "train" else split.eval[1]),
    )

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

# ---------------- Strategy plumbing (lazy imports so training doesn’t depend on it) ----------------

StrategyFactory = Callable[[gym.Env, dict], Any]
_REGISTRY: Dict[str, StrategyFactory] = {}

def register_strategy(name: str, factory: StrategyFactory) -> None:
    key = name.strip().lower()
    if key in _REGISTRY:
        raise ValueError(f"Strategy '{name}' already registered")
    _REGISTRY[key] = factory

def make_strategy(name: str, env: gym.Env, **kwargs):
    key = name.strip().lower()
    if key in _REGISTRY:
        return _REGISTRY[key](env, kwargs)

    # Lazy imports
    try:
        from stockbot.strategy.baselines import (
            EqualWeightStrategy, BuyAndHoldStrategy, FlatStrategy, FirstLongStrategy, RandomStrategy
        )
        from stockbot.strategy.sb3_adapter import SB3PolicyStrategy, load_sb3_model
    except Exception as e:
        raise ImportError(
            "Strategy modules not available. Ensure 'stockbot/strategy' package exists with __init__.py, "
            "and files base.py, baselines.py, sb3_adapter.py."
        ) from e

    if key in ("equal", "equal_weight", "ew"):
        return EqualWeightStrategy(env.action_space)
    if key in ("buy_hold", "buyandhold", "bah"):
        return BuyAndHoldStrategy(env.action_space, first_asset_only=False)
    if key in ("first_long", "fl"):
        return FirstLongStrategy(env.action_space)
    if key in ("flat", "cash"):
        return FlatStrategy(env.action_space)
    if key in ("random", "rand"):
        return RandomStrategy(env.action_space)
    if key in ("sb3", "ppo", "a2c", "ddpg"):
        model_path = kwargs.get("model_path")
        if not model_path:
            raise ValueError("SB3 strategy requires model_path='.../model.zip'")
        model = load_sb3_model(model_path, env=env)
        return SB3PolicyStrategy(model)

    raise KeyError(f"Unknown strategy '{name}'.")

def episode_rollout(env: gym.Env, agent: Any, deterministic: bool = True, seed: int = 0):
    """
    Run one episode and return (equity curve, turnover per step).
    'agent' may be a Strategy or an SB3 model with .predict().
    """
    if not hasattr(agent, "predict"):
        raise TypeError("agent must have a .predict(obs, deterministic=...) method")

    obs, info = env.reset(seed=seed)
    if hasattr(agent, "reset"):
        agent.reset()

    done = False
    trunc = False
    equities = []
    turnovers = []
    while not (done or trunc):
        action, *_ = (agent.predict(obs, deterministic=deterministic),)
        if isinstance(action, tuple):
            action = action[0]
        obs, r, done, trunc, info = env.step(action)
        equities.append(float(info.get("equity", np.nan)))
        turnovers.append(float(info.get("turnover", 0.0)))
    return np.array(equities, dtype=np.float64), np.array(turnovers, dtype=np.float64)
