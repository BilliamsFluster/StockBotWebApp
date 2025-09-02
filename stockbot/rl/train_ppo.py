"""CLI wrapper around :class:`Trainer` for PPO training."""
from __future__ import annotations
import argparse
from pathlib import Path

from stockbot.env.config import EnvConfig
from .trainer import Trainer


def main():
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
    ap.add_argument("--batch-size", type=int, default=0)
    ap.add_argument("--learning-rate", type=float, default=3e-4)
    ap.add_argument("--gamma", type=float, default=0.99)
    ap.add_argument("--gae-lambda", type=float, default=0.95)
    ap.add_argument("--clip-range", type=float, default=0.2)
    ap.add_argument("--entropy-coef", type=float, default=0.0)
    ap.add_argument("--vf-coef", type=float, default=0.5)
    ap.add_argument("--max-grad-norm", type=float, default=0.5)
    ap.add_argument("--dropout", type=float, default=0.0)
    ap.add_argument("--eval-freq", type=int, default=10_000)
    args = ap.parse_args()

    cfg = EnvConfig.from_yaml(args.config)
    if args.train_start and args.train_end and args.eval_start and args.eval_end:
        cfg = cfg
    trainer = Trainer(cfg, policy=args.policy, normalize=args.normalize, seed=args.seed)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.batch_size == 0:
        args.batch_size = args.n_steps // 4

    ppo_kwargs = {
        "n_steps": args.n_steps,
        "batch_size": args.batch_size,
        "learning_rate": args.learning_rate,
        "gamma": args.gamma,
        "gae_lambda": args.gae_lambda,
        "clip_range": args.clip_range,
        "ent_coef": args.entropy_coef,
        "vf_coef": args.vf_coef,
        "max_grad_norm": args.max_grad_norm,
        "dropout": args.dropout,
        "eval_freq": args.eval_freq,
    }

    trainer.run(args.timesteps, out_dir, **ppo_kwargs)


if __name__ == "__main__":
    main()
