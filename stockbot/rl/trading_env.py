"""A simple stock trading environment compatible with Gymnasium.

This environment models a single-asset trading scenario using historical
market data. The state is a fixed number of past timesteps of engineered
features plus the current position. Actions: hold, buy, sell.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import gymnasium as gym
from gymnasium import spaces
from typing import Tuple, Dict, Any, Optional


class TradingEnv(gym.Env):
    """Custom environment for stock trading using Gymnasium API."""

    metadata = {"render_modes": ["human"]}

    def __init__(
        self,
        df: pd.DataFrame,
        window_size: int = 10,
        initial_balance: float = 10_000.0,
        render_mode: Optional[str] = None,
    ):
        super().__init__()
        self.df = df.reset_index(drop=True)
        self.window_size = window_size
        self.initial_balance = initial_balance
        self.render_mode = render_mode

        # Episode state
        self.current_step = self.window_size
        self.balance = initial_balance
        self.position = 0  # +1 long, 0 flat, -1 short
        self.position_price = 0.0

        # Features (exclude raw OHLCV + label)
        self.feature_columns = [
            c for c in df.columns
            if c not in ["Open", "High", "Low", "Close", "Adj Close", "Volume", "label"]
        ]
        self.num_features = len(self.feature_columns)

        # Observation: (window_size, num_features + 1[=position])
        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(self.window_size, self.num_features + 1),
            dtype=np.float32,
        )
        # Actions: 0 hold, 1 buy(long), 2 sell(short)
        self.action_space = spaces.Discrete(3)

    # --------- Helpers ---------
    def _get_price(self) -> float:
        return float(self.df.loc[self.current_step, "Close"])

    def _get_observation(self) -> np.ndarray:
        start = self.current_step - self.window_size
        end = self.current_step
        window = self.df.loc[start:end - 1, self.feature_columns].values.astype(np.float32)
        pos = np.full((self.window_size, 1), self.position, dtype=np.float32)
        return np.concatenate([window, pos], axis=1)

    # --------- Gymnasium API ---------
    def reset(
        self,
        *,
        seed: Optional[int] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        super().reset(seed=seed)
        self.current_step = self.window_size
        self.balance = self.initial_balance
        self.position = 0
        self.position_price = 0.0
        obs = self._get_observation()
        info: Dict[str, Any] = {}
        return obs, info

    def step(self, action: int):
        assert self.action_space.contains(action), f"Invalid action: {action}"
        price = self._get_price()
        reward = 0.0

        # Execute action
        if action == 1:  # buy / go long
            if self.position == 0:
                self.position = 1
                self.position_price = price
            elif self.position < 0:
                # close short then go long
                reward += (self.position_price - price) * abs(self.position)
                self.position = 1
                self.position_price = price
        elif action == 2:  # sell / go short
            if self.position == 0:
                self.position = -1
                self.position_price = price
            elif self.position > 0:
                # close long then go short
                reward += (price - self.position_price) * abs(self.position)
                self.position = -1
                self.position_price = price

        # Advance time
        self.current_step += 1

        terminated = False
        truncated = self.current_step >= (len(self.df) - 1)

        # If we reached the end, settle PnL
        if truncated:
            final_price = price
            if self.position > 0:
                reward += (final_price - self.position_price) * self.position
            elif self.position < 0:
                reward += (self.position_price - final_price) * abs(self.position)
            self.position = 0

        # Mark-to-market while running
        if not truncated:
            next_price = self._get_price()
            if self.position > 0:
                reward += next_price - price
            elif self.position < 0:
                reward += price - next_price

        self.balance += reward

        obs = self._get_observation() if not truncated else np.zeros_like(self.observation_space.low)
        info: Dict[str, Any] = {"balance": self.balance}
        return obs, reward, terminated, truncated, info

    def render(self) -> None:
        print(
            f"Step: {self.current_step}, Pos: {self.position}, "
            f"Balance: {self.balance:.2f}, Price: {self._get_price():.2f}"
        )
