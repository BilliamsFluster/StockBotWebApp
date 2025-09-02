from __future__ import annotations
from dataclasses import replace
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import EvalCallback, CallbackList
from stable_baselines3.common.vec_env import DummyVecEnv
from stable_baselines3.common.logger import configure

from stockbot.env.config import EnvConfig
from .utils import make_env, Split, episode_rollout
from .metrics import total_return, max_drawdown, sharpe, sortino, calmar, turnover
from .callbacks import RLDiagCallback, wrap_optimizer_for_grad_logging


class Trainer:
    def __init__(self, cfg: EnvConfig, policy: str = "mlp", normalize: bool = True, seed: int = 42):
        self.cfg = cfg
        self.policy = policy
        self.normalize = normalize
        self.seed = seed

    # ----- helpers -----
    def _to_dt(self, s: str) -> datetime:
        return datetime.fromisoformat(str(s))

    def _infer_split(self) -> Split:
        start = self._to_dt(self.cfg.start)
        end = self._to_dt(self.cfg.end)
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

    def _make_vec(self, factory):
        return DummyVecEnv([factory])

    # ----- main API -----
    def run(self, timesteps: int, out_dir: Path, **ppo_kwargs) -> Dict[str, Any]:
        split = self._infer_split()
        train_cfg = replace(self.cfg, start=split.train[0], end=split.train[1])
        eval_cfg = replace(self.cfg, start=split.eval[0], end=split.eval[1])

        train_env = self._make_vec(lambda: make_env(train_cfg, normalize=self.normalize, seed=self.seed))
        eval_env = self._make_vec(lambda: make_env(eval_cfg, normalize=self.normalize, seed=self.seed))

        model = PPO(self.policy, train_env, seed=self.seed, **ppo_kwargs)
        diag_cb = RLDiagCallback(str(out_dir / "tb"))
        eval_cb = EvalCallback(eval_env, eval_freq=int(ppo_kwargs.get("eval_freq", 10000)), deterministic=True, verbose=0)
        callbacks = CallbackList([eval_cb, diag_cb])
        wrap_optimizer_for_grad_logging(model, diag_cb)

        logger = configure(str(out_dir), ["stdout", "tensorboard"])
        model.set_logger(logger)
        model.learn(total_timesteps=timesteps, callback=callbacks)
        model.save(str(out_dir / "ppo_policy"))

        # Simple evaluation for metrics
        eq, to = episode_rollout(eval_env.envs[0], model.policy, deterministic=True, seed=self.seed)
        metrics = {
            "total_return": float(total_return(eq)),
            "max_drawdown": float(max_drawdown(eq)),
            "sharpe": float(sharpe(eq)),
            "sortino": float(sortino(eq)),
            "calmar": float(calmar(eq)),
            "turnover": float(turnover(to)),
        }

        report_dir = out_dir / "report"
        report_dir.mkdir(parents=True, exist_ok=True)
        import json
        import numpy as np
        import pandas as pd
        pd.DataFrame({"equity": eq}).to_csv(report_dir / "equity.csv", index=False)
        pd.DataFrame({"turnover": to}).to_csv(report_dir / "turnover.csv", index=False)
        with (report_dir / "metrics.json").open("w") as f:
            json.dump(metrics, f, indent=2)
        return metrics
