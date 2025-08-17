"""Training script for reinforcement‑learning agents in StockBot.

This script trains a reinforcement‑learning agent on a single stock using
the custom `TradingEnv` environment defined in `trading_env.py`.  It uses
Stable‑Baselines3 for the RL algorithms and supports popular algorithms
such as PPO and DQN.  You must install `stable-baselines3` and
`gym` to run this script.

Usage example:

    python -m stockbot.rl.train_rl_agent --dataset ./stockbot/data/AAPL_2020-01-01_to_2024-12-31_window10.csv \
        --algo PPO --timesteps 10000 --model-out ./stockbot/models/aapl_rl.zip
"""

from __future__ import annotations

import argparse
import os

import pandas as pd

try:
    import gym
    from stable_baselines3 import PPO, DQN
except ImportError as exc:
    raise ImportError(
        "Stable‑Baselines3 and gym are required for RL training. "
        "Install with `pip install stable-baselines3 gym`"
    ) from exc

from stockbot.rl.trading_env import TradingEnv


def main():
    parser = argparse.ArgumentParser(description="Train an RL agent on stock data")
    parser.add_argument("--dataset", required=True, help="CSV dataset produced by prepare_dataset()")
    parser.add_argument("--window-size", type=int, default=10, help="Sequence length for observations")
    parser.add_argument("--algo", choices=["PPO", "DQN"], default="PPO", help="RL algorithm")
    parser.add_argument("--timesteps", type=int, default=10000, help="Number of training timesteps")
    parser.add_argument("--model-out", default="rl_agent.zip", help="Path to save the trained model")
    args = parser.parse_args()

    # Load dataset and prepare environment
    df = pd.read_csv(args.dataset, index_col=0)
    # Drop last row (the last label has no next day)
    df.dropna(inplace=True)
    env = TradingEnv(df, window_size=args.window_size)

    # Select algorithm
    if args.algo == "PPO":
        model_class = PPO
    else:
        model_class = DQN
    model = model_class("MlpPolicy", env, verbose=1)
    # Train
    model.learn(total_timesteps=args.timesteps)
    # Save
    model_dir = os.path.dirname(args.model_out)
    if model_dir:
        os.makedirs(model_dir, exist_ok=True)
    model.save(args.model_out)
    print(f"RL model saved to {args.model_out}")


if __name__ == "__main__":
    main()
