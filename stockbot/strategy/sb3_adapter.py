from __future__ import annotations
from typing import Any, Tuple
import os

from stable_baselines3.common.base_class import BaseAlgorithm

from .base_strategy import Strategy

class SB3PolicyStrategy(Strategy):
    """Adapter to use any SB3 model as a Strategy."""
    def __init__(self, model: BaseAlgorithm, deterministic_default: bool = True):
        self.model = model
        self.det_default = deterministic_default

    def reset(self) -> None:
        return

    def predict(self, obs: Any, deterministic: bool = True) -> Tuple[Any, dict]:
        det = deterministic if deterministic is not None else self.det_default
        action, _ = self.model.predict(obs, deterministic=det)
        return action, {}

    def close(self) -> None:
        try:
            self.model.env = None
        except Exception:
            pass


def _infer_algo_from_zip(model_path: str) -> str:
    """
    Try to infer the SB3 algo from the zip metadata.
    Falls back to 'ppo' if ambiguous.
    """
    try:
        from stable_baselines3.common.save_util import load_from_zip_file
        data, _params, _vars = load_from_zip_file(model_path)

        algo = data.get("algo", None)
        if isinstance(algo, str):
            return algo.lower()

        pc = data.get("policy_class", None)
        # policy_class may be a string or a class; try to glean algo from its name/module
        cand = ""
        if isinstance(pc, str):
            cand = pc.lower()
        elif pc is not None:
            mod = getattr(pc, "__module__", "")
            name = getattr(pc, "__name__", "")
            cand = f"{mod}.{name}".lower()

        for k in ("ppo", "a2c", "sac", "td3", "ddpg", "dqn", "trpo"):
            if k in cand:
                return k
    except Exception:
        pass
    return "ppo"


def load_sb3_model(model_path: str, env=None) -> BaseAlgorithm:
    """Load a saved SB3 model (e.g., PPO zip) and attach env."""
    if not os.path.exists(model_path):
        raise FileNotFoundError(model_path)

    algo = _infer_algo_from_zip(model_path)

    if algo == "ppo":
        from stable_baselines3 import PPO
        return PPO.load(model_path, env=env)
    if algo == "a2c":
        from stable_baselines3 import A2C
        return A2C.load(model_path, env=env)
    if algo == "sac":
        from stable_baselines3 import SAC
        return SAC.load(model_path, env=env)
    if algo == "td3":
        from stable_baselines3 import TD3
        return TD3.load(model_path, env=env)
    if algo == "ddpg":
        from stable_baselines3 import DDPG
        return DDPG.load(model_path, env=env)
    if algo == "dqn":
        from stable_baselines3 import DQN
        return DQN.load(model_path, env=env)

    # Safe fallback
    from stable_baselines3 import PPO
    return PPO.load(model_path, env=env)
