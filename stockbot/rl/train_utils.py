from __future__ import annotations

from datetime import datetime, timedelta
from typing import Callable

from stable_baselines3.common.vec_env import DummyVecEnv

from stockbot.env.config import EnvConfig
from .utils import Split


def to_dt(s: str) -> datetime:
    return datetime.fromisoformat(str(s))


def infer_split_from_cfg(cfg: EnvConfig) -> Split:
    """Train/eval split inference (calendar-year or 80/20)."""
    start = to_dt(cfg.start)
    end = to_dt(cfg.end)

    span_days = (end - start).days
    if span_days < 365:
        split_point = start + timedelta(days=int(span_days * 0.8))
        train = (start.strftime("%Y-%m-%d"), split_point.strftime("%Y-%m-%d"))
        eval_ = (
            (split_point + timedelta(days=1)).strftime("%Y-%m-%d"),
            end.strftime("%Y-%m-%d"),
        )
        return Split(train=train, eval=eval_)

    last_year = end.year
    eval_start = datetime(last_year, 1, 1)
    eval_end = end
    train_end = eval_start - timedelta(days=1)

    if start.year >= last_year:
        split_point = start + timedelta(days=int(span_days * 0.8))
        train = (start.strftime("%Y-%m-%d"), split_point.strftime("%Y-%m-%d"))
        eval_ = (
            (split_point + timedelta(days=1)).strftime("%Y-%m-%d"),
            end.strftime("%Y-%m-%d"),
        )
        return Split(train=train, eval=eval_)

    train = (start.strftime("%Y-%m-%d"), train_end.strftime("%Y-%m-%d"))
    eval_ = (eval_start.strftime("%Y-%m-%d"), eval_end.strftime("%Y-%m-%d"))
    return Split(train=train, eval=eval_)


def make_vec_env(factory: Callable):
    """SB3 expects a VecEnv; wrap the factory in a DummyVecEnv."""
    return DummyVecEnv([factory])
