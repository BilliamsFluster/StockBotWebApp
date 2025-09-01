from __future__ import annotations
"""Hybrid policy combining probabilistic sizing with PPO policy.

The policy inspects the probability features present in the observation
(`obs["prob"]`). When the predicted edge from the probability core is strong
(either the next step probability of an up move exceeds ``prob_threshold`` or
``mu/sigma`` is positive), the policy takes a deterministic action based on
those features.  Otherwise it falls back to the provided PPO policy's action.

This lightweight arbitration allows the agent to exploit whichever component
currently offers a clearer signal.
"""
from dataclasses import dataclass
from typing import Any, Optional, Tuple

import numpy as np


@dataclass
class HybridPolicy:
    """Simple action arbitration between probability core and PPO policy."""

    ppo_policy: Any
    prob_threshold: float = 0.55
    mu_sigma_threshold: float = 0.0

    def reset(self) -> None:
        if hasattr(self.ppo_policy, "reset"):
            self.ppo_policy.reset()

    def _prob_action(self, prob_vec: np.ndarray) -> np.ndarray:
        """Size position purely from probability features."""
        p_up = float(prob_vec[2]) if prob_vec.size > 2 else 0.5
        mu_sigma = float(prob_vec[3]) if prob_vec.size > 3 else 0.0
        if p_up > self.prob_threshold or mu_sigma > self.mu_sigma_threshold:
            # Convert edge into [-1, 1] action. Positive edge -> long, negative -> short.
            edge = p_up - 0.5
            return np.array([np.clip(edge * 2.0, -1.0, 1.0)], dtype=np.float32)
        return np.array([], dtype=np.float32)

    def predict(
        self,
        obs: dict,
        state: Optional[Tuple[np.ndarray, np.ndarray]] = None,
        episode_start: Optional[np.ndarray] = None,
        deterministic: bool = True,
    ):
        prob = obs.get("prob")
        if prob is not None:
            act = self._prob_action(prob)
            if act.size:
                return act, state
        # Fallback to PPO
        return self.ppo_policy.predict(obs, state, episode_start, deterministic)
