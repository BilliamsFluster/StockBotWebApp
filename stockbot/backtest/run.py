"""
Deterministic backtest runner (strategy-modular).

Examples (single-line, Windows-friendly):

  # RL policy zip (SB3)
  python -m stockbot.backtest.run --config stockbot/env/env.example.yaml --policy stockbot/runs/ppo_cnn_norm/ppo_policy.zip --start 2022-01-01 --end 2022-12-31 --out ppo_cnn_norm_eval

  # Baseline (built-ins: flat | equal | first_long | random | buy_hold)
  python -m stockbot.backtest.run --config stockbot/env/env.example.yaml --policy equal --start 2022-01-01 --end 2022-12-31 --out equal_eval
"""
from __future__ import annotations
import argparse
import json
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import numpy as np
import pandas as pd

from stockbot.env.config import EnvConfig
from gymnasium import spaces
from stable_baselines3.common.save_util import load_from_zip_file
from stockbot.rl.utils import make_env, Split, make_strategy, episode_rollout  # strategy-aware
from stockbot.backtest.metrics import compute_all, save_metrics
from stockbot.backtest.trades import build_trades_fifo
from stockbot.telemetry.writer import TelemetryWriter

BASE_RUNS = Path(__file__).resolve().parents[1] / "runs"  # stockbot/runs


def _policy_kind(s: str) -> str:
    s = str(s).lower()
    if s.endswith(".zip"):
        return "rl"  # SB3 model path
    if s in {"flat", "equal", "first_long", "random", "buy_hold"}:
        return "baseline"
    raise ValueError("Unknown --policy. Use a baseline name (flat|equal|first_long|random|buy_hold) or a PPO .zip path.")


def _as_strategy(policy_arg: str, env):
    """
    Turn --policy into a Strategy instance via the factory:
      - if it's a .zip -> SB3PolicyStrategy
      - else one of the built-in baselines
    """
    kind = _policy_kind(policy_arg)
    if kind == "rl":
        # SB3 model path
        return make_strategy("sb3", env, model_path=policy_arg)
    # Built-in baseline
    return make_strategy(policy_arg, env)


def _run_backtest(env, strategy) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Run a single deterministic episode with a Strategy.
    Returns (equity_df, orders_df). Orders are best-effort (may be empty if env doesn't expose fills).
    """
    rng = np.random.default_rng(42)  # kept for potential future stochastic baselines
    obs, info = env.reset(seed=42)
    done = trunc = False

    ts_list: List[datetime] = []
    eq_list: List[float] = []
    cash_list: List[float] = []
    dd_list: List[float] = []
    gl_list: List[float] = []
    nl_list: List[float] = []
    to_list: List[float] = []
    rbase_list: List[float] = []
    pto_list: List[float] = []
    pdd_list: List[float] = []
    pvol_list: List[float] = []
    plev_list: List[float] = []
    weights_list: List[Dict[str, float]] = []

    # Inform strategy the episode is starting
    if hasattr(strategy, "reset"):
        strategy.reset()

    symbols = getattr(env.unwrapped, "syms", None)

    # Telemetry state
    tw = TelemetryWriter()
    last_cum_ret = 0.0
    roll_window = 60
    roll_vals: list[float] = []
    last_rolling = {
        "sharpe": None,
        "sortino": None,
        "vol_realized": None,
        "hit_rate": None,
    }

    while not (done or trunc):
        action, _a_info = strategy.predict(obs, deterministic=True)
        obs, r, done, trunc, info = env.step(action)

        # timestamp for this step
        ts = (
            env.unwrapped.src.index[env.unwrapped._i - 1]
            if hasattr(env.unwrapped, "_i") and hasattr(env.unwrapped, "src")
            else datetime.utcnow()
        )
        ts_list.append(ts)

        # ledger snapshots
        eq_list.append(float(info.get("equity", np.nan)))
        cash_list.append(float(getattr(getattr(env.unwrapped, "port", None), "cash", np.nan)))
        dd_list.append(float(info.get("drawdown", np.nan)))
        gl_list.append(float(info.get("gross_leverage", np.nan)))
        nl_list.append(float(info.get("net_leverage", np.nan)))
        to_list.append(float(info.get("turnover", np.nan)))
        rbase_list.append(float(info.get("r_base", np.nan)))
        pto_list.append(float(info.get("pen_turnover", np.nan)))
        pdd_list.append(float(info.get("pen_drawdown", np.nan)))
        pvol_list.append(float(info.get("pen_vol", np.nan)))
        plev_list.append(float(info.get("pen_leverage", np.nan)))

        # weights, if provided in info
        if "weights" in info:
            w = info["weights"]
            if symbols is not None and len(w) == len(symbols):
                weights_list.append({symbols[i]: float(w[i]) for i in range(len(symbols))})
            else:
                weights_list.append({f"w{i}": float(w[i]) for i in range(len(w))})
        else:
            weights_list.append({})

        # ---- emit telemetry (best-effort, per-bar) ----
        try:
            # decision/valuation timestamps
            bar_ts = ts  # close time for the step (as chosen above)
            bar_idx = len(eq_list) - 1

            # Build prices in view order
            prices_close = []
            try:
                pc = env.unwrapped._prices(env.unwrapped._i - 1)
                prices_close = [float(pc.get(s, float("nan"))) for s in env.unwrapped.syms]
            except Exception:
                pass

            # Positions snapshot
            pos_qty = []
            pos_mv = []
            try:
                prices_map = env.unwrapped._prices(env.unwrapped._i - 1)
                for s in env.unwrapped.syms:
                    pos = env.unwrapped.port.positions.get(s)
                    q = float(pos.qty) if pos else 0.0
                    mv = q * float(prices_map.get(s, 0.0))
                    pos_qty.append(q)
                    pos_mv.append(float(mv))
            except Exception:
                pass

            # Access internals from env step for sizing path
            weights_raw = None
            weights_regime = None
            weights_kelly_vol = None
            weights_capped = None
            applied_layers: list[str] = []
            flags: list[str] = []
            gross = float(info.get("gross_leverage", 0.0))
            net = float(info.get("net_leverage", 0.0))
            gamma_vec = None
            gamma_state = None
            gamma_scale = 1.0
            try:
                # reconstruct from env state
                # prev_w and target path are not stored directly; approximate using info["weights"] as final target_w
                weights_capped = list(map(float, list(info.get("weights", []))))
                # If we logged sizing trace and events, try to infer layers
                trace = getattr(env.unwrapped, "sizing_trace", None)
                if trace and len(trace) > 0:
                    last_t = trace[-1]
                    gamma_scale = float(last_t.get("gamma", getattr(last_t, "gamma", 1.0))) if isinstance(last_t, dict) else 1.0
                    f_kelly = float(last_t.get("f_kelly", 1.0))
                    vol_scale = float(last_t.get("vol_scale", 1.0))
                    applied_layers.extend(["kelly", "vol_target"]) if (f_kelly != 1.0 or vol_scale != 1.0) else None
                # Env exposes regime beliefs if configured; gamma scalar used is embedded in apply_sizing_layers, but
                # we can still annotate that regime was present when _gamma_seq exists.
                if getattr(env.unwrapped, "_gamma_seq", None) is not None:
                    applied_layers.append("regime")
                    gamma = env.unwrapped._gamma_seq[env.unwrapped._i]  # type: ignore[index]
                    try:
                        import numpy as _np
                        gamma_vec = [float(x) for x in _np.asarray(gamma).reshape(-1)]
                        gamma_state = int(max(range(len(gamma_vec)), key=lambda i: gamma_vec[i])) if gamma_vec else None
                    except Exception:
                        pass
                # For raw/regime/kelly_vol approximations, we lack the pre-cap arrays; set to None when unavailable
            except Exception:
                pass

            # Costs / slippage (best-effort from last trade in env.trades)
            costs_bps = None
            slippage_bps = None
            try:
                last_tr = env.unwrapped.trades[-1] if getattr(env.unwrapped, "trades", None) else None
                if last_tr:
                    br = {
                        "commission": float(last_tr.get("commission", 0.0)),
                        "spread": float(last_tr.get("spread", 0.0)),
                        "impact": float(last_tr.get("impact", 0.0)),
                    }
                    total = br["commission"] + br["spread"] + br["impact"] + float(last_tr.get("fees", 0.0))
                    costs_bps = {**br, "total": float(total)}
                    arr = float(last_tr.get("planned_px", last_tr.get("planned_price", 0.0)))
                    rel = float(last_tr.get("realized_px", last_tr.get("realized_price", 0.0)))
                    if arr and rel:
                        slippage_bps = {"arrival": float((rel - arr) / arr * 10_000.0)}
            except Exception:
                pass

            # PnL
            eq = float(info.get("equity", 0.0))
            eq_prev = float(eq_list[-2]) if len(eq_list) >= 2 else eq
            bar_ret = (eq - eq_prev) / max(eq_prev, 1e-9)
            last_cum_ret += bar_ret
            roll_vals.append(bar_ret)
            if len(roll_vals) > roll_window:
                roll_vals.pop(0)
            try:
                import math
                import numpy as _np
                arr = _np.array(roll_vals, dtype=float)
                vol = float(arr.std() * (252 ** 0.5)) if arr.size > 1 else 0.0
                mean = float(arr.mean()) if arr.size > 0 else 0.0
                sharpe = float((mean / (arr.std() + 1e-12)) * (252 ** 0.5)) if arr.size > 1 else 0.0
                downside = float(arr[arr < 0].std()) if arr.size > 1 and (arr < 0).any() else 0.0
                sortino = float((mean / (downside + 1e-12)) * (252 ** 0.5)) if downside > 0 else 0.0
                hit_rate = float((arr > 0).mean()) if arr.size > 0 else 0.0
                last_rolling = {
                    "sharpe": sharpe,
                    "sortino": sortino,
                    "vol_realized": vol,
                    "hit_rate": hit_rate,
                }
            except Exception:
                pass

            telem = {
                "t": (pd.Timestamp(bar_ts).to_pydatetime().isoformat() if bar_ts else None),
                "bar_idx": int(bar_idx),
                "symbols": list(env.unwrapped.syms) if getattr(env.unwrapped, "syms", None) else None,
                "prices": {"close": prices_close},
                "positions": {
                    "qty": pos_qty,
                    "mkt_value": pos_mv,
                    "cash": float(getattr(env.unwrapped.port, "cash", 0.0)),
                    "nav": float(eq),
                },
                "policy": {
                    # Approximate: report final target weights as action_raw when true logits are unavailable
                    "action_raw": weights_capped,
                    "entropy": None,
                    "value_pred": None,
                },
                "regime": {
                    "gamma": gamma_vec,
                    "state": gamma_state,
                    "scaler": gamma_scale,
                },
                "weights": {
                    "raw": weights_raw,
                    "regime": weights_regime,
                    "kelly_vol": weights_kelly_vol,
                    "capped": weights_capped,
                },
                "risk": {
                    "applied": applied_layers,
                    "flags": [],
                },
                "leverage": {"gross": gross, "net": net},
                "canary": {
                    "stage": 0,
                    "deployable_capital_pct": 1.0,
                    "gates": {
                        "slippage_ok": True,
                        "hit_rate_ok": True,
                        "vol_ok": True,
                        "heartbeat_ok": True,
                        "drawdown_ok": True,
                        "reject_rate_ok": True,
                    },
                    "action": "hold",
                    "reason": None,
                    "last_promotion_at": None,
                },
                "orders": {
                    # For backtest, intended==sent best-effort
                    "intended": [],
                    "sent": [],
                    "fills": [],
                    "rejects": [],
                },
                "costs_bps": costs_bps,
                "slippage_bps": slippage_bps,
                "latency_ms": {"data_to_decision": None, "decision_to_send": None, "send_to_fill": None},
                "pnl": {"bar_bps": float(bar_ret * 10_000.0), "cum_pct": float(last_cum_ret), "dd_pct": float(-abs(info.get("drawdown", 0.0)))},
                "rolling": last_rolling,
                "turnover": {"bar_pct": float(info.get("turnover", 0.0) * 100.0)},
                "health": {"heartbeat_ms": 0, "status": "OK"},
                "errors": [],
            }

            # Orders and fills from the env's last step plan (if available)
            try:
                # The env recorded trades into env.unwrapped.trades; filter ones matching this ts
                ts_trade = env.unwrapped.src.index[env.unwrapped._i - 1]
                recent = [t for t in env.unwrapped.trades if str(t.get("ts")) == str(ts_trade)]
                fills = []
                for t in recent:
                    fills.append({
                        "sym": t.get("symbol"),
                        "qty": float(t.get("qty", 0.0)),
                        "price": float(t.get("realized_px", t.get("realized_price", 0.0))),
                        "liq": "taker",
                        "fee_bps": float(t.get("cost_bps", 0.0)),
                    })
                telem["orders"]["fills"] = fills  # type: ignore[index]
            except Exception:
                pass

            tw.emit_bar(telem)
            # Emit guardrail/risk events (if any flagged this bar)
            try:
                revents = getattr(env.unwrapped, "risk_events", [])
                if revents:
                    recent_ts = env.unwrapped.src.index[env.unwrapped._i - 1]
                    for ev in revents[-5:]:  # only last few
                        if str(ev.get("ts")) == str(int(pd.Timestamp(recent_ts).timestamp())):
                            tw.emit_event({
                                "event": str(ev.get("type", "RISK_EVENT")).upper(),
                                "details": ev.get("detail") or {},
                                "at": int(pd.Timestamp(recent_ts).timestamp() * 1000),
                            })
            except Exception:
                pass
        except Exception:
            # never break the backtest on telemetry failures
            pass

    base = pd.DataFrame({
        "ts": ts_list,
        "equity": eq_list,
        "cash": cash_list,
        "drawdown": dd_list,
        "gross_leverage": gl_list,
        "net_leverage": nl_list,
        "turnover": to_list,
        "r_base": rbase_list,
        "pen_turnover": pto_list,
        "pen_drawdown": pdd_list,
        "pen_vol": pvol_list,
        "pen_leverage": plev_list,
    })
    if weights_list and any(len(d) for d in weights_list):
        wdf = pd.DataFrame(weights_list)
        eqdf = pd.concat([base, wdf], axis=1)
    else:
        eqdf = base
    eqdf = eqdf.sort_values("ts")

    trades = getattr(env.unwrapped, "trades", [])
    if trades:
        # include richer cost/impact fields if present
        orders_rows = []
        for t in trades:
            row = {
                "ts": t.get("ts"),
                "symbol": t.get("symbol"),
                "side": t.get("side"),
                "qty": t.get("qty"),
                "planned_px": t.get("planned_px"),
                "price": t.get("realized_px"),
                "commission": float(t.get("commission", 0.0) + t.get("fees", 0.0)),
                "fees": t.get("fees"),
                "spread": t.get("spread"),
                "impact": t.get("impact"),
                "cost_bps": t.get("cost_bps"),
                "participation": t.get("participation"),
            }
            orders_rows.append(row)
        odf = pd.DataFrame(orders_rows).sort_values("ts")
    else:
        odf = pd.DataFrame(columns=["ts", "symbol", "qty", "price", "commission"])

    return eqdf, odf


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--config", type=str, default="stockbot/env/env.example.yaml")
    p.add_argument(
        "--policy",
        type=str,
        required=True,
        help="Baseline name (flat|equal|first_long|random|buy_hold) or path to PPO .zip",
    )
    p.add_argument("--start", type=str, required=True)
    p.add_argument("--end", type=str, required=True)
    p.add_argument(
        "--symbols",
        type=str,
        nargs="*",
        default=None,
        help="Override symbols from YAML, e.g. --symbols AAPL MSFT",
    )
    p.add_argument("--out", type=str, required=True, help="Run tag under stockbot/runs/<out>/report")
    p.add_argument("--normalize", action="store_true", help="Use ObsNorm (frozen in eval).")
    args = p.parse_args()

    cfg = EnvConfig.from_yaml(args.config)
    if args.symbols:
        cfg = replace(cfg, symbols=args.symbols)
    cfg = replace(cfg, start=args.start, end=args.end)

    split = Split(train=(args.start, args.end), eval=(args.start, args.end))

    # Build eval env with observation layout matching the model ZIP when provided.
    append_gamma = False
    recompute_gamma = False
    if _policy_kind(args.policy) == "rl":
        try:
            data, _params, _vars = load_from_zip_file(args.policy)
            obs_space = data.get("observation_space")
            if isinstance(obs_space, spaces.Dict) and "window" in obs_space.spaces and "portfolio" in obs_space.spaces:
                win_shape = obs_space.spaces["window"].shape  # (L, N, F)
                port_size = int(obs_space.spaces["portfolio"].shape[0])
                has_gamma_key = "gamma" in obs_space.spaces
                # Compute baseline portfolio size 7+N from model meta
                try:
                    N = int(win_shape[1])
                except Exception:
                    N = len(list(cfg.symbols)) if hasattr(cfg, "symbols") else 1
                base_port = 7 + N
                if has_gamma_key:
                    append_gamma = False
                    recompute_gamma = True
                else:
                    # If portfolio bigger than baseline, it's appended beliefs
                    append_gamma = port_size > base_port
                    recompute_gamma = append_gamma
        except Exception:
            # fallback: no layout inference
            append_gamma = False
            recompute_gamma = False

    env = make_env(
        cfg,
        split,
        mode="eval",
        normalize=args.normalize,
        append_gamma_to_obs=append_gamma,
        recompute_gamma=recompute_gamma,
        run_dir=BASE_RUNS / args.out,
    )

    # Strategy (baseline or SB3)
    strategy = _as_strategy(args.policy, env)

    # Run backtest
    eqdf, odf = _run_backtest(env, strategy)

    # Trades (FIFO) from fills
    trades_df = build_trades_fifo(odf) if not odf.empty else pd.DataFrame()

    # Output folder
    out_dir = BASE_RUNS / args.out / "report"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Save ledgers
    eqdf.to_csv(out_dir / "equity.csv", index=False)
    odf.to_csv(out_dir / "orders.csv", index=False)
    trades_df.to_csv(out_dir / "trades.csv", index=False)

    # Rolling metrics (63-day sharpe/vol, 252-day max drawdown)
    try:
        df = eqdf.copy()
        df = df.sort_values("ts")
        rets = df["equity"].pct_change().fillna(0.0)
        win = 63
        roll_vol = rets.rolling(win).std() * np.sqrt(252)
        roll_mean = rets.rolling(win).mean()
        roll_sharpe = (roll_mean / (rets.rolling(win).std() + 1e-12)) * np.sqrt(252)
        # Rolling max drawdown over ~1y window (252 bars)
        w2 = 252
        roll_max = df["equity"].rolling(w2, min_periods=1).max()
        roll_dd = 1.0 - (df["equity"] / (roll_max + 1e-9))
        rmdf = pd.DataFrame({
            "ts": df["ts"],
            "roll_sharpe_63": roll_sharpe,
            "roll_vol_63": roll_vol,
            "roll_maxdd_252": roll_dd,
        })
        rmdf.to_csv(out_dir / "rolling_metrics.csv", index=False)
    except Exception:
        pass

    # Save summary (repro metadata)
    summary = {
        "policy": args.policy,
        "symbols": list(cfg.symbols),
        "start": args.start,
        "end": args.end,
        "config_path": str(Path(args.config).resolve()),
        "normalize": bool(args.normalize),
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))

    # Metrics (now include trades_df for hit_rate/avg_trade_pnl)
    metrics = compute_all(eqdf, odf if not odf.empty else None, trades_df if not trades_df.empty else None)
    save_metrics(out_dir, metrics)

    print(f">> Wrote equity.csv, orders.csv, trades.csv, rolling_metrics.csv, metrics.json to {out_dir}")

    # Save a lightweight live_metrics.json for UI downloads
    try:
        live_metrics = {
            "total_return": float(metrics.get("total_return", 0.0)) if isinstance(metrics, dict) else None,
            "sharpe": float(metrics.get("sharpe", 0.0)) if isinstance(metrics, dict) else None,
            "max_drawdown": float(metrics.get("max_drawdown", 0.0)) if isinstance(metrics, dict) else None,
        }
        (out_dir / "live_metrics.json").write_text(json.dumps(live_metrics, indent=2))
    except Exception:
        pass


if __name__ == "__main__":
    main()
