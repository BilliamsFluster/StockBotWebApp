import pytest

from stockbot.env.config import EnvConfig, EpisodeConfig
from stockbot.rl.train_utils import infer_split_from_cfg

def test_custom_eval_window_overrides_default():
    cfg = EnvConfig(
        symbols=["AAPL"],
        interval="1d",
        start="2024-01-01",
        end="2024-02-10",
        eval_window_days=10,
        episode=EpisodeConfig(lookback=5),
    )
    split = infer_split_from_cfg(cfg)
    assert split.eval == ("2024-02-01", "2024-02-10")
    assert split.train == ("2024-01-01", "2024-01-31")


def test_custom_ranges_take_precedence():
    cfg = EnvConfig(
        symbols=["AAPL"],
        interval="1d",
        start="2024-01-01",
        end="2024-12-31",
        eval_window_days=10,
        custom_ranges=[
            {"train": ["2024-01-01", "2024-06-30"], "eval": ["2024-07-01", "2024-12-31"]}
        ],
        episode=EpisodeConfig(lookback=5),
    )
    split = infer_split_from_cfg(cfg)
    assert split.train == ("2024-01-01", "2024-06-30")
    assert split.eval == ("2024-07-01", "2024-12-31")

