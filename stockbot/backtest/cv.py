from dataclasses import dataclass
from typing import Dict, List

import json
import numpy as np
import pandas as pd

from stockbot.pipeline import prepare_from_payload
from stockbot.backtest.fills import plan_fills
from stockbot.backtest.execution_costs import CostParams, apply_costs


@dataclass
class CVConfig:
    n_folds: int
    embargo_bars: int
    fast_timesteps: int | None = None


def run_purged_wf_cv(payload: Dict, cv: CVConfig, report_path: str | None = None) -> Dict:
    """Run a simplified purged walk-forward cross validation.

    This version wires the P2/P3 components into a lightweight CV driver so
    tests exercise the data layer and cost model.  It still returns a
    pre-structured report without performing expensive training.
    """
    # Prepare data and features (P2 integration)
    X, meta = prepare_from_payload(payload)
    n_assets = len(meta["symbols"])

    # Dummy order to exercise cost model (P3 integration)
    w_prev = np.zeros(n_assets)
    w_new = np.zeros(n_assets)
    if n_assets:
        w_new[0] = 0.1
    prices = np.ones(n_assets)
    adv = np.ones(n_assets) * 1000.0
    exec_cfg = payload.get("execution_model", {})
    orders = plan_fills(
        w_prev,
        w_new,
        nav=1.0,
        prices_next=prices,
        adv_next=adv,
        policy=exec_cfg.get("fill_policy", "next_open"),
        max_participation=exec_cfg.get("max_participation", 0.1),
    )
    cost_cfg = payload.get("costs", {})
    cp = CostParams(
        commission_per_share=cost_cfg.get("commission_per_share", 0.0),
        taker_fee_bps=cost_cfg.get("taker_fee_bps", 0.0),
        maker_rebate_bps=cost_cfg.get("maker_rebate_bps", 0.0),
        half_spread_bps=cost_cfg.get("half_spread_bps", 0.0),
        impact_k=cost_cfg.get("impact_k", 0.0),
    )
    cost_bps = 0.0
    for o in orders:
        info = apply_costs(o["planned_price"], o["side"], True, o["qty"], cp, o["participation"])
        cost_bps += info["cost_bps"]

    # Time splits for purged walk-forward (P4 scaffolding)
    start = pd.to_datetime(payload["dataset"]["start_date"])
    end = pd.to_datetime(payload["dataset"]["end_date"])
    dates = pd.date_range(start, end, freq="D")
    segments = np.array_split(np.arange(len(dates)), cv.n_folds + 1)

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
        train = [dates[train_indices[0]].strftime("%Y-%m-%d"), dates[train_end_idx].strftime("%Y-%m-%d")]
        eval_ = [dates[eval_indices[0]].strftime("%Y-%m-%d"), dates[eval_indices[-1]].strftime("%Y-%m-%d")]
        folds.append(
            {
                "train": train,
                "eval": eval_,
                "sharpe_net": 0.0,
                "maxdd": 0.0,
                "turnover": 0.0,
                "cost_bps": cost_bps,
            }
        )

    if folds:
        macro = {
            "sharpe_net": float(np.mean([f["sharpe_net"] for f in folds])),
            "maxdd": float(np.mean([f["maxdd"] for f in folds])),
            "turnover": float(np.mean([f["turnover"] for f in folds])),
            "cost_bps": float(np.mean([f["cost_bps"] for f in folds])),
        }
    else:
        macro = {"sharpe_net": 0.0, "maxdd": 0.0, "turnover": 0.0, "cost_bps": cost_bps}

    report = {"folds": folds, "macro_avg": macro}

    if report_path is not None:
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

    return report
