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
from dataclasses import replace
from datetime import datetime, timedelta
from pathlib import Path
from typing import Tuple

import torch as th
from torch.utils.tensorboard import SummaryWriter

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import (
    EvalCallback,
    StopTrainingOnRewardThreshold,
    CallbackList,
    BaseCallback,
)
from stable_baselines3.common.vec_env import DummyVecEnv
from stable_baselines3.common.logger import configure

from stockbot.env.config import EnvConfig, EpisodeConfig
from stockbot.rl.utils import make_env, Split, episode_rollout
from stockbot.rl.metrics import total_return, max_drawdown, daily_sharpe


# ---------------------------
# Utilities
# ---------------------------

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


# ---------------------------
# Diagnostics: gradients, actions (TensorBoard)
# ---------------------------

class RLDiagCallback(BaseCallback):
    """
    Logs training diagnostics to TensorBoard:
      - action histogram (from rollout buffer)
      - gradient global-norm (hooked via optimizer wrapper)
    """
    def __init__(self, log_dir: str, every_n_updates: int = 1, verbose: int = 0):
        super().__init__(verbose)
        self.every = every_n_updates
        self.writer = SummaryWriter(log_dir)

    def _on_step(self) -> bool:
        # Required abstract method; no per-step logging needed here.
        return True

    def _on_rollout_end(self) -> None:
        # Action histogram (per rollout)
        buf = getattr(self.model, "rollout_buffer", None)
        if buf is not None and getattr(buf, "actions", None) is not None:
            try:
                acts = buf.actions.reshape(-1).detach().cpu().numpy()
                self.writer.add_histogram("actions/hist", acts, global_step=self.num_timesteps)
            except Exception:
                pass

    def log_grad_norm(self):
        total_sq = 0.0
        for p in self.model.policy.parameters():
            if p.grad is not None:
                g = p.grad.data
                total_sq += float(th.norm(g, p=2) ** 2)
        self.writer.add_scalar("grads/global_norm", (total_sq ** 0.5), self.num_timesteps)

    def _on_training_end(self) -> None:
        self.writer.flush()
        self.writer.close()


def wrap_optimizer_for_grad_logging(model: PPO, cb: RLDiagCallback) -> None:
    """Wrap the optimizer.step() to emit gradient norm after each update."""
    opt = model.policy.optimizer
    orig_step = opt.step

    def step_with_log(*args, **kwargs):
        result = orig_step(*args, **kwargs)
        try:
            cb.log_grad_norm()
        finally:
            return result

    opt.step = step_with_log  # type: ignore[assignment]


# ---------------------------
# CLI / Training
# ---------------------------

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

    # Model/Env knobs
    ap.add_argument("--normalize",   action="store_true", help="Enable observation normalization")
    ap.add_argument("--policy",      type=str, default="mlp", choices=["mlp", "window_cnn", "window_lstm"])

    # PPO HPs
    ap.add_argument("--n-steps",       type=int, default=1024)
    ap.add_argument("--batch-size",    type=int, default=0, help="0 -> auto (n_steps//4)")
    ap.add_argument("--learning-rate", type=float, default=3e-4)
    ap.add_argument("--gamma",         type=float, default=0.99)
    ap.add_argument("--gae-lambda",    type=float, default=0.95)
    ap.add_argument("--clip-range",    type=float, default=0.2)
    ap.add_argument("--entropy-coef",  type=float, default=0.0)
    ap.add_argument("--vf-coef",       type=float, default=0.5)
    ap.add_argument("--max-grad-norm", type=float, default=0.5)
    ap.add_argument("--dropout",       type=float, default=0.10, help="Dropout for extractors where applicable")

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

    # Outputs under stockbot/runs/<out>
    base_dir = Path(__file__).resolve().parent.parent / "runs"
    out_dir = base_dir / args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    # Build Vec envs with optional normalization
    def train_env_fn(): return make_env(cfg, split, mode="train", normalize=args.normalize)
    def eval_env_fn():  return make_env(cfg, split, mode="eval",  normalize=args.normalize)
    train_env = _make_vec(train_env_fn)
    eval_env  = _make_vec(eval_env_fn)

    # Logger (stdout + csv + tensorboard)
    new_logger = configure(str(out_dir), ["stdout", "csv", "tensorboard"])

    # Policy config
    policy_kwargs = {}
    if args.policy == "window_cnn":
        from stockbot.rl.policy import WindowCNNExtractor
        policy_kwargs = dict(
            features_extractor_class=WindowCNNExtractor,
            features_extractor_kwargs={"out_dim": 256, "dropout": args.dropout},
            net_arch=dict(pi=[128, 64], vf=[128, 64]),  # SB3 >=1.8 dict form
        )
        policy_id = "MultiInputPolicy"
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
            net_arch=dict(pi=[128, 64], vf=[128, 64]),  # SB3 >=1.8 dict form
        )
        policy_id = "MultiInputPolicy"
    else:
        # "mlp" – for Dict obs, MultiInputPolicy with FlattenExtractor is used.
        policy_id = "MultiInputPolicy"

    # Batch-size sanity (SB3 requires batch_size <= n_steps * n_envs)
    n_envs = 1
    batch_size = args.batch_size if args.batch_size > 0 else max(64, args.n_steps // 4)
    batch_size = min(batch_size, max(64, args.n_steps * n_envs))

    # PPO model
    model = PPO(
        policy_id, train_env,
        n_steps=args.n_steps, batch_size=batch_size,
        gae_lambda=args.gae_lambda, gamma=args.gamma,
        learning_rate=args.learning_rate,
        ent_coef=args.entropy_coef, vf_coef=args.vf_coef,
        clip_range=args.clip_range, max_grad_norm=args.max_grad_norm,
        verbose=1, seed=args.seed, policy_kwargs=policy_kwargs,
    )
    model.set_logger(new_logger)

    # Diagnostics (TensorBoard)
    diag_cb = RLDiagCallback(log_dir=str(out_dir / "tb"), every_n_updates=1)
    wrap_optimizer_for_grad_logging(model, diag_cb)

    # Evaluation callback
    stop_cb = StopTrainingOnRewardThreshold(reward_threshold=1e9, verbose=0)
    eval_cb = EvalCallback(
        eval_env,
        best_model_save_path=str(out_dir),
        log_path=str(out_dir),
        eval_freq=10_000,
        n_eval_episodes=1,
        deterministic=True,
        callback_after_eval=stop_cb,
        verbose=1,
    )

    cbs = CallbackList([eval_cb, diag_cb])

    # Learn
    model.learn(total_timesteps=args.timesteps, callback=cbs)

    # Save final model
    model_path = out_dir / "ppo_policy.zip"
    model.save(str(model_path))
    print(f">> Saved model to {model_path}")

    # Final quick eval (deterministic)
    start_cash = cfg.episode.start_cash if isinstance(cfg.episode, EpisodeConfig) else 100_000.0
    ev = eval_env_fn()  # build non-vec for rollout
    curve = episode_rollout(ev, model, deterministic=True, seed=args.seed)
    tr = total_return(curve, start_cash)
    mdd = max_drawdown(curve)
    shp = daily_sharpe(curve, start_cash)
    print(f"== Eval ({split.eval[0]}->{split.eval[1]}) ==")
    print(f"Total Return: {tr:+.3f}  |  MaxDD: {mdd:.3f}  |  Sharpe(daily-ish): {shp:.3f}")


if __name__ == "__main__":
    main()
