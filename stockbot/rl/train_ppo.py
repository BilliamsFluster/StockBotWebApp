"""
Train a PPO agent on your StockBot environment.

Examples (single-line):

  # auto-split dates from YAML, CNN extractor
  python -m stockbot.rl.train_ppo --config stockbot/env/env.example.yaml --policy window_cnn --normalize --timesteps 300000 --out ppo_cnn_run

  # explicit splits, LSTM extractor with dropout + different HPs
  python -m stockbot.rl.train_ppo --config stockbot/env/env.example.yaml --train-start 2018-01-01 --train-end 2021-12-31 --eval-start 2022-01-01 --eval-end 2022-12-31 --policy window_lstm --dropout 0.10 --learning-rate 1e-4 --entropy-coef 0.01 --timesteps 400000 --out ppo_lstm_run
"""
from __future__ import annotations

import argparse

from stockbot.env.config import EnvConfig
from stockbot.rl.train_utils import infer_split_from_cfg
from stockbot.rl.trainer import PPOTrainer
from stockbot.rl.utils import Split


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", type=str, default="stockbot/env/env.example.yaml")
    ap.add_argument("--train-start", type=str, default=None)
    ap.add_argument("--train-end", type=str, default=None)
    ap.add_argument("--eval-start", type=str, default=None)
    ap.add_argument("--eval-end", type=str, default=None)
    ap.add_argument("--timesteps", type=int, default=150_000)
    ap.add_argument("--out", type=str, default="ppo_run")
    ap.add_argument("--seed", type=int, default=42)

    # Model/Env knobs
    ap.add_argument("--normalize", action="store_true", help="Enable observation normalization")
    ap.add_argument("--policy", type=str, default="mlp", choices=["mlp", "window_cnn", "window_lstm"])
    ap.add_argument("--overlay", type=str, default="none", choices=["none", "hmm"],
                    help="Use a risk overlay with baseline engine (hmm) or none")

    # PPO HPs
    ap.add_argument("--n-steps", type=int, default=1024)
    ap.add_argument("--batch-size", type=int, default=0, help="0 -> auto (n_steps//4)")
    ap.add_argument("--learning-rate", type=float, default=3e-4)
    ap.add_argument("--gamma", type=float, default=0.99)
    ap.add_argument("--gae-lambda", type=float, default=0.95)
    ap.add_argument("--clip-range", type=float, default=0.2)
     # accept both --entropy-coef and --ent-coef for convenience
    ap.add_argument(
        "--entropy-coef",
        "--ent-coef",
        type=float,
        dest="entropy_coef",
        default=0.0,
    )    
    ap.add_argument("--vf-coef", type=float, default=0.5)
    ap.add_argument("--max-grad-norm", type=float, default=0.5)
    ap.add_argument("--dropout", type=float, default=0.10, help="Dropout for extractors where applicable")
    return ap.parse_args()


def resolve_split(cfg: EnvConfig, args) -> Split:
    if all([args.train_start, args.train_end, args.eval_start, args.eval_end]):
        return Split(train=(args.train_start, args.train_end), eval=(args.eval_start, args.eval_end))
    split = infer_split_from_cfg(cfg)
    print(
        f"[auto-split] train={split.train[0]}->{split.train[1]}  eval={split.eval[0]}->{split.eval[1]}"
    )
    return split


def main():
    args = parse_args()
    cfg = EnvConfig.from_yaml(args.config)
    split = resolve_split(cfg, args)
    trainer = PPOTrainer(cfg, split, args)
    trainer.train()


if __name__ == "__main__":
    main()
