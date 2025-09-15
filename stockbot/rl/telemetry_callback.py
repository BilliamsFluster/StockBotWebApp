from __future__ import annotations

"""SB3 callback that emits per-step telemetry for the first env.

This mirrors the backtest telemetry schema at a best-effort level so the
Run Monitor can show live data during training as well.
"""

from typing import Any, Dict, List, Optional
import math

import numpy as np
from stable_baselines3.common.callbacks import BaseCallback

from stockbot.telemetry.writer import TelemetryWriter


class TelemetryCallback(BaseCallback):
    def __init__(self):
        super().__init__()
        self.tw = TelemetryWriter()
        self.roll_vals: List[float] = []
        self.last_equity: Optional[float] = None
        self.cum_ret: float = 0.0
        self.manifest_hash: Optional[str] = None

    def _on_step(self) -> bool:
        try:
            env = self.model.get_env()  # type: ignore[attr-defined]
            if env is None:
                return True
            # we only log for first env
            try:
                env0 = env.envs[0]
            except Exception:
                return True
            u = getattr(env0, "unwrapped", env0)
            # 'infos' provided by SB3 collection
            infos = self.locals.get("infos", None)  # type: ignore[attr-defined]
            info0 = (infos[0] if isinstance(infos, (list, tuple)) and infos else infos) or {}

            # timestamps
            try:
                ts = u.src.index[u._i - 1]
                t_iso = ts.to_pydatetime().isoformat()
            except Exception:
                import datetime as _dt
                t_iso = _dt.datetime.utcnow().isoformat()

            # symbols and prices
            try:
                syms = list(getattr(u, "syms", []))
            except Exception:
                syms = []
            prices_close = []
            try:
                pc = u._prices(u._i - 1)
                prices_close = [float(pc.get(s, float("nan"))) for s in syms]
            except Exception:
                pass

            # positions snapshot
            pos_qty: List[float] = []
            pos_mv: List[float] = []
            nav = float(info0.get("equity", 0.0))
            try:
                pmap = u._prices(u._i - 1)
                for s in syms:
                    pos = u.port.positions.get(s)
                    q = float(getattr(pos, "qty", 0.0)) if pos is not None else 0.0
                    mv = q * float(pmap.get(s, 0.0))
                    pos_qty.append(q)
                    pos_mv.append(float(mv))
            except Exception:
                pass

            # weights
            weights = list(map(float, list(info0.get("weights", [])))) if "weights" in info0 else []
            w_raw = list(map(float, list(info0.get("weights_raw", [])))) if "weights_raw" in info0 else None
            w_reg = list(map(float, list(info0.get("weights_regime", [])))) if "weights_regime" in info0 else None
            w_kv  = list(map(float, list(info0.get("weights_kelly_vol", [])))) if "weights_kelly_vol" in info0 else None

            # leverage
            gross = float(info0.get("gross_leverage", 0.0))
            net = float(info0.get("net_leverage", 0.0))

            # pnl and rolling stats
            if self.last_equity is None:
                self.last_equity = nav
            bar_ret = 0.0
            if self.last_equity and self.last_equity != 0:
                bar_ret = (nav - self.last_equity) / max(self.last_equity, 1e-9)
            self.cum_ret += bar_ret
            self.roll_vals.append(bar_ret)
            if len(self.roll_vals) > 60:
                self.roll_vals.pop(0)
            self.last_equity = nav
            try:
                arr = np.array(self.roll_vals, dtype=float)
                vol = float(arr.std() * math.sqrt(252)) if arr.size > 1 else 0.0
                mean = float(arr.mean()) if arr.size > 0 else 0.0
                sharpe = float((mean / (arr.std() + 1e-12)) * math.sqrt(252)) if arr.size > 1 else 0.0
                downside = float(arr[arr < 0].std()) if arr.size > 1 and (arr < 0).any() else 0.0
                sortino = float((mean / (downside + 1e-12)) * math.sqrt(252)) if downside > 0 else 0.0
                hit_rate = float((arr > 0).mean()) if arr.size > 0 else 0.0
            except Exception:
                vol = sharpe = sortino = hit_rate = 0.0

            # schema/meta
            try:
                obs_space = u.observation_space
                win_shape = list(obs_space["window"].shape)
                port_shape = list(obs_space["portfolio"].shape)
                schema_obs = f"win{win_shape}-port{port_shape}"
            except Exception:
                schema_obs = None
            import os as _os
            git_sha = _os.environ.get("STOCKBOT_GIT_SHA")

            # Try to compute policy internals (value head & entropy)
            pol_entropy = None
            pol_value = None
            try:
                obs_any = self.locals.get("new_obs") or self.locals.get("observations")  # type: ignore
                if obs_any is None:
                    # fallback from env
                    obs_any, _ = env0.reset()
                obs_t, _ = self.model.policy.obs_to_tensor(obs_any)  # type: ignore[attr-defined]
                v = self.model.policy.predict_values(obs_t)  # type: ignore[attr-defined]
                pol_value = float(v.flatten()[0].item())
                dist = self.model.policy.get_distribution(obs_t)  # type: ignore[attr-defined]
                try:
                    pol_entropy = float(dist.distribution.entropy().mean().item())  # type: ignore[attr-defined]
                except Exception:
                    pol_entropy = float(getattr(dist, "entropy", lambda: None)() or 0.0)
            except Exception:
                pass

            # features digest (min/mean/max for sanity) from observation window if available
            feat_digest = None
            try:
                win = None
                if isinstance(obs_any, dict) and "window" in obs_any:
                    win = obs_any["window"]
                elif hasattr(u, "_window_obs"):
                    win = u._window_obs(u._i)
                if win is not None:
                    arr = np.asarray(win, dtype=float)
                    feat_digest = {
                        "min": float(np.nanmin(arr)),
                        "mean": float(np.nanmean(arr)),
                        "max": float(np.nanmax(arr)),
                    }
            except Exception:
                pass

            # Regime beliefs and scaler
            reg_gamma = None
            reg_state = None
            reg_scaler = 1.0
            try:
                if getattr(u, "_gamma_seq", None) is not None and getattr(u, "_i", None) is not None:
                    g = u._gamma_seq[u._i]
                    arr = np.asarray(g).reshape(-1)
                    reg_gamma = [float(x) for x in arr]
                    reg_state = int(arr.argmax()) if arr.size else None
                if getattr(u, "sizing_trace", None):
                    tr = u.sizing_trace[-1]
                    reg_scaler = float(tr.get("gamma", 1.0))
            except Exception:
                pass

            # manifest hash (once)
            if self.manifest_hash is None:
                try:
                    import hashlib as _hh
                    cfg = getattr(u, "cfg", None)
                    smbls = list(getattr(cfg, "symbols", [])) if cfg else syms
                    start = getattr(cfg, "start", None)
                    end = getattr(cfg, "end", None)
                    interval = getattr(cfg, "interval", None)
                    _m = f"{smbls}|{start}|{end}|{interval}"
                    self.manifest_hash = _hh.sha1(_m.encode()).hexdigest()[:12]
                except Exception:
                    self.manifest_hash = None

            telem = {
                "t": t_iso,
                "bar_idx": int(getattr(u, "_i", 0)),
                "symbols": syms,
                "prices": {"close": prices_close},
                "positions": {
                    "qty": pos_qty,
                    "mkt_value": pos_mv,
                    "cash": float(getattr(u.port, "cash", 0.0)),
                    "nav": nav,
                },
                "policy": {
                    "action_raw": w_raw if w_raw is not None else weights,  # prefer pre-overlay weights
                    "entropy": pol_entropy,
                    "value_pred": pol_value,
                    "features_digest": feat_digest,
                },
                "regime": {
                    "gamma": reg_gamma,
                    "state": reg_state,
                    "scaler": reg_scaler,
                },
                "weights": {
                    "raw": w_raw,
                    "regime": w_reg,
                    "kelly_vol": w_kv,
                    "capped": weights,
                },
                "risk": {"applied": [], "flags": []},
                "leverage": {"gross": gross, "net": net},
                "orders": {"intended": [], "sent": [], "fills": [], "rejects": []},
                "pnl": {
                    "bar_bps": float(bar_ret * 10_000.0),
                    "cum_pct": float(self.cum_ret),
                    "dd_pct": float(-abs(info0.get("drawdown", 0.0))),
                },
                "rolling": {
                    "sharpe": sharpe,
                    "sortino": sortino,
                    "vol_realized": vol,
                    "hit_rate": hit_rate,
                },
                "turnover": {"bar_pct": float(info0.get("turnover", 0.0) * 100.0)},
                "health": {"heartbeat_ms": 0, "status": "OK"},
                "model": {"git_sha": git_sha},
                "schema": {"obs": schema_obs},
                "data": {"manifest_hash": self.manifest_hash},
                "errors": [],
            }
            # fills (best-effort from env.trades at current ts)
            try:
                recent_ts = getattr(u.src.index[u._i - 1], "timestamp", lambda: None)()
                recent_iso = getattr(u.src.index[u._i - 1], "isoformat", lambda: None)()
                fills = []
                for t in getattr(u, "trades", [])[-25:]:
                    if recent_iso and str(t.get("ts")) != str(recent_iso):
                        continue
                    fills.append({
                        "sym": t.get("symbol"),
                        "qty": float(t.get("qty", 0.0)),
                        "price": float(t.get("realized_px", t.get("realized_price", 0.0))),
                        "liq": "taker",
                        "fee_bps": float(t.get("cost_bps", 0.0)),
                    })
                if fills:
                    telem.setdefault("orders", {}).update({"fills": fills})
            except Exception:
                pass

            # intended/sent orders and costs/slippage from env info if present
            try:
                if "orders_intended" in info0:
                    telem.setdefault("orders", {}).update({"intended": list(info0.get("orders_intended") or [])})
                if "orders_sent" in info0:
                    telem.setdefault("orders", {}).update({"sent": list(info0.get("orders_sent") or [])})
                if "bar_costs_bps" in info0:
                    telem["costs_bps"] = dict(info0.get("bar_costs_bps") or {})
                if "slippage_bps" in info0:
                    telem["slippage_bps"] = dict(info0.get("slippage_bps") or {})
                if "markouts_bps" in info0:
                    telem["markouts_bps"] = dict(info0.get("markouts_bps") or {})
                if "participation_pct" in info0:
                    telem["participation"] = {"sym_pct": info0.get("participation_pct")}
            except Exception:
                pass

            self.tw.emit_bar(telem)

            # Emit events (risk events, abnormal slippage) for training feed
            try:
                if info0.get("risk_events"):
                    for et in info0.get("risk_events"):
                        self.tw.emit_event({"event": str(et).upper(), "details": {}, "at": None})
            except Exception:
                pass
            try:
                arr = telem.get("slippage_bps", {}).get("arrival") if isinstance(telem.get("slippage_bps"), dict) else None
                if arr is not None and abs(float(arr)) > 20.0:
                    self.tw.emit_event({"event": "ABNORMAL_SLIPPAGE", "details": {"gate": "slippage_ok", "threshold": 20.0, "observed": float(arr)}, "at": None})
            except Exception:
                pass
        except Exception:
            # never break training on telemetry errors
            pass
        return True
