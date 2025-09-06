from __future__ import annotations

"""
Overlay utilities to make PPO act as a risk/size controller while a
probabilistic engine (e.g., HMM-derived signals) drives baseline direction.

Classes
-------
- RiskOverlayWrapper: Gym env wrapper that:
    * Computes baseline weights from a "base engine" given the current obs
    * Applies small PPO control signals (gate/Kelly/vol multipliers)
    * Maps resulting target weights back to the inner env's action space

- HMMEngine: Minimal baseline engine producing per-asset weights from
  windowed prices using a Kelly-style sizing on recent returns, optionally
  regime-aware via gamma in obs. Internally uses ProbPolicy sizing.
"""

from typing import Any, Tuple, Optional

import numpy as np
import gymnasium as gym
from gymnasium import spaces


def _atanh_clip(x: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32)
    x = np.clip(x, -1 + eps, 1 - eps)
    return 0.5 * np.log((1.0 + x) / (1.0 - x))


def _logit(p: float, eps: float = 1e-9) -> float:
    p = float(np.clip(p, eps, 1.0 - eps))
    return np.log(p / (1.0 - p))


class RiskOverlayWrapper(gym.Env):
    """
    Wrap an inner trading env so PPO only controls a few risk knobs while the
    baseline weights come from a separate engine.

    Action (overlay): Box(3,), values in [-1, 1]
      - gate:        [0, invest_cap]     => exposure gate
      - kelly_scale: [kelly_lo, kelly_hi]
      - vol_mult:    [vol_lo, vol_hi]

    Notes
    -----
    - For PortfolioTradingEnv with mapping_mode != 'simplex_cash', the inner action
      is interpreted through tanh to weights; we invert using atanh.
    - For mapping_mode == 'simplex_cash' (long-only), we approximate by
      projecting negative weights to zero, deriving softmax logits from
      proportions and setting the gate logit from the invest fraction.
    - For single-asset StockTradingEnv (continuous), we pass the target position
      directly in [-1, 1].
    """

    def __init__(
        self,
        env: gym.Env,
        base_engine: Any,
        *,
        invest_cap: float = 1.0,
        kelly_bounds: Tuple[float, float] = (0.25, 2.0),
        vol_bounds: Tuple[float, float] = (0.5, 2.0),
    ) -> None:
        super().__init__()
        self.env = env
        self.base_engine = base_engine
        self.invest_cap = float(invest_cap)
        self.kelly_lo, self.kelly_hi = map(float, kelly_bounds)
        self.vol_lo, self.vol_hi = map(float, vol_bounds)

        self.observation_space = env.observation_space
        # gate, kelly_scale, vol_mult — all in [-1, 1]
        self.action_space = spaces.Box(low=-1.0, high=1.0, shape=(3,), dtype=np.float32)

        self._last_obs = None
        self._warned_simplex = False

    # -------------- helpers --------------
    def _current_obs(self):
        return self._last_obs

    def _overlay_scales(self, action: np.ndarray) -> Tuple[float, float, float]:
        gate_raw, k_raw, v_raw = np.asarray(action, dtype=np.float32).reshape(-1)[:3]
        gate = 0.5 * (gate_raw + 1.0) * self.invest_cap
        kelly_scale = self.kelly_lo + 0.5 * (k_raw + 1.0) * (self.kelly_hi - self.kelly_lo)
        vol_mult = self.vol_lo + 0.5 * (v_raw + 1.0) * (self.vol_hi - self.vol_lo)
        return float(gate), float(kelly_scale), float(vol_mult)

    def _map_weights_to_action(self, w: np.ndarray) -> np.ndarray:
        # Portfolio env with mapping attribute
        inner = self.env.unwrapped
        if hasattr(inner, "mapping_mode"):
            mode = getattr(inner, "mapping_mode")
            if mode != "simplex_cash":
                # weights -> logits so that tanh(logits) ~= weights
                return _atanh_clip(w)
            # simplex_cash approximation (long-only)
            if not self._warned_simplex:
                print("[RiskOverlayWrapper] mapping_mode=simplex_cash: projecting shorts to 0 for overlay.")
                self._warned_simplex = True
            w_pos = np.clip(w, 0.0, None)
            s = float(w_pos.sum())
            invest_max = float(getattr(inner, "invest_max", 1.0))
            invest_frac = min(s, invest_max)
            gate_logit = _logit(invest_frac / max(invest_max, 1e-9))
            if s > 0:
                p = (w_pos / s)
            else:
                p = np.ones_like(w_pos, dtype=np.float32) / max(len(w_pos), 1)
            asset_logits = np.log(p + 1e-9)
            return np.concatenate([asset_logits.astype(np.float32), np.array([gate_logit], dtype=np.float32)])

        # Single-asset continuous env: action is the desired position in [-1, 1]
        if isinstance(self.env.action_space, spaces.Box) and self.env.action_space.shape == (1,):
            return np.array([float(np.clip(w[0], -1.0, 1.0))], dtype=np.float32)

        # Fallback: assume tanh mapping
        return _atanh_clip(w)

    # -------------- gym API --------------
    def reset(self, *, seed: Optional[int] = None, options: Optional[dict] = None):
        obs, info = self.env.reset(seed=seed, options=options)
        self._last_obs = obs
        if hasattr(self.base_engine, "reset"):
            self.base_engine.reset()
        return obs, info

    def step(self, action):
        # 1) baseline weights from engine using current observation
        obs_now = self._current_obs()
        if obs_now is None:
            # safety: if step called before reset
            obs_now, _ = self.env.reset()
        w_base, *_ = self.base_engine.predict(obs_now, deterministic=True)
        w_base = np.asarray(w_base, dtype=np.float32)

        # 2) overlay risk controls
        gate, kelly_scale, vol_mult = self._overlay_scales(action)
        w_target = np.asarray(w_base, dtype=np.float32) * (gate * kelly_scale * vol_mult)

        # 3) map to inner env action
        inner_action = self._map_weights_to_action(w_target)

        # 4) forward to inner env
        obs_next, reward, terminated, truncated, info = self.env.step(inner_action)
        self._last_obs = obs_next
        # optionally expose overlay diagnostics
        info = dict(info)
        info["overlay_gate"] = float(gate)
        info["overlay_kelly_scale"] = float(kelly_scale)
        info["overlay_vol_mult"] = float(vol_mult)
        return obs_next, float(reward), bool(terminated), bool(truncated), info

    def render(self):
        return self.env.render() if hasattr(self.env, "render") else None


class HMMEngine:
    """
    Minimal baseline engine that produces per-asset weights from rolling
    window prices inside the observation using a Kelly-style rule on recent
    log returns per asset. Optionally regime-aware if obs contains 'gamma'.

    Internally leverages ProbPolicy for sizing and guardrails.
    """

    def __init__(
        self,
        *,
        leverage_cap: float = 1.0,
        max_weight: float = 1.0,
        kelly_fraction: float = 1.0,
        max_gross: float = 2.0,
        max_net: float = 2.0,
        max_step_change: float = 0.08,
        rebalance_eps: float = 0.02,
        regime_scalars: Optional[list[float]] = None,
    ) -> None:
        from stockbot.strategy.prob_policy import ProbPolicy
        from stockbot.strategy.regime_sizing import RegimeScalerConfig

        self._ProbPolicy = ProbPolicy
        self._RegimeScalerConfig = RegimeScalerConfig
        self.cfg = dict(
            leverage_cap=float(leverage_cap),
            max_weight=float(max_weight),
            kelly_fraction=float(kelly_fraction),
            max_gross=float(max_gross),
            max_net=float(max_net),
            max_step_change=float(max_step_change),
            rebalance_eps=float(rebalance_eps),
            regime_cfg=(RegimeScalerConfig(state_scalars=regime_scalars) if regime_scalars else None),
        )
        self._policy = None

    def reset(self) -> None:
        self._policy = None

    def _ensure_policy(self, n_assets: int):
        if self._policy is None:
            # Build a minimal action space for shape
            action_space = spaces.Box(low=-1.0, high=1.0, shape=(n_assets,), dtype=np.float32)
            self._policy = self._ProbPolicy(
                action_space,
                leverage_cap=self.cfg["leverage_cap"],
                max_weight=self.cfg["max_weight"],
                kelly_fraction=self.cfg["kelly_fraction"],
                max_gross=self.cfg["max_gross"],
                max_net=self.cfg["max_net"],
                max_step_change=self.cfg["max_step_change"],
                rebalance_eps=self.cfg["rebalance_eps"],
                regime_cfg=self.cfg["regime_cfg"],
            )

    def predict(self, obs: Any, deterministic: bool = True):
        win = np.asarray(obs.get("window"))  # (L, N, F)
        if win.ndim != 3:
            raise ValueError("Observation must include 'window' shaped (L, N, F)")
        L, N, F = win.shape
        # Expect 'close' at index 3 of features as per data adapters
        closes = win[:, :, 3].astype(np.float64)
        if L < 3:
            mu = np.zeros((N,), dtype=np.float32)
            sigma = np.ones((N,), dtype=np.float32) * 1e-3
        else:
            rets = np.diff(np.log(np.clip(closes, 1e-9, None)), axis=0)
            mu = rets.mean(axis=0).astype(np.float32)
            sigma = (rets.std(axis=0) + 1e-6).astype(np.float32)

        obs2 = {"mu": mu, "sigma": sigma}
        if "gamma" in obs:
            obs2["gamma"] = obs["gamma"]

        self._ensure_policy(N)
        return self._policy.predict(obs2, deterministic=deterministic)

