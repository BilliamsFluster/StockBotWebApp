# stockbot/env/trading_env.py
from __future__ import annotations
import numpy as np
import gymnasium as gym
from gymnasium import spaces
from dataclasses import asdict
from .config import EpisodeConfig, FeeModel, FeatureConfig
from .data_adapter import BarWindowSource

class StockTradingEnv(gym.Env):
    """
    Single-asset env with position target in [-1, +1] (short/flat/long).
    Adds optional per-step change cap and light reward penalties for turnover and drawdown.
    """
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
        cols = ["open", "high", "low", "close", "volume"] + list(self.features.indicators)
        missing = [c for c in cols if c not in self.src.df.columns]
        if missing:
            raise RuntimeError(f"Missing required feature columns: {missing}")
        self._cols = cols

        F = len(self._cols)
        self.observation_space = spaces.Dict({
            "window": spaces.Box(low=-np.inf, high=np.inf, shape=(self.lookback, F), dtype=np.float32),
            # portfolio: [pos, cash_frac, margin_used, unrealized, drawdown,
            #             realized, rolling_vol, turnover]
            "portfolio": spaces.Box(low=np.array([-1,0,0,-1,0,-1,0,0], np.float32),
                                    high=np.array([+1,1,10,+1,1,1,10,2], np.float32),
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
        self._avg_cost = 0.0
        self._turnover_last = 0.0
        self._ret_hist = []
        self._max_steps = episode.max_steps

        # NEW: shaping/turnover knobs
        self.w_turnover = float(getattr(self.episode, "w_turnover", 0.0))
        self.w_drawdown = float(getattr(self.episode, "w_drawdown", 0.0))
        self.max_step_change = float(getattr(self.episode, "max_step_change", 1.0))  # allow full flips by default
        self._pos_prev_for_pen = 0.0

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
        unreal_val = self._shares * (self._last_price - self._avg_cost)
        unreal = unreal_val / max(self._cash0, 1e-9)
        realized = (self._cash - self._cash0) / max(self._cash0, 1e-9)
        margin_used = abs(self._shares * self._last_price) / max(equity, 1e-9)
        vol = 0.0
        if len(self._ret_hist) > 1:
            vol = float(np.std(self._ret_hist[-20:]))
        return np.array([
            float(np.clip(self._pos, -1, 1)),
            float(np.clip(self._cash / max(self._cash0,1e-9), 0, 1)),
            float(np.clip(margin_used, 0, 10)),
            float(np.clip(unreal, -1, 1)),
            float(np.clip(dd, 0, 1)),
            float(np.clip(realized, -1, 1)),
            float(np.clip(vol, 0, 10)),
            float(np.clip(self._turnover_last, 0, 2)),
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
        self._pos_prev_for_pen = 0.0
        self._last_price = self._price(self._i-1)
        self._avg_cost = self._last_price
        self._turnover_last = 0.0
        self._ret_hist = []
        return self._obs(self._i), {"i": self._i, "config": asdict(self.episode)}

    def step(self, action):
        if isinstance(self.action_space, spaces.Discrete):
            target = {-1: -1.0, 0: 0.0, 1: 1.0}[int(action)-1]
        else:
            target = float(np.clip(action, -1, 1))

        # limit per-step change to avoid flip-flop churn
        target = float(np.clip(target, self._pos - self.max_step_change, self._pos + self.max_step_change))
        target = float(np.clip(target, -1.0, 1.0))

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
            prev_shares = self._shares
            self._shares += delta
            # update average cost
            if self._shares == 0:
                self._avg_cost = 0.0
            elif prev_shares == 0 or np.sign(prev_shares) != np.sign(self._shares):
                self._avg_cost = fill_price
            else:
                self._avg_cost = (
                    prev_shares * self._avg_cost + delta * fill_price
                ) / self._shares
            self._pos = np.clip(target, -1, 1)

        self._i += 1
        self._last_price = self._price(self._i-1)
        new_equity = self._cash + self._shares * self._last_price

        ret_step = (new_equity - equity) / max(equity, 1e-9)
        self._ret_hist.append(float(ret_step))
        base = (new_equity - equity) / max(self._cash0, 1e-9)

        # penalties: drawdown & turnover (position change)
        dd = 0.0 if self._equity_peak <= 0 else 1.0 - new_equity / self._equity_peak
        turnover_t = abs(self._pos - self._pos_prev_for_pen)
        self._turnover_last = turnover_t
        reward = base - self.w_turnover * turnover_t - self.w_drawdown * dd

        self._pos_prev_for_pen = self._pos

        terminated = self._i >= len(self.src.df) - 1
        truncated = False if self._max_steps is None else (self._i - self._i0) >= self._max_steps
        info = {"i": self._i, "price": self._last_price, "equity": new_equity}
        return self._obs(self._i), float(reward), bool(terminated), bool(truncated), info

    def render(self): ...
