import numpy as np
import gymnasium as gym
from gymnasium.wrappers import TransformObservation

def as_float32(env: gym.Env):
    """
    Cast Dict observations to float32 for SB3.
    Works with newer Gymnasium that requires observation_space in TransformObservation.
    """
    def _cast(obs):
        # Dict obs: cast each key to float32 numpy array
        if isinstance(obs, dict):
            return {k: np.asarray(v, dtype=np.float32) for k, v in obs.items()}
        # Fallback for non-dict obs
        return np.asarray(obs, dtype=np.float32)

    # Explicitly pass observation_space (required by current Gymnasium)
    return TransformObservation(env, func=_cast, observation_space=env.observation_space)
