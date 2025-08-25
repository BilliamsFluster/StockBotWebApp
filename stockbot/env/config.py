# stockbot/env/config.py
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Literal, Sequence, Optional, Dict, Any
from pathlib import Path
import yaml


# -----------------------------
# Dataclasses (schema)
# -----------------------------

@dataclass(frozen=True)
class FeeModel:
    commission_per_share: float = 0.0
    commission_pct_notional: float = 0.0005
    borrow_fee_apr: float = 0.0
    slippage_bps: float = 1.0


@dataclass(frozen=True)
class MarginConfig:
    max_gross_leverage: float = 1.0
    maintenance_margin: float = 0.25
    cash_borrow_apr: float = 0.05
    intraday_only: bool = False


@dataclass(frozen=True)
class ExecConfig:
    order_type: Literal["market", "limit"] = "market"
    limit_offset_bps: float = 0.0
    participation_cap: float = 0.1
    impact_k: float = 0.0


@dataclass(frozen=True)
class RewardConfig:
    mode: Literal["delta_nav", "log_nav"] = "delta_nav"
    w_drawdown: float = 0.0
    w_turnover: float = 0.0
    w_vol: float = 0.0
    w_leverage: float = 0.0
    vol_window: int = 10
    stop_eq_frac: float = 0.0
    sharpe_window: int = 0
    sharpe_scale: float = 0.0


@dataclass(frozen=True)
class EpisodeConfig:
    # Core
    lookback: int = 64
    max_steps: Optional[int] = 256
    start_cash: float = 100_000.0
    allow_short: bool = True
    action_space: Literal["weights", "orders", "discrete"] = "weights"
    rebalance_eps: float = 0.0            # gate micro-rebalances; fraction-of-equity threshold
    randomize_start: bool = False
    horizon: Optional[int] = None

    # NEW: mapping/turnover knobs used by PortfolioTradingEnv
    mapping_mode: Literal["simplex_cash", "tanh_leverage"] = "simplex_cash"
    invest_max: float = 1.00              # max fraction of equity to deploy (remainder stays cash)
    max_step_change: float = 0.10         # cap per-step change in target weights/position


@dataclass(frozen=True)
class FeatureConfig:
    use_custom_pipeline: bool = True
    indicators: Sequence[str] = ("logret", "rsi14")
    window: int = 64


@dataclass(frozen=True)
class EnvConfig:
    symbols: Sequence[str] = ("AAPL", "MSFT")
    interval: str = "1d"
    start: str = "2018-01-01"
    end: str = "2022-12-31"
    adjusted: bool = True

    fees: FeeModel = FeeModel()
    margin: MarginConfig = MarginConfig()
    exec: ExecConfig = ExecConfig()
    reward: RewardConfig = RewardConfig()
    episode: EpisodeConfig = EpisodeConfig()
    features: FeatureConfig = FeatureConfig()

    # -----------------------------
    # YAML helpers
    # -----------------------------

    @staticmethod
    def _filter_kwargs(cls, data: Any) -> Dict[str, Any]:
        """
        Keep only keys that exist on the dataclass `cls`.
        This makes parsing forgiving to unknown/extra YAML keys.
        """
        if not isinstance(data, dict):
            return {}
        valid = cls.__dataclass_fields__.keys()  # type: ignore[attr-defined]
        return {k: v for k, v in data.items() if k in valid}

    @classmethod
    def from_yaml(cls, path: str | Path) -> "EnvConfig":
        d = yaml.safe_load(Path(path).read_text()) or {}

        def mk(subcls, key):
            subraw = d.get(key, {})
            return subcls(**cls._filter_kwargs(subcls, subraw))

        return EnvConfig(
            symbols=d.get("symbols", ["AAPL", "MSFT"]),
            interval=d.get("interval", "1d"),
            start=d.get("start", "2018-01-01"),
            end=d.get("end", "2022-12-31"),
            adjusted=bool(d.get("adjusted", True)),

            fees=mk(FeeModel, "fees"),
            margin=mk(MarginConfig, "margin"),
            exec=mk(ExecConfig, "exec"),
            reward=mk(RewardConfig, "reward"),
            episode=mk(EpisodeConfig, "episode"),
            features=mk(FeatureConfig, "features"),
        )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
