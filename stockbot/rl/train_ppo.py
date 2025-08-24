"""
Train a PPO agent on your StockBot environment.

Usage (auto-split dates from YAML):
  python -m stockbot.rl.train_ppo --config stockbot/env/env.example.yaml --out ppo_aapl_msft --timesteps 300000

Or explicit splits:
  python -m stockbot.rl.train_ppo --config stockbot/env/env.example.yaml \
    --train-start 2018-01-01 --train-end 2021-12-31 \
    --eval-start  2022-01-01 --eval-end  2022-12-31 \
    --out ppo_aapl_msft --timesteps 300000
"""
from __future__ import annotations
import argparse
from dataclasses import replace
from datetime import datetime, timedelta
from pathlib import Path

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import EvalCallback, StopTrainingOnRewardThreshold
from stable_baselines3.common.vec_env import DummyVecEnv
from stable_baselines3.common.logger import configure

from stockbot.env.config import EnvConfig, EpisodeConfig
from stockbot.rl.utils import make_env, Split
from stockbot.rl.metrics import total_return, max_drawdown, daily_sharpe


def _to_dt(s: str) -> datetime:
    return datetime.fromisoformat(str(s))


def _infer_split_from_cfg(cfg: EnvConfig) -> Split:
    """Train/eval split inference (calendar-year or 80/20)."""
    start = _to_dt(cfg.start)
    end   = _to_dt(cfg.end)

    span_days = (end - start).days
    if span_days < 365:
        # 80/20 time split
        split_point = start + timedelta(days=int(span_days * 0.8))
        train = (start.strftime("%Y-%m-%d"), split_point.strftime("%Y-%m-%d"))
        eval_ = ((split_point + timedelta(days=1)).strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
        return Split(train=train, eval=eval_)

    # Use last calendar year for eval; everything before for train
    last_year = end.year
    eval_start = datetime(last_year, 1, 1)
    eval_end   = end
    train_end  = eval_start - timedelta(days=1)

    if start.year >= last_year:
        # fallback to 80/20 if start is already in eval year
        split_point = start + timedelta(days=int(span_days * 0.8))
        train = (start.strftime("%Y-%m-%d"), split_point.strftime("%Y-%m-%d"))
        eval_ = ((split_point + timedelta(days=1)).strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
        return Split(train=train, eval=eval_)

    train = (start.strftime("%Y-%m-%d"), train_end.strftime("%Y-%m-%d"))
    eval_ = (eval_start.strftime("%Y-%m-%d"), eval_end.strftime("%Y-%m-%d"))
    return Split(train=train, eval=eval_)


def _make_vec(factory):
    # SB3 expects a VecEnv
    return DummyVecEnv([factory])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", type=str, default="stockbot/env/env.example.yaml")
    ap.add_argument("--train-start", type=str, default=None)
    ap.add_argument("--train-end",   type=str, default=None)
    ap.add_argument("--eval-start",  type=str, default=None)
    ap.add_argument("--eval-end",    type=str, default=None)
    ap.add_argument("--timesteps",   type=int, default=150_000)
    ap.add_argument("--out",         type=str, default="ppo_run")
    ap.add_argument("--seed",        type=int, default=42)
    # NEW flags
    ap.add_argument("--normalize",   action="store_true", help="Enable observation normalization")
    ap.add_argument("--policy",      type=str, default="mlp", choices=["mlp","window_cnn","window_lstm"])
    ap.add_argument("--n-steps",     type=int, default=1024)
    ap.add_argument("--learning-rate", type=float, default=3e-4)
    ap.add_argument("--gamma",       type=float, default=0.99)
    ap.add_argument("--gae-lambda",  type=float, default=0.95)
    ap.add_argument("--clip-range",  type=float, default=0.2)
    ap.add_argument("--entropy-coef", type=float, default=0.0)
    ap.add_argument("--max-grad-norm", type=float, default=0.5)
    ap.add_argument("--dropout",     type=float, default=0.0,
                    help="Dropout rate for policy networks where applicable")
    args = ap.parse_args()

    cfg = EnvConfig.from_yaml(args.config)

    # Resolve split
    if all([args.train_start, args.train_end, args.eval_start, args.eval_end]):
        split = Split(train=(args.train_start, args.train_end),
                      eval=(args.eval_start,  args.eval_end))
    else:
        split = _infer_split_from_cfg(cfg)
        print(f"[auto-split] train={split.train[0]}->{split.train[1]}  "
              f"eval={split.eval[0]}->{split.eval[1]}")

    # Force outputs into stockbot/runs/<out>
    base_dir = Path(__file__).resolve().parent.parent / "runs"
    out_dir = base_dir / args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    # Build Vec envs with optional normalization
    def train_env_fn(): return make_env(cfg, split, mode="train", normalize=args.normalize)
    def eval_env_fn():  return make_env(cfg, split, mode="eval",  normalize=args.normalize)
    train_env = _make_vec(train_env_fn)
    eval_env  = _make_vec(eval_env_fn)

    # Logger
    new_logger = configure(str(out_dir), ["stdout", "csv", "tensorboard"])

    # Policy config
    policy_kwargs = {}
    if args.policy == "window_cnn":
        from stockbot.rl.policy import WindowCNNExtractor
        policy_kwargs = dict(
            features_extractor_class=WindowCNNExtractor,
            features_extractor_kwargs={"out_dim": 256},
            net_arch=[dict(pi=[128, 64], vf=[128, 64])]
        )
    elif args.policy == "window_lstm":
        from stockbot.rl.policy import WindowLSTMExtractor
        policy_kwargs = dict(
            features_extractor_class=WindowLSTMExtractor,
            features_extractor_kwargs={
                "out_dim": 256,
                "hidden_size": 128,
                "num_layers": 1,
                "dropout": args.dropout,
            },
            net_arch=[dict(pi=[128, 64], vf=[128, 64])]
        )

    # PPO model
    model = PPO("MultiInputPolicy", train_env,
                n_steps=args.n_steps, batch_size=args.n_steps,
                gae_lambda=args.gae_lambda, gamma=args.gamma,
                learning_rate=args.learning_rate, ent_coef=args.entropy_coef,
                vf_coef=0.5, clip_range=args.clip_range,
                max_grad_norm=args.max_grad_norm,
                verbose=1, seed=args.seed,
                policy_kwargs=policy_kwargs)
    model.set_logger(new_logger)

    # Eval callback
    stop_cb = StopTrainingOnRewardThreshold(reward_threshold=1e9, verbose=0)
    eval_cb = EvalCallback(
        eval_env,
        best_model_save_path=str(out_dir),
        log_path=str(out_dir),
        eval_freq=10_000,
        n_eval_episodes=1,
        deterministic=True,
        callback_after_eval=stop_cb,
        verbose=1
    )

    model.learn(total_timesteps=args.timesteps, callback=eval_cb)

    # Save final model
    model_path = out_dir / "ppo_policy.zip"
    model.save(str(model_path))
    print(f">> Saved model to {model_path}")

    # Final quick eval
    from stockbot.rl.utils import episode_rollout
    start_cash = cfg.episode.start_cash if isinstance(cfg.episode, EpisodeConfig) else 100_000.0
    ev = eval_env_fn()  # non-vec for rollout
    curve = episode_rollout(ev, model, deterministic=True, seed=args.seed)
    tr = total_return(curve, start_cash)
    mdd = max_drawdown(curve)
    shp = daily_sharpe(curve, start_cash)
    print(f"== Eval ({split.eval[0]}->{split.eval[1]}) ==")
    print(f"Total Return: {tr:+.3f}  |  MaxDD: {mdd:.3f}  |  Sharpe(daily-ish): {shp:.3f}")

if __name__ == "__main__":
    main()
