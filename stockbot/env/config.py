from dataclasses import dataclass, asdict
from typing import Literal, Sequence, Optional
import yaml
from pathlib import Path

@dataclass(frozen=True)
class FeeModel:
    commission_per_share: float = 0.0
    commission_pct_notional: float = 0.0005
    borrow_fee_apr: float = 0.0
    slippage_bps: float = 1.0

@dataclass(frozen=True)
class EpisodeConfig:
    lookback: int = 64
    max_steps: Optional[int] = None
    start_cash: float = 100_000.0
    allow_short: bool = True
    action_space: Literal["discrete", "continuous"] = "discrete"

@dataclass(frozen=True)
class FeatureConfig:
    # if you have stockbot/ingestion/feature_engineering.py, we’ll call its build_features()
    # otherwise we’ll compute basic features: OHLCV + logret + RSI(14)
    use_custom_pipeline: bool = True
    indicators: Sequence[str] = ("logret", "rsi14", "macd", "bbands")

@dataclass(frozen=True)
class EnvConfig:
    symbol: str = "AAPL"
    interval: str = "1d"  # human string; mapped in data_adapter
    start: str = "2018-01-01"
    end: str = "2022-12-31"
    adjusted: bool = True
    fees: FeeModel = FeeModel()
    episode: EpisodeConfig = EpisodeConfig()
    features: FeatureConfig = FeatureConfig()

    @staticmethod
    def from_yaml(path: str | Path) -> "EnvConfig":
        data = yaml.safe_load(Path(path).read_text())
        def _mk(cls, d): return cls(**d) if isinstance(d, dict) else cls()
        fees = _mk(FeeModel, data.get("fees", {}))
        episode = _mk(EpisodeConfig, data.get("episode", {}))
        features = _mk(FeatureConfig, data.get("features", {}))
        return EnvConfig(
            symbol=data.get("symbol", "AAPL"),
            interval=data.get("interval", "1d"),
            start=data.get("start", "2018-01-01"),
            end=data.get("end", "2022-12-31"),
            adjusted=bool(data.get("adjusted", True)),
            fees=fees, episode=episode, features=features,
        )

    def to_dict(self):
        d = asdict(self)
        return d
