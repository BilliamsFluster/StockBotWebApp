"""
Evaluate a trained PPO agent vs baselines on a chosen period.
Example:
  python -m stockbot.rl.eval_agent --config stockbot/env/env.example.yaml \
      --model runs/ppo_aapl_msft/ppo_policy.zip \
      --eval-start 2022-01-01 --eval-end 2022-12-31
"""
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
from stable_baselines3 import PPO

from stockbot.env.config import EnvConfig
from stockbot.rl.utils import make_env, Split, episode_rollout
from stockbot.rl.metrics import total_return, max_drawdown, sharpe, sortino, calmar, turnover

def baseline_rollout(env, policy_name: str, seed: int = 0):
    obs, info = env.reset(seed=seed)
    done = trunc = False
    equities = []
    turnovers = []
    rng = np.random.default_rng(seed)
    while not (done or trunc):
        if policy_name == "equal":
            a = np.ones(env.action_space.shape[0], dtype=np.float32)
        elif policy_name == "first_long":
            a = np.zeros(env.action_space.shape[0], dtype=np.float32); a[0] = 3.0
        elif policy_name == "flat":
            a = np.zeros(env.action_space.shape[0], dtype=np.float32)
        else:  # random
            a = rng.standard_normal(env.action_space.shape[0]).astype(np.float32)
        obs, r, done, trunc, info = env.step(a)
        equities.append(float(info["equity"]))
        turnovers.append(float(info.get("turnover", 0.0)))
    return np.array(equities, dtype=np.float64), np.array(turnovers, dtype=np.float64)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", type=str, default="stockbot/env/env.example.yaml")
    ap.add_argument("--model",  type=str, required=True)
    ap.add_argument("--eval-start", type=str, required=True)
    ap.add_argument("--eval-end",   type=str, required=True)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    cfg = EnvConfig.from_yaml(args.config)
    split = Split(train=(args.eval_start, args.eval_end), eval=(args.eval_start, args.eval_end))  # reuse

    env = make_env(cfg, split, mode="eval")
    from stockbot.env.config import EpisodeConfig
    start_cash = cfg.episode.start_cash if isinstance(cfg.episode, EpisodeConfig) else 100_000.0

    # load model
    model = PPO.load(Path(args.model))

    # agent
    curve_agent, to_agent = episode_rollout(env, model, deterministic=True, seed=args.seed)
    # baselines (equal, first_long, flat, random)
    env2 = make_env(cfg, split, mode="eval")
    curve_equal, to_equal = baseline_rollout(env2, "equal", args.seed)
    env3 = make_env(cfg, split, mode="eval")
    curve_first, to_first = baseline_rollout(env3, "first_long", args.seed)
    env4 = make_env(cfg, split, mode="eval")
    curve_flat, to_flat  = baseline_rollout(env4, "flat", args.seed)

    def report(name, curve, to_arr):
        tr = total_return(curve, start_cash)
        mdd = max_drawdown(curve)
        shp = sharpe(curve, start_cash)
        sor = sortino(curve, start_cash)
        cal = calmar(curve, start_cash)
        to_metric = turnover(to_arr)
        print(f"{name:12s}  Ret={tr:+.3f}  MaxDD={mdd:.3f}  Sharpe={shp:.3f}  Sortino={sor:.3f}  Calmar={cal:.3f}  Turnover={to_metric:.3f}")

    print(f"\n== Evaluation {args.eval_start} → {args.eval_end} ==")
    report("Agent(PPO)", curve_agent, to_agent)
    report("Equal",      curve_equal, to_equal)
    report("FirstLong",  curve_first, to_first)
    report("Flat",       curve_flat, to_flat)

if __name__ == "__main__":
    main()
