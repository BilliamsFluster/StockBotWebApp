# stockbot/env/wrappers.py
import numpy as np, gymnasium as gym
from gymnasium.wrappers import TransformObservation

def as_float32(env: gym.Env):
    def _cast(obs):
        return {k: np.asarray(v, dtype=np.float32) for k, v in obs.items()}
    return TransformObservation(env, _cast)
