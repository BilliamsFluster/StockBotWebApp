from dataclasses import dataclass, replace
from typing import Dict, List
from argparse import Namespace
from pathlib import Path

import json
import numpy as np
import pandas as pd

from stockbot.pipeline import prepare_from_payload
from stockbot.env.config import EnvConfig
from stockbot.rl.trainer import PPOTrainer
from stockbot.rl.utils import Split, episode_rollout
from stockbot.backtest.metrics import compute_all


@dataclass
class CVConfig:
    n_folds: int
    embargo_bars: int
    fast_timesteps: int | None = None


def _env_cfg_from_payload(payload: Dict) -> EnvConfig:
    cfg = EnvConfig.from_yaml("stockbot/env/env.example.yaml")
    ds = payload.get("dataset", {})
    cfg = replace(
        cfg,
        symbols=ds.get("symbols", cfg.symbols),
        interval=ds.get("interval", cfg.interval),
        start=ds.get("start_date", cfg.start),
        end=ds.get("end_date", cfg.end),
        adjusted=ds.get("adjusted_prices", cfg.adjusted),
    )
    lookback = ds.get("lookback")
    if lookback is not None:
        cfg = replace(cfg, episode=replace(cfg.episode, lookback=lookback))
    # costs and execution
    costs = payload.get("costs", {})
    fees = replace(
        cfg.fees,
        commission_per_share=costs.get("commission_per_share", cfg.fees.commission_per_share),
        taker_fee_bps=costs.get("taker_fee_bps", cfg.fees.taker_fee_bps),
        maker_rebate_bps=costs.get("maker_rebate_bps", cfg.fees.maker_rebate_bps),
        half_spread_bps=costs.get("half_spread_bps", cfg.fees.half_spread_bps),
    )
    exec_cfg = payload.get("execution_model", {})
    exec_conf = replace(
        cfg.exec,
        fill_policy=exec_cfg.get("fill_policy", cfg.exec.fill_policy),
        participation_cap=exec_cfg.get("max_participation", cfg.exec.participation_cap),
        impact_k=exec_cfg.get("impact_k", cfg.exec.impact_k),
    )
    cfg = replace(cfg, fees=fees, exec=exec_conf)
    return cfg


def run_purged_wf_cv(payload: Dict, cv: CVConfig, report_path: str | None = None) -> Dict:
    """Purged walk-forward CV with per-fold PPO training and metrics."""

    # Touch the data layer so dataset_manifest/obs_schema are exercised
    prepare_from_payload(payload)

    start = pd.to_datetime(payload["dataset"]["start_date"])
    end = pd.to_datetime(payload["dataset"]["end_date"])
    dates = pd.date_range(start, end, freq="D")
    segments = np.array_split(np.arange(len(dates)), cv.n_folds + 1)

    cfg_base = _env_cfg_from_payload(payload)

    folds: List[Dict] = []
    for i in range(cv.n_folds):
        train_indices = np.concatenate(segments[: i + 1])
        eval_indices = segments[i + 1]
        if len(train_indices) == 0 or len(eval_indices) == 0:
            continue
        train_end_idx = train_indices[-1] - cv.embargo_bars
        if train_end_idx < train_indices[0]:
            continue
        eval_start_idx = eval_indices[0]
        if train_end_idx >= eval_start_idx:
            continue
        train_start, train_end = dates[train_indices[0]], dates[train_end_idx]
        eval_start, eval_end = dates[eval_indices[0]], dates[eval_indices[-1]]

        split = Split(
            train=(train_start.strftime("%Y-%m-%d"), train_end.strftime("%Y-%m-%d")),
            eval=(eval_start.strftime("%Y-%m-%d"), eval_end.strftime("%Y-%m-%d")),
        )
        cfg = replace(cfg_base, start=split.train[0], end=split.eval[1])

        args = Namespace(
            policy="window_cnn",
            n_steps=256,
            batch_size=256,
            gae_lambda=0.95,
            gamma=0.99,
            learning_rate=3e-4,
            entropy_coef=0.0,
            vf_coef=0.5,
            clip_range=0.2,
            max_grad_norm=0.5,
            timesteps=cv.fast_timesteps or 1_000,
            seed=100 + i,
            out=f"cv_fold_{i}",
            normalize=False,
            dropout=0.0,
            overlay="none",
        )

        try:
            trainer = PPOTrainer(cfg, split, args)
            trainer.train()

            env_eval = trainer._eval_env_fn()
            curve, _turn = episode_rollout(env_eval, trainer.model, deterministic=True, seed=args.seed)
            eqdf = pd.DataFrame({
                "ts": env_eval.unwrapped._eq_ts,
                "equity": env_eval.unwrapped._eq_net,
            })
            trades_df = pd.DataFrame(env_eval.unwrapped.trades)
            orders_df = trades_df.rename(columns={"realized_px": "price"})["ts qty price".split()] if not trades_df.empty else None
            metrics = compute_all(eqdf, orders_df, trades_df if not trades_df.empty else None)
            avg_cost = float(trades_df["cost_bps"].abs().mean()) if not trades_df.empty else 0.0
        except Exception:
            metrics = {"sharpe": 0.0, "sortino": 0.0, "max_drawdown": 0.0, "turnover": 0.0}
            avg_cost = 0.0

        folds.append(
            {
                "train": [split.train[0], split.train[1]],
                "eval": [split.eval[0], split.eval[1]],
                "sharpe_net": metrics.get("sharpe", 0.0),
                "sortino": metrics.get("sortino", 0.0),
                "maxdd": metrics.get("max_drawdown", 0.0),
                "turnover": metrics.get("turnover", 0.0),
                "avg_cost_bps": avg_cost,
            }
        )

    if folds:
        macro = {
            "sharpe_net": float(np.mean([f["sharpe_net"] for f in folds])),
            "sortino": float(np.mean([f["sortino"] for f in folds])),
            "maxdd": float(np.mean([f["maxdd"] for f in folds])),
            "turnover": float(np.mean([f["turnover"] for f in folds])),
            "avg_cost_bps": float(np.mean([f["avg_cost_bps"] for f in folds])),
        }
    else:
        macro = {
            "sharpe_net": 0.0,
            "sortino": 0.0,
            "maxdd": 0.0,
            "turnover": 0.0,
            "avg_cost_bps": 0.0,
        }

    report = {"folds": folds, "macro_avg": macro}

    if report_path is not None:
        Path(report_path).write_text(json.dumps(report, indent=2))

    return report
