from __future__ import annotations
from typing import List, Optional, Literal, Dict
from pydantic import BaseModel, Field

RunType = Literal["train", "backtest"]
RunStatus = Literal["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]


class FeesModel(BaseModel):
    commission_per_share: float = 0.0
    commission_pct_notional: float = 0.0005
    slippage_bps: float = 1.0
    borrow_fee_apr: float = 0.0


class MarginModel(BaseModel):
    max_gross_leverage: float = 1.0
    maintenance_margin: float = 0.25
    cash_borrow_apr: float = 0.05
    intraday_only: bool = False


class ExecModel(BaseModel):
    order_type: Literal["market", "limit"] = "market"
    limit_offset_bps: float = 0.0
    participation_cap: float = 0.1
    impact_k: float = 0.0
    spread_source: Literal["fee_model", "hl"] = "fee_model"
    vol_lookback: int = 20


class EpisodeModel(BaseModel):
    lookback: int = 64
    max_steps: Optional[int] = 256
    start_cash: float = 100_000.0
    allow_short: bool = True
    rebalance_eps: float = 0.0
    randomize_start: bool = False
    horizon: Optional[int] = None
    max_step_change: float = 0.10
    invest_max: float = 1.00
    mapping_mode: Literal["simplex_cash", "tanh_leverage"] = "simplex_cash"


class FeatureModel(BaseModel):
    use_custom_pipeline: bool = True
    window: int = 64
    indicators: List[str] = Field(default_factory=lambda: ["logret", "rsi14"])


class RewardModel(BaseModel):
    mode: Literal["delta_nav", "log_nav"] = "delta_nav"
    w_drawdown: float = 0.0
    w_turnover: float = 0.0
    w_vol: float = 0.0
    vol_window: int = 10
    w_leverage: float = 0.0
    stop_eq_frac: float = 0.0
    sharpe_window: Optional[int] = None
    sharpe_scale: Optional[float] = None


class TrainRequest(BaseModel):
    config_path: str = "stockbot/env/env.example.yaml"
    normalize: bool = True
    policy: Literal["mlp", "window_cnn", "window_lstm"] = "window_cnn"
    timesteps: int = 150_000
    seed: int = 42
    out_tag: Optional[str] = None
    out_dir: Optional[str] = None
    run_id: Optional[str] = None

    train_start: Optional[str] = None
    train_end: Optional[str] = None
    eval_start: Optional[str] = None
    eval_end: Optional[str] = None
    symbols: Optional[List[str]] = None
    start: Optional[str] = None
    end: Optional[str] = None
    interval: Optional[str] = None
    adjusted: Optional[bool] = None
    fees: Optional[FeesModel] = None
    margin: Optional[MarginModel] = None
    exec: Optional[ExecModel] = None
    episode: Optional[EpisodeModel] = None
    features: Optional[FeatureModel] = None
    reward: Optional[RewardModel] = None
    n_steps: Optional[int] = None
    batch_size: Optional[int] = None
    learning_rate: Optional[float] = None
    gamma: Optional[float] = None
    gae_lambda: Optional[float] = None
    clip_range: Optional[float] = None
    entropy_coef: Optional[float] = None
    vf_coef: Optional[float] = None
    max_grad_norm: Optional[float] = None
    dropout: Optional[float] = None


class BacktestRequest(BaseModel):
    config_path: str = "stockbot/env/env.example.yaml"
    policy: str = "equal"
    symbols: List[str] | None = None
    start: Optional[str] = None
    end: Optional[str] = None
    out_tag: Optional[str] = None
    out_dir: Optional[str] = None
    run_id: Optional[str] = None
    normalize: bool = True


class RunRecord(BaseModel):
    id: str
    type: RunType
    status: RunStatus
    out_dir: str
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    meta: Optional[dict] = None
    error: Optional[str] = None
    pid: Optional[int] = None
