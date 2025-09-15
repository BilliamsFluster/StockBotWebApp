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

