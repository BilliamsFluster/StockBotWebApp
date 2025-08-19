from __future__ import annotations
import numpy as np
import gymnasium as gym
from gymnasium import spaces
from dataclasses import dataclass

@dataclass
class RunningStat:
    mean: np.ndarray
    var: np.ndarray
    count: float

def _init_stat(shape):
    return RunningStat(mean=np.zeros(shape, np.float64),
                       var=np.ones(shape, np.float64),
                       count=1e-6)

def _update_stat(stat: RunningStat, x: np.ndarray):
    x = x.astype(np.float64)
    batch_mean = x.mean(axis=0)
    batch_var  = x.var(axis=0)
    batch_count = x.shape[0] if x.ndim > 0 else 1.0

    delta = batch_mean - stat.mean
    tot = stat.count + batch_count
    new_mean = stat.mean + delta * (batch_count / tot)

    m_a = stat.var * stat.count
    m_b = batch_var * batch_count
    M2 = m_a + m_b + delta**2 * (stat.count * batch_count / tot)
    new_var = M2 / tot

    stat.mean, stat.var, stat.count = new_mean, np.maximum(new_var, 1e-12), tot

class ObsNorm(gym.ObservationWrapper):
    """
    Normalizes Dict observations:
      - 'window': (L, N, F) -> per-feature stats (F), broadcast across (L, N)
      - 'portfolio': (P,)   -> per-dimension stats
    Train mode updates stats; Eval mode only applies transform.
    """
    def __init__(self, env: gym.Env, train: bool, epsilon: float = 1e-8):
        super().__init__(env)
        self.train = bool(train)
        self.eps = float(epsilon)

        assert isinstance(env.observation_space, spaces.Dict)
        win_space = env.observation_space["window"]
        port_space = env.observation_space["portfolio"]
        assert len(win_space.shape) == 3  # (L, N, F)

        L, N, F = win_space.shape
        P = port_space.shape[0]

        self._win_stat = _init_stat((F,))
        self._port_stat = _init_stat((P,))

        # observation_space unchanged (same shapes/ranges)
        self.observation_space = env.observation_space

    def observation(self, obs):
        win = np.asarray(obs["window"], dtype=np.float32)     # (L,N,F)
        port = np.asarray(obs["portfolio"], dtype=np.float32) # (P,)

        if self.train:
            _update_stat(self._win_stat, win.reshape(-1, win.shape[-1]))
            _update_stat(self._port_stat, port.reshape(1, -1))

        m_w, s_w = self._win_stat.mean, np.sqrt(self._win_stat.var + self.eps)
        m_p, s_p = self._port_stat.mean, np.sqrt(self._port_stat.var + self.eps)

        win_n = (win - m_w) / s_w
        port_n = (port - m_p) / s_p
        return {"window": win_n.astype(np.float32), "portfolio": port_n.astype(np.float32)}

    # Optional: serialize/restore stats
    def get_state(self):
        return {
            "win": {"mean": self._win_stat.mean, "var": self._win_stat.var, "count": self._win_stat.count},
            "port": {"mean": self._port_stat.mean, "var": self._port_stat.var, "count": self._port_stat.count},
        }

    def set_state(self, state):
        self._win_stat = RunningStat(np.array(state["win"]["mean"]),
                                     np.array(state["win"]["var"]),
                                     float(state["win"]["count"]))
        self._port_stat = RunningStat(np.array(state["port"]["mean"]),
                                      np.array(state["port"]["var"]),
                                      float(state["port"]["count"]))
