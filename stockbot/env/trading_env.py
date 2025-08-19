from __future__ import annotations
import numpy as np
import gymnasium as gym
from gymnasium import spaces
from dataclasses import asdict
from .config import EpisodeConfig, FeeModel, FeatureConfig, EnvConfig
from .data_adapter import BarWindowSource

class StockTradingEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, data: BarWindowSource,
                 episode: EpisodeConfig = EpisodeConfig(),
                 fees: FeeModel = FeeModel(),
                 features: FeatureConfig = FeatureConfig()):
        super().__init__()
        self.src = data
        self.episode = episode
        self.fees = fees
        self.features = features

        self.lookback = episode.lookback

        # window tensor: choose deterministic column order
        # required cols: open, high, low, close, volume, logret (others can be appended later)
        cols = ["open","high","low","close","volume","logret"]
        missing = [c for c in cols if c not in self.src.df.columns]
        if missing:
            raise RuntimeError(f"Missing required feature columns: {missing}")
        self._cols = cols

        F = len(self._cols)
        self.observation_space = spaces.Dict({
            "window": spaces.Box(low=-np.inf, high=np.inf, shape=(self.lookback, F), dtype=np.float32),
            "portfolio": spaces.Box(low=np.array([-1,0,0,-1,0], np.float32),
                                    high=np.array([+1,1,10,+1,1], np.float32),
                                    dtype=np.float32),
        })

        if episode.action_space == "discrete":
            self.action_space = spaces.Discrete(3)  # 0=short,1=flat,2=long
        else:
            self.action_space = spaces.Box(low=-1.0, high=1.0, shape=(1,), dtype=np.float32)

        self._i0 = 0
        self._i = 0
        self._cash0 = self._cash = float(episode.start_cash)
        self._pos = 0.0
        self._shares = 0.0
        self._equity_peak = self._cash
        self._last_price = None
        self._max_steps = episode.max_steps

    # ---------- helpers ----------
    def _price(self, idx) -> float:
        return float(self.src.df["close"].iloc[idx])

    def _window_obs(self, idx) -> np.ndarray:
        sl = self.src.slice(idx - self.lookback, idx)
        arr = sl[self._cols].values.astype(np.float32)
        return arr

    def _portfolio_vec(self) -> np.ndarray:
        equity = self._cash + self._shares * self._last_price
        self._equity_peak = max(self._equity_peak, equity)
        dd = 0.0 if self._equity_peak <= 0 else 1.0 - equity / self._equity_peak
        unreal = (self._shares * self._last_price - 0.0) / max(self._cash0, 1e-9)
        return np.array([
            float(np.clip(self._pos, -1, 1)),
            float(np.clip(self._cash / max(self._cash0,1e-9), 0, 1)),
            float(np.clip(equity / max(self._cash0,1e-9), 0, 10)),
            float(np.clip(unreal, -1, 1)),
            float(np.clip(dd, 0, 1))
        ], dtype=np.float32)

    def _obs(self, idx):
        return {"window": self._window_obs(idx), "portfolio": self._portfolio_vec()}

    # ---------- Gym API ----------
    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self._i0 = self.lookback
        self._i = self._i0
        self._cash = self._cash0
        self._equity_peak = self._cash
        self._pos = 0.0
        self._shares = 0.0
        self._last_price = self._price(self._i-1)
        return self._obs(self._i), {"i": self._i, "config": asdict(self.episode)}

    def step(self, action):
        if isinstance(self.action_space, spaces.Discrete):
            target = {-1: -1.0, 0: 0.0, 1: 1.0}[int(action)-1]
        else:
            target = float(np.clip(action, -1, 1))

        price = self._price(self._i)
        equity = self._cash + self._shares * price
        target_shares = (target * equity) / max(price, 1e-9)

        delta = target_shares - self._shares
        if abs(delta) > 1e-6:
            slip = price * (self.fees.slippage_bps * 1e-4) * np.sign(delta)
            fill_price = price + slip
            notional = fill_price * abs(delta)
            commission = (self.fees.commission_per_share * abs(delta) +
                          self.fees.commission_pct_notional * notional)
            # buy: decrease cash; sell: increase cash; always subtract commission
            self._cash -= np.sign(delta) * notional + commission
            self._shares += delta
            self._pos = np.clip(target, -1, 1)

        self._i += 1
        self._last_price = self._price(self._i-1)
        new_equity = self._cash + self._shares * self._last_price
        reward = (new_equity - equity) / max(self._cash0, 1e-9)

        terminated = self._i >= len(self.src.df) - 1
        truncated = False if self._max_steps is None else (self._i - self._i0) >= self._max_steps
        info = {"i": self._i, "price": self._last_price, "equity": new_equity}
        return self._obs(self._i), float(reward), bool(terminated), bool(truncated), info

    def render(self): ...
