"""
Train a PPO agent on your StockBot environment.
"""
from __future__ import annotations

import argparse

from stockbot.env.config import EnvConfig
from stockbot.rl.trainer import Trainer, infer_split, Split


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", type=str, default="stockbot/env/env.example.yaml")
    ap.add_argument("--train-start", type=str, default=None)
    ap.add_argument("--train-end", type=str, default=None)
    ap.add_argument("--eval-start", type=str, default=None)
    ap.add_argument("--eval-end", type=str, default=None)
    ap.add_argument("--timesteps", type=int, default=150_000)
    ap.add_argument("--out", type=str, default="ppo_run")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--normalize", action="store_true")
    ap.add_argument("--policy", type=str, default="mlp", choices=["mlp", "window_cnn", "window_lstm"])
    ap.add_argument("--n-steps", type=int, default=1024)
    ap.add_argument("--batch-size", type=int, default=0, help="0 -> auto (n_steps//4)")
    ap.add_argument("--learning-rate", type=float, default=3e-4)
    ap.add_argument("--gamma", type=float, default=0.99)
    ap.add_argument("--gae-lambda", type=float, default=0.95)
    ap.add_argument("--clip-range", type=float, default=0.2)
    ap.add_argument("--entropy-coef", type=float, default=0.0)
    ap.add_argument("--vf-coef", type=float, default=0.5)
    ap.add_argument("--max-grad-norm", type=float, default=0.5)
    ap.add_argument("--dropout", type=float, default=0.10, help="Dropout for extractors where applicable")
    return ap.parse_args()


def main() -> None:
    args = parse_args()
    cfg = EnvConfig.from_yaml(args.config)
    if all([args.train_start, args.train_end, args.eval_start, args.eval_end]):
        split = Split(train=(args.train_start, args.train_end), eval=(args.eval_start, args.eval_end))
    else:
        split = infer_split(cfg)
    trainer = Trainer(cfg, split, args)
    trainer.run()


if __name__ == "__main__":
    main()
