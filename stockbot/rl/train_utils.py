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

    # Ensure the eval window has enough calendar days to fetch bars; if not,
    # back off to a rolling tail window ending at `end`.
    try:
        # Heuristic: require enough calendar days to cover lookback plus
        # indicator warmup and multi-asset alignment losses.
        L = int(getattr(cfg.episode, "lookback", 64))
        min_eval_days = max(100, L + 40)
    except Exception:
        min_eval_days = 100
    e0 = to_dt(eval_[0]); e1 = to_dt(eval_[1])
    if (e1 - e0).days < min_eval_days:
        new_start = end - timedelta(days=min_eval_days)
        if new_start < start:
            new_start = start
        eval_ = (new_start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
        # tighten train end to day before eval start when possible
        tr_end = to_dt(eval_[0]) - timedelta(days=1)
        if tr_end > start:
            train = (start.strftime("%Y-%m-%d"), tr_end.strftime("%Y-%m-%d"))

    return Split(train=train, eval=eval_)


def make_vec_env(factory: Callable):
    """SB3 expects a VecEnv; wrap the factory in a DummyVecEnv."""
    return DummyVecEnv([factory])
