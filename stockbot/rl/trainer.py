from __future__ import annotations

import argparse
from dataclasses import replace
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CallbackList, EvalCallback, StopTrainingOnRewardThreshold
from stable_baselines3.common.logger import configure
from stable_baselines3.common.vec_env import DummyVecEnv

from stockbot.env.config import EnvConfig, EpisodeConfig
from stockbot.rl.utils import Split, make_env, episode_rollout
from stockbot.rl.metrics import total_return, max_drawdown, sharpe, sortino, calmar, turnover
from stockbot.rl.callbacks import RLDiagCallback, wrap_optimizer_for_grad_logging


def _to_dt(s: str) -> datetime:
    return datetime.fromisoformat(str(s))


def infer_split(cfg: EnvConfig) -> Split:
    """Infer train/eval split from EnvConfig (calendar-year or 80/20)."""
    start = _to_dt(cfg.start)
    end = _to_dt(cfg.end)
    span_days = (end - start).days
    if span_days < 365:
        split_point = start + timedelta(days=int(span_days * 0.8))
        train = (start.strftime("%Y-%m-%d"), split_point.strftime("%Y-%m-%d"))
        eval_ = ((split_point + timedelta(days=1)).strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
        return Split(train=train, eval=eval_)
    last_year = end.year
    eval_start = datetime(last_year, 1, 1)
    eval_end = end
    train_end = eval_start - timedelta(days=1)
    if start.year >= last_year:
        split_point = start + timedelta(days=int(span_days * 0.8))
        train = (start.strftime("%Y-%m-%d"), split_point.strftime("%Y-%m-%d"))
        eval_ = ((split_point + timedelta(days=1)).strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
        return Split(train=train, eval=eval_)
    train = (start.strftime("%Y-%m-%d"), train_end.strftime("%Y-%m-%d"))
    eval_ = (eval_start.strftime("%Y-%m-%d"), eval_end.strftime("%Y-%m-%d"))
    return Split(train=train, eval=eval_)


def _make_vec(factory):
    return DummyVecEnv([factory])


class Trainer:
    """PPO training orchestrator reusable from CLI or API."""

    def __init__(self, cfg: EnvConfig, split: Split, args: argparse.Namespace):
        self.cfg = cfg
        self.split = split
        self.args = args

    def run(self) -> Path:
        args = self.args
        cfg = self.cfg

        out_dir = Path(args.out)
        out_dir.mkdir(parents=True, exist_ok=True)

        def train_env_fn():
            return make_env(cfg, self.split, mode="train", normalize=args.normalize)

        def eval_env_fn():
            return make_env(cfg, self.split, mode="eval", normalize=args.normalize)

        train_env = _make_vec(train_env_fn)
        eval_env = _make_vec(eval_env_fn)

        new_logger = configure(str(out_dir), ["stdout", "csv", "tensorboard"])

        policy_kwargs = {}
        if args.policy == "window_cnn":
            from stockbot.rl.policy import WindowCNNExtractor
            policy_kwargs = dict(
                features_extractor_class=WindowCNNExtractor,
                features_extractor_kwargs={"out_dim": 256, "dropout": args.dropout},
                net_arch=dict(pi=[128, 64], vf=[128, 64]),
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
                net_arch=dict(pi=[128, 64], vf=[128, 64]),
            )
            policy_id = "MultiInputPolicy"
        else:
            policy_id = "MultiInputPolicy"

        n_envs = 1
        batch_size = args.batch_size if args.batch_size > 0 else max(64, args.n_steps // 4)
        batch_size = min(batch_size, max(64, args.n_steps * n_envs))

        model = PPO(
            policy_id,
            train_env,
            n_steps=args.n_steps,
            batch_size=batch_size,
            gae_lambda=args.gae_lambda,
            gamma=args.gamma,
            learning_rate=args.learning_rate,
            ent_coef=args.entropy_coef,
            vf_coef=args.vf_coef,
            clip_range=args.clip_range,
            max_grad_norm=args.max_grad_norm,
            verbose=1,
            seed=args.seed,
            policy_kwargs=policy_kwargs,
        )
        model.set_logger(new_logger)

        diag_cb = RLDiagCallback(log_dir=str(out_dir / "tb"), every_n_updates=1)
        wrap_optimizer_for_grad_logging(model, diag_cb)

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

        model.learn(total_timesteps=args.timesteps, callback=cbs)
        model_path = out_dir / "ppo_policy.zip"
        model.save(str(model_path))

        start_cash = cfg.episode.start_cash if isinstance(cfg.episode, EpisodeConfig) else 100_000.0
        ev = eval_env_fn()
        curve, to = episode_rollout(ev, model, deterministic=True, seed=args.seed)
        tr = total_return(curve, start_cash)
        mdd = max_drawdown(curve)
        shp = sharpe(curve, start_cash)
        sor = sortino(curve, start_cash)
        cal = calmar(curve, start_cash)
        to_metric = turnover(to)
        print(
            "Total Return: {:+.3f}  |  MaxDD: {:.3f}  |  Sharpe: {:.3f}  |  Sortino: {:.3f}  |  Calmar: {:.3f}  |  Turnover: {:.3f}".format(
                tr, mdd, shp, sor, cal, to_metric
            )
        )
        return out_dir


__all__ = ["Trainer", "infer_split"]
