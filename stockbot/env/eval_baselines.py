"""
Run baselines to validate environment behavior.
Usage:
  python -m stockbot.env.eval_baselines --config stockbot/env/env.example.yaml
"""
from __future__ import annotations
from datetime import datetime
import argparse, numpy as np
from stockbot.env.config import EnvConfig
from stockbot.env.data_adapter import BarWindowSource
from stockbot.env.trading_env import StockTradingEnv
from stockbot.ingestion.yfinance_ingestion import YFinanceProvider

def run_episode(env, policy="random", seed=0):
    obs, info = env.reset(seed=seed)
    done = trunc = False
    rewards = []
    while not (done or trunc):
        if policy == "random":
            a = env.action_space.sample()
        elif policy == "hold_long":
            # map to +1 for both discrete/continuous
            a = 2 if hasattr(env.action_space, "n") else np.array([1.0], dtype=np.float32)
        elif policy == "hold_flat":
            a = 1 if hasattr(env.action_space, "n") else np.array([0.0], dtype=np.float32)
        else:
            raise ValueError("unknown policy")
        obs, r, done, trunc, info = env.step(a)
        rewards.append(float(r))
    return {
        "steps": len(rewards),
        "total_reward": float(np.sum(rewards)),
        "equity": float(info["equity"]),
    }

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--config", type=str, default="stockbot/env/env.example.yaml")
    args = p.parse_args()
    cfg = EnvConfig.from_yaml(args.config)

    prov = YFinanceProvider()
    data = BarWindowSource(prov, cfg)

    env = StockTradingEnv(data, episode=cfg.episode, fees=cfg.fees, features=cfg.features)

    rand = run_episode(env, "random", seed=42)
    hold = run_episode(StockTradingEnv(data, episode=cfg.episode, fees=cfg.fees, features=cfg.features),
                       "hold_long", seed=42)
    flat = run_episode(StockTradingEnv(data, episode=cfg.episode, fees=cfg.fees, features=cfg.features),
                       "hold_flat", seed=42)

    print("\n=== Baseline Results ===")
    print(f"Random     -> steps={rand['steps']} equity={rand['equity']:.2f} total_reward={rand['total_reward']:+.6f}")
    print(f"Buy&Hold   -> steps={hold['steps']} equity={hold['equity']:.2f} total_reward={hold['total_reward']:+.6f}")
    print(f"Stay Flat  -> steps={flat['steps']} equity={flat['equity']:.2f} total_reward={flat['total_reward']:+.6f}")

if __name__ == "__main__":
    main()
