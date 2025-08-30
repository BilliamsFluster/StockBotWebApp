"""
Run baselines to validate environment behavior (single OR multi asset).
Usage:
  python -m stockbot.env.eval_baselines --config stockbot/env/env.example.yaml
"""
from __future__ import annotations
import argparse, numpy as np

from stockbot.env.config import EnvConfig
from stockbot.env.data_adapter import BarWindowSource, PanelSource
from stockbot.env.trading_env import StockTradingEnv
from stockbot.env.portfolio_env import PortfolioTradingEnv
from stockbot.ingestion.yfinance_ingestion import YFinanceProvider

def run_single(cfg: EnvConfig):
    prov = YFinanceProvider()
    data = BarWindowSource(prov, cfg)
    env = StockTradingEnv(data, episode=cfg.episode, fees=cfg.fees, features=cfg.features)

    def episode(policy="random", seed=0):
        obs, info = env.reset(seed=seed)
        done = trunc = False
        rng = np.random.default_rng(seed)
        rew=[]
        while not (done or trunc):
            if policy == "random":
                a = env.action_space.sample()
            elif policy == "hold_long":
                a = 2 if hasattr(env.action_space, "n") else np.array([1.0], dtype=np.float32)
            else:
                a = 1 if hasattr(env.action_space, "n") else np.array([0.0], dtype=np.float32)
            obs, r, done, trunc, info = env.step(a)
            rew.append(float(r))
        eq = float(info["equity"])
        tr = float(np.sum(rew))
        theory = (eq - cfg.episode.start_cash) / cfg.episode.start_cash
        print(f"telescoped={theory:+.6f} vs_sum={tr:+.6f}  (single)")
        return eq, tr, len(rew)

    eq_r, tr_r, n_r = episode("random", 42)
    eq_h, tr_h, n_h = episode("hold_long", 42)
    eq_f, tr_f, n_f = episode("flat", 42)

    print("\n=== Single-Asset Baselines ===")
    print(f"Random     -> steps={n_r} equity={eq_r:.2f} total_reward={tr_r:+.6f}")
    print(f"Buy&Hold   -> steps={n_h} equity={eq_h:.2f} total_reward={tr_h:+.6f}")
    print(f"Stay Flat  -> steps={n_f} equity={eq_f:.2f} total_reward={tr_f:+.6f}")

def run_multi(cfg: EnvConfig):
    prov = YFinanceProvider()
    panel = PanelSource(prov, cfg)
    env = PortfolioTradingEnv(panel, cfg)

    def episode(policy="equal", seed=0):
        obs, info = env.reset(seed=seed)
        done = trunc = False
        rng = np.random.default_rng(seed)
        rew=[]
        while not (done or trunc):
            if policy == "equal":
                a = np.ones(env.N, dtype=np.float32)
            elif policy == "first_long":
                a = np.zeros(env.N, dtype=np.float32); a[0] = 3.0
            elif policy == "flat":
                a = np.zeros(env.N, dtype=np.float32)
            else:  # random
                a = rng.standard_normal(env.N).astype(np.float32)
            obs, r, done, trunc, info = env.step(a)
            rew.append(float(r))
        eq = float(info["equity"])
        tr = float(np.sum(rew))
        theory = (eq - cfg.episode.start_cash) / cfg.episode.start_cash
        print(f"telescoped={theory:+.6f} vs_sum={tr:+.6f}  (multi)")
        return eq, tr, len(rew)

    print()
    for pol in ["equal","first_long","flat","random"]:
        eq, tr, n = episode(pol, 42)
        print(f"{pol:10s} -> steps={n} equity={eq:,.2f} total_reward={tr:+.6f}")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--config", type=str, default="stockbot/env/env.example.yaml")
    args = p.parse_args()
    cfg = EnvConfig.from_yaml(args.config)

    syms = list(cfg.symbols) if isinstance(cfg.symbols, (list, tuple)) else [cfg.symbols]
    if len(syms) <= 1:
        run_single(cfg)
    else:
        run_multi(cfg)

if __name__ == "__main__":
    main()
