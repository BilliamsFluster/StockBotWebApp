"""Smoke test for PPO training and evaluation.

This module is intended for manual experimentation and is skipped during
automated unit testing to avoid heavy dependencies and side effects.
"""
from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

import pytest

pytest.skip("smoke test module not executed during automated tests", allow_module_level=True)

from stable_baselines3 import PPO

try:  # pragma: no cover
    from stockbot.env.config import EnvConfig
    from stockbot.rl.utils import make_env, Split, episode_rollout
    from stockbot.rl.metrics import total_return, max_drawdown, sharpe, sortino, calmar, turnover
except ModuleNotFoundError:  # executed when repo root not on sys.path
    from env.config import EnvConfig
    from rl.utils import make_env, Split, episode_rollout
    from rl.metrics import total_return, max_drawdown, sharpe, sortino, calmar, turnover

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", type=str, default="stockbot/env/env.example.yaml")
    ap.add_argument("--timesteps", type=int, default=20_000)
    args = ap.parse_args()

    cfg = EnvConfig.from_yaml(args.config)
    # light split within your YAML range
    split = Split(train=(cfg.start, "2021-12-31"), eval=("2022-01-01", cfg.end))

    # vec envs
    train_env = make_env(cfg, split, mode="train")
    eval_env  = make_env(cfg, split, mode="eval")

    model = PPO("MultiInputPolicy", train_env, verbose=1, n_steps=1024, batch_size=1024)
    model.learn(total_timesteps=args.timesteps)

    from stockbot.env.config import EpisodeConfig
    start_cash = cfg.episode.start_cash if isinstance(cfg.episode, EpisodeConfig) else 100_000.0
    curve, to = episode_rollout(eval_env, model, deterministic=True, seed=42)
    print("\n== Smoke Test Metrics (eval split) ==")
    print(f"TotalReturn: {total_return(curve, start_cash):+.3f}")
    print(f"MaxDrawdown: {max_drawdown(curve):.3f}")
    print(f"Sharpe:      {sharpe(curve, start_cash):.3f}")
    print(f"Sortino:     {sortino(curve, start_cash):.3f}")
    print(f"Calmar:      {calmar(curve, start_cash):.3f}")
    print(f"Turnover:    {turnover(to):.3f}")

if __name__ == "__main__":
    main()
