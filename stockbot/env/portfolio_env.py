# stockbot/env/portfolio_env.py
from __future__ import annotations
import numpy as np, gymnasium as gym
from gymnasium import spaces
from dataclasses import asdict
from typing import Dict, List

from .config import EnvConfig
from .data_adapter import PanelSource
from .orders import Fill
from .portfolio import Portfolio
from stockbot.backtest.fills import plan_fills
from stockbot.backtest.execution_costs import CostParams, apply_costs
from stockbot.strategy import (
    SizingConfig,
    apply_sizing_layers,
    GuardsConfig,
    RiskState,
    apply_caps_and_guards,
    RegimeScalerConfig,
    regime_exposure_multiplier,
)
import pandas as pd
try:
    from stockbot.execution.live_guardrails import LiveGuardrails
except Exception:
    LiveGuardrails = None  # type: ignore
class PortfolioTradingEnv(gym.Env):
    """
    Multi-asset portfolio env with target-weights actions (continuous).
    Observation:
      - window: (lookback, N, F)
      - portfolio: [cash_frac, leverage, drawdown] + weights (N)
    Action:
      - Default "simplex_cash": Box(N+1) logits -> invest fraction (sigmoid) * softmax allocation
        * Per-step turnover capped by episode.max_step_change
      - Fallback "tanh_leverage": Box(N) -> tanh weights with gross leverage cap
    """
    metadata = {"render_modes": []}

    def __init__(
        self,
        panel: PanelSource,
        cfg: EnvConfig,
        *,
        regime_gamma: np.ndarray | None = None,
        regime_scaler: RegimeScalerConfig | None = None,
        append_gamma_to_obs: bool = False,
    ):
        super().__init__()
        self.cfg = cfg
        self.src = panel
        self.syms = panel.symbols
        self.N = len(self.syms)
        self.lookback = cfg.episode.lookback
        self._gamma_seq = regime_gamma
        self._regime_scaler = regime_scaler
        self._append_gamma = append_gamma_to_obs

        required = self.src.cols_required()
        for s in self.syms:
            missing = [c for c in required if c not in self.src.panel[s].columns]
            if missing:
                raise RuntimeError(f"{s} missing features {missing}")

        # Defensive: verify enough rows (PanelSource also checks)
        min_needed = self.lookback + 2  # window + at least one forward step
        if len(self.src.index) < min_needed:
            raise RuntimeError(
                f"Env has only {len(self.src.index)} rows after features; "
                f"need ≥ {min_needed} for lookback={self.lookback}."
            )
        if self._gamma_seq is not None and len(self._gamma_seq) != len(self.src.index):
            raise RuntimeError("regime_gamma length must match panel length")

        self._cols = list(required)
        F = len(self._cols)
        extra = 0
        if self._gamma_seq is not None and self._append_gamma:
            extra = int(self._gamma_seq.shape[1]) if self._gamma_seq.ndim > 1 else 1
        obs_spaces = {
            "window": spaces.Box(low=-np.inf, high=np.inf, shape=(self.lookback, self.N, F), dtype=np.float32),
            # portfolio: [cash_frac, margin_used, drawdown, unrealized, realized,
            #             rolling_vol, turnover] + weights (N)
            "portfolio": spaces.Box(low=-np.inf, high=np.inf, shape=(7 + self.N + extra,), dtype=np.float32),
        }
        if self._gamma_seq is not None and not self._append_gamma:
            K = int(self._gamma_seq.shape[1]) if self._gamma_seq.ndim > 1 else 1
            obs_spaces["gamma"] = spaces.Box(low=0.0, high=1.0, shape=(K,), dtype=np.float32)
        self.observation_space = spaces.Dict(obs_spaces)

        # --- Mapping/turnover knobs (driven via episode.* or env.*)
        self.mapping_mode = getattr(self.cfg.episode, "mapping_mode", getattr(self.cfg, "mapping_mode", "simplex_cash"))
        self.max_step_change = float(getattr(self.cfg.episode, "max_step_change", 0.10))
        self.invest_max = float(getattr(self.cfg.episode, "invest_max", 1.00))

        if self.mapping_mode == "simplex_cash":
            # N asset logits + 1 gate logit (cash/invest fraction)
            self.action_space = spaces.Box(low=-6.0, high=6.0, shape=(self.N + 1,), dtype=np.float32)
        else:
            self.action_space = spaces.Box(low=-3.0, high=3.0, shape=(self.N,), dtype=np.float32)

        self.port = Portfolio(cash=cfg.episode.start_cash, margin=self.cfg.margin, fees=self.cfg.fees)

        # unified cost/impact parameters shared with backtest
        self.cost = CostParams(
            commission_per_share=float(self.cfg.fees.commission_per_share),
            taker_fee_bps=float(getattr(self.cfg.fees, "taker_fee_bps", 0.0)),
            maker_rebate_bps=float(getattr(self.cfg.fees, "maker_rebate_bps", 0.0)),
            half_spread_bps=float(
                getattr(self.cfg.fees, "half_spread_bps", getattr(self.cfg.fees, "slippage_bps", 0.0))
            ),
            impact_k=float(getattr(self.cfg.exec, "impact_k", 0.0)),
        )
        self.fill_policy = getattr(self.cfg.exec, "fill_policy", "next_open")
        self.max_participation = float(
            getattr(self.cfg.exec, "participation_cap", getattr(self.cfg.exec, "max_participation", 1.0))
        )

        self._i0 = self.lookback
        self._i = self._i0

        self._equity0 = cfg.episode.start_cash
        self._equity = self._equity0
        self._equity_peak = self._equity
        self._ret_hist: List[float] = []
        self._last_weights = np.zeros(self.N, dtype=np.float32)
        self._w_prev_map = None  # for turnover capping in mapping
        self.min_hold_bars = int(getattr(self.cfg.episode, "min_hold_bars", 0))
        self._hold_since = np.zeros(self.N, dtype=np.int32)
        self._turnover_ep = 0.0
        self._turnover_last = 0.0

        # episode artifacts
        self.trades: List[Dict] = []
        self._eq_gross: List[float] = []
        self._eq_net: List[float] = []
        self._eq_ts: List[pd.Timestamp] = []

        self.sizing_cfg = SizingConfig()
        self.guards_cfg = GuardsConfig()
        # Align runtime guards with YAML margin settings when provided
        try:
            per_cap = float(getattr(self.cfg.margin, "max_position_weight", 0.0))
        except Exception:
            per_cap = 0.0
        try:
            gl_cap = float(getattr(self.cfg.margin, "max_gross_leverage", self.guards_cfg.gross_leverage_cap))
        except Exception:
            gl_cap = self.guards_cfg.gross_leverage_cap
        try:
            dd_frac = float(getattr(self.cfg.margin, "daily_loss_limit", 0.0))  # fraction
            dd_pct = dd_frac * 100.0 if dd_frac > 0 else 0.0
        except Exception:
            dd_pct = 0.0
        # If any overrides are present, apply them
        if per_cap > 0 or gl_cap != self.guards_cfg.gross_leverage_cap or dd_pct > 0:
            self.guards_cfg.per_name_cap = per_cap if per_cap > 0 else self.guards_cfg.per_name_cap
            self.guards_cfg.gross_leverage_cap = gl_cap
            if dd_pct > 0:
                self.guards_cfg.daily_loss_limit_pct = dd_pct
        self.risk_state = RiskState(
            nav_day_open=self._equity0,
            nav_current=self._equity0,
            realized_vol_ewma=0.0,
        )
        self.sizing_trace: List[Dict] = []
        self.risk_events: List[Dict] = []
        self.guardrails = LiveGuardrails() if LiveGuardrails else None
        self._canary_prev_stage = 0

    # ---------- helpers ----------
    def _ohlc(self, sym: str, i: int):
        df = self.src.panel[sym]
        return (float(df["open"].iloc[i]), float(df["high"].iloc[i]),
                float(df["low"].iloc[i]), float(df["close"].iloc[i]))

    def _prices(self, i: int) -> Dict[str, float]:
        return {s: float(self.src.panel[s]["close"].iloc[i]) for s in self.syms}

    def _window_obs(self, i: int) -> np.ndarray:
        win = []
        for s in self.syms:
            sl = self.src.panel[s].iloc[i - self.lookback:i]
            arr = sl[self._cols].values
            win.append(arr)
        return np.transpose(np.stack(win, axis=0), (1, 0, 2)).astype(np.float32)

    def _portfolio_obs(self, prices: Dict[str, float]) -> np.ndarray:
        eq = self.port.value(prices)
        cash_frac = float(np.clip(self.port.cash / max(eq, 1e-9), -10, 10))
        margin_used = self.port.gross_exposure(prices, eq)
        dd = self.port.drawdown(eq)
        unreal = self.port.unrealized_pnl(prices) / max(self._equity0, 1e-9)
        realized = (eq - self._equity0 - self.port.unrealized_pnl(prices)) / max(self._equity0, 1e-9)
        vol = 0.0
        if len(self._ret_hist) > 1:
            window = getattr(self.cfg.reward, "vol_window", 20)
            vol = float(np.std(self._ret_hist[-window:]))
        turnover = float(self._turnover_last)
        w = self.port.weights(prices)
        weights = np.array([w.get(s, 0.0) for s in self.syms], dtype=np.float32)
        base = np.concatenate([[cash_frac, margin_used, dd, unreal, realized, vol, turnover], weights])
        if self._gamma_seq is not None and self._append_gamma:
            # Align gamma with the current decision index `self._i`,
            # consistent with separate `gamma` key and sizing logic in step().
            gamma = self._gamma_seq[self._i]
            gamma = np.asarray(gamma, dtype=np.float32).reshape(-1)
            base = np.concatenate([base, gamma])
        return base.astype(np.float32)

    def _obs(self, i):
        prices = self._prices(i - 1)
        obs = {"window": self._window_obs(i), "portfolio": self._portfolio_obs(prices)}
        if self._gamma_seq is not None and not self._append_gamma:
            obs["gamma"] = self._gamma_seq[i]
        return obs

    # ---------- action mapping ----------
    def _map_action_to_weights(self, a: np.ndarray) -> np.ndarray:
        a = np.asarray(a, dtype=np.float32).reshape(-1)

        if self.mapping_mode == "simplex_cash":
            # last logit gates how much to invest; others choose allocation
            asset_logits = a[:-1]
            gate_logit   = a[-1]

            # invest fraction in [0, invest_max]
            invest_frac = float(1.0 / (1.0 + np.exp(-gate_logit))) * self.invest_max  # sigmoid * cap

            # softmax over assets -> nonnegative weights sum to 1
            shifted = asset_logits - asset_logits.max()
            exp = np.exp(shifted)
            alloc = exp / (exp.sum() + 1e-9)  # shape (N,)

            w = invest_frac * alloc  # sum(w) <= invest_max, remainder stays cash

            # turnover cap: elementwise clamp change vs previous target
            w_prev = self._w_prev_map
            if w_prev is not None and w_prev.shape == w.shape:
                delta = np.clip(w - w_prev, -self.max_step_change, self.max_step_change)
                w = w_prev + delta
            self._w_prev_map = w
            cap = float(getattr(self.cfg.margin, "max_position_weight", 1.0))
            w = np.clip(w, -cap, cap)
            return w.astype(np.float32)

        # fallback: original long/short mapping with leverage cap
        x = np.tanh(a)  # [-1,1]
        gross = np.sum(np.abs(x)) + 1e-9
        cap = float(self.cfg.margin.max_gross_leverage)
        if gross > cap:
            x *= (cap / gross)
        cap_w = float(getattr(self.cfg.margin, "max_position_weight", 1.0))
        x = np.clip(x, -cap_w, cap_w)
        return x.astype(np.float32)

    # ---------- Gym API ----------
    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)

        L = self.lookback
        # leave at least one step after the starting point
        last_valid_start = len(self.src.index) - 2
        if last_valid_start < L:
            raise RuntimeError(
                f"Not enough bars to start: last_valid_start={last_valid_start}, lookback={L}. "
                "Extend your date range or reduce lookback/indicator windows."
            )

        if getattr(self.cfg.episode, "randomize_start", False):
            # horizon or max_steps limits how far forward we can start
            cap = self.cfg.episode.horizon or self.cfg.episode.max_steps
            if cap is None:
                cap = last_valid_start - L
            max_start = max(L, last_valid_start - cap)
            self._i0 = int(self.np_random.integers(L, max(max_start, L) + 1))
        else:
            self._i0 = L

        self._i = self._i0
        self.port = Portfolio(
            cash=self.cfg.episode.start_cash,
            margin=self.cfg.margin,
            fees=self.cfg.fees
        )
        self._equity = self._equity0
        self._equity_peak = self._equity
        self._ret_hist.clear()
        self._last_weights[:] = 0.0
        self._w_prev_map = None
        self._hold_since[:] = 0
        self._turnover_ep = 0.0
        self.trades.clear()
        self._eq_gross.clear()
        self._eq_net.clear()
        self._eq_ts.clear()
        self.sizing_cfg.state = SizingConfig().state
        self.risk_state = RiskState(
            nav_day_open=self._equity0,
            nav_current=self._equity0,
            realized_vol_ewma=0.0,
        )
        self.sizing_trace.clear()
        self.risk_events.clear()
        if LiveGuardrails:
            self.guardrails = LiveGuardrails()
            self._canary_prev_stage = 0

        return self._obs(self._i), {"i": self._i, "config": asdict(self.cfg)}

    def step(self, action):
        a = np.asarray(action, dtype=np.float32)
        prices_prev_close = self._prices(self._i - 1)  # CLOSE[t-1]
        eq_prev_close = self.port.value(prices_prev_close)
        prev_w = np.array(
            [
                (self.port.positions[sym].qty if sym in self.port.positions else 0.0)
                * prices_prev_close[sym]
                for sym in self.syms
            ],
            dtype=np.float64,
        )
        prev_w = (prev_w / max(eq_prev_close, 1e-9)).astype(np.float32)

        target_w = self._map_action_to_weights(a)
        if self.min_hold_bars > 0:
            for k in range(self.N):
                # Enforce minimum hold only when flipping between non-zero signs
                if (
                    abs(prev_w[k]) > 1e-6
                    and self._hold_since[k] < self.min_hold_bars
                    and np.sign(target_w[k]) != np.sign(prev_w[k])
                ):
                    target_w[k] = prev_w[k]

        # ---- enforce micro-rebalance gate
        w_eps = float(getattr(self.cfg.episode, "rebalance_eps", 0.0))
        if w_eps > 0.0:
            for k in range(self.N):
                if abs(target_w[k] - prev_w[k]) < w_eps:
                    target_w[k] = prev_w[k]

        now_ts = int(self.src.index[self._i].timestamp())
        gamma_t = 1.0
        if self._gamma_seq is not None and self._regime_scaler is not None:
            gamma_t = regime_exposure_multiplier(self._gamma_seq[self._i], self._regime_scaler)
        # capture weights along the decision path
        w_raw = target_w.copy()
        target_w, trace = apply_sizing_layers(target_w, gamma_t, self._ret_hist, self.sizing_cfg)
        self.risk_state.realized_vol_ewma = trace["realized_vol"]
        target_w, events, self.risk_state = apply_caps_and_guards(
            target_w, None, self.guards_cfg, self.risk_state, now_ts
        )
        try:
            trace = dict(trace)
            trace["gamma"] = float(gamma_t)
        except Exception:
            pass
        self.sizing_trace.append({"ts": self.src.index[self._i], **trace})
        self.risk_events.extend(events)
        self.risk_state.nav_day_open = self.risk_state.nav_current

        # ---- plan fills using next bar open and ADV
        prices_next = np.array([self._ohlc(sym, self._i)[0] for sym in self.syms], dtype=np.float64)
        adv_next = np.array([
            float(self.src.panel[sym]["close"].iloc[self._i] * self.src.panel[sym]["volume"].iloc[self._i])
            for sym in self.syms
        ], dtype=np.float64)
        orders = plan_fills(
            prev_w,
            target_w,
            nav=eq_prev_close,
            prices_next=prices_next,
            adv_next=adv_next,
            policy=self.fill_policy,
            max_participation=self.max_participation,
        )

        fills: List[Fill] = []
        total_cost = 0.0
        total_notional = 0.0
        arrival_slippages: list[float] = []
        part_map: Dict[str, float] = {}
        ts_trade = self.src.index[self._i]
        for j, o in enumerate(orders):
            sym = self.syms[o["symbol_idx"]]
            rc = apply_costs(
                planned_price=o["planned_price"],
                side=o["side"],
                is_taker=True,
                qty=o["qty"],
                cost=self.cost,
                participation=o["participation"],
            )
            br = rc["breakdown"]
            fills.append(
                Fill(
                    order_id=j,
                    symbol=sym,
                    qty=o["qty"],
                    price=rc["realized_price"],
                    commission=float(br["commission"] + br["fees"]),
                )
            )
            self.trades.append(
                {
                    "ts": ts_trade,
                    "symbol": sym,
                    "side": o["side"],
                    "qty": float(o["qty"]),
                    "planned_px": float(o["planned_price"]),
                    "realized_px": float(rc["realized_price"]),
                    "commission": float(br["commission"]),
                    "fees": float(br["fees"]),
                    "spread": float(br["spread"]),
                    "impact": float(br["impact"]),
                    "cost_bps": float(rc["cost_bps"]),
                    "participation": float(o["participation"]),
                }
            )
            total_cost += float(br["commission"] + br["fees"] + br["spread"] + br["impact"])
            total_notional += abs(float(o["qty"]) * float(o["planned_price"]))
            try:
                arr_bps = (float(rc["realized_price"]) - float(o["planned_price"])) / max(1e-9, float(o["planned_price"])) * 10000.0
                arrival_slippages.append(arr_bps)
            except Exception:
                pass
            part_map[sym] = float(o["participation"]) * 100.0

        if fills:
            self.port.apply_fills(fills)

        # ---- advance to next bar
        self._i += 1

        # ---- value portfolio at CLOSE[t]
        prices_close_t = self._prices(self._i - 1)  # CLOSE[t]

        # ---- apply financing for this bar BEFORE valuing equity
        self.port.step_interest(prices_close_t, dt_years=self._dt_years())
        eq_close_t = self.port.value(prices_close_t)

        # drawdown and metrics
        self.port.update_peak(eq_close_t)
        dd_after = self.port.drawdown(eq_close_t)

        # ---- reward base (delta NAV or log NAV)
        if self.cfg.reward.mode == "delta_nav":
            r_base = (eq_close_t - eq_prev_close) / max(self._equity0, 1e-9)
        else:
            r_base = np.log(max(eq_close_t, 1e-9)) - np.log(max(eq_prev_close, 1e-9))

        # penalties
        turnover = float(np.sum(np.abs(target_w - prev_w)))
        self._turnover_last = turnover
        self._turnover_ep += turnover
        pen_dd = self.cfg.reward.w_drawdown * dd_after
        pen_to = self.cfg.reward.w_turnover * turnover

        ret_step = (eq_close_t - eq_prev_close) / max(eq_prev_close, 1e-9)
        self._ret_hist.append(float(ret_step))
        pen_vol = 0.0
        if self.cfg.reward.w_vol > 0 and len(self._ret_hist) >= self.cfg.reward.vol_window:
            vol = float(np.std(self._ret_hist[-self.cfg.reward.vol_window:]))
            pen_vol = self.cfg.reward.w_vol * vol
        gross = self.port.gross_exposure(prices_close_t, eq_close_t)
        net = self.port.net_exposure(prices_close_t, eq_close_t)
        lev_cap = self.cfg.margin.max_gross_leverage
        pen_lev = self.cfg.reward.w_leverage * max(0.0, gross - lev_cap)

        r = r_base - pen_dd - pen_to - pen_vol - pen_lev

        self._last_weights = target_w
        self._eq_ts.append(self.src.index[self._i - 1])
        self._eq_net.append(eq_close_t)
        self._eq_gross.append(eq_close_t + total_cost)
        self.risk_state.nav_current = eq_close_t
        self.risk_state.nav_day_open = eq_close_t
        for k in range(self.N):
            if abs(target_w[k] - prev_w[k]) > w_eps:
                self._hold_since[k] = 0
            elif target_w[k] != 0:
                self._hold_since[k] += 1
            else:
                self._hold_since[k] = 0

        terminated = self._i >= len(self.src.index) - 1
        truncated = False
        cap = self.cfg.episode.horizon or self.cfg.episode.max_steps
        if cap is not None:
            truncated = (self._i - self._i0) >= cap

        stop_frac = getattr(self.cfg.reward, "stop_eq_frac", 0.0)
        if stop_frac > 0 and eq_close_t < stop_frac * self._equity0:
            terminated = True
            r -= 1.0

        m = self.cfg.margin
        if m.max_gross_leverage > 0 and gross > m.max_gross_leverage:
            terminated = True
            r -= 1.0
        if m.max_net_leverage > 0 and abs(net) > m.max_net_leverage:
            terminated = True
            r -= 1.0
        if m.daily_loss_limit > 0:
            daily_loss = (eq_close_t - eq_prev_close) / max(eq_prev_close, 1e-9)
            if daily_loss < -m.daily_loss_limit:
                terminated = True
                r -= 1.0
        if m.max_drawdown > 0 and dd_after > m.max_drawdown:
            terminated = True
            r -= 1.0

        if terminated or truncated:
            self._dump_episode_artifacts()

        # risk overlays applied markers
        risk_applied = []
        try:
            if abs(gamma_t - 1.0) > 1e-6:
                risk_applied.append("regime")
            if abs(float(trace.get("f_kelly", 1.0)) - 1.0) > 1e-6:
                risk_applied.append("kelly")
            if abs(float(trace.get("vol_scale", 1.0)) - 1.0) > 1e-6:
                risk_applied.append("vol_target")
            for ev in events:
                et = str(ev.get("type", "")).lower()
                if et == "per_name_cap":
                    risk_applied.append("per_name_cap")
                if et == "gross_leverage_cap":
                    risk_applied.append("gross_cap")
                if et == "daily_dd_halt":
                    risk_applied.append("daily_loss_limit")
        except Exception:
            pass

        # Aggregate costs and slippage
        cost_bps_total = (total_cost / max(1e-9, total_notional)) * 10000.0 if total_notional > 0 else 0.0
        try:
            import numpy as _np
            slip_arrival = float(_np.mean(arrival_slippages)) if arrival_slippages else 0.0
        except Exception:
            slip_arrival = 0.0

        # Post-trade markouts at 1/5/15 bars (mean across orders)
        def _markout_bps(offset_bars: int) -> float:
            try:
                idx = min(len(self.src.index) - 1, (self._i) - 1 + offset_bars)
                arr: list[float] = []
                for o in orders:
                    sym = self.syms[o["symbol_idx"]]
                    p_ref = float(o["planned_price"]) if float(o["planned_price"]) != 0 else 1e-9
                    p_close = float(self._prices(idx)[sym])
                    arr.append((p_close - p_ref) / p_ref * 10000.0)
                return float(_np.mean(arr)) if arr else 0.0
            except Exception:
                return 0.0
        markouts = {"m1": _markout_bps(1), "m5": _markout_bps(5), "m15": _markout_bps(15)}

        # Build orders intended/sent lists for telemetry consumers
        orders_intended = []
        orders_sent = []
        for o in orders:
            sym = self.syms[o["symbol_idx"]]
            qty_int = float(o.get("qty_intended", o["qty"])) if isinstance(o, dict) else float(o["qty"])  # type: ignore[index]
            orders_intended.append({
                "sym": sym,
                "side": o["side"],
                "qty": qty_int,
                "target_w": float(target_w[o["symbol_idx"]]),
                "reason": "rebalance",
            })
            orders_sent.append({
                "sym": sym,
                "side": o["side"],
                "qty": float(o["qty"]),
                "type": self.fill_policy,
                "limit": None,
            })

        # Canary gating (best-effort for backtest)
        canary_info = {
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
        }
        try:
            if self.guardrails is not None:
                last_ts = int(self.src.index[self._i - 1].timestamp())
                now_ts = int(self.src.index[self._i].timestamp())
                metrics = {
                    "sharpe": 0.0,
                    "hitrate": 0.0,
                    "slippage_bps": abs(slip_arrival),
                    "max_daily_dd_pct": abs(dd_after) * 100.0,
                }
                deploy = self.guardrails.record(metrics, last_bar_ts=last_ts, now_ts=now_ts, broker_ok=True)
                stage_idx = int(self.guardrails.state.stage_idx)
                canary_info["stage"] = stage_idx
                canary_info["deployable_capital_pct"] = float(deploy)
                if stage_idx > self._canary_prev_stage:
                    self.risk_events.append({"ts": now_ts, "type": "PROMOTION"})
                if self.guardrails.state.halted:
                    self.risk_events.append({"ts": now_ts, "type": "HALT"})
                self._canary_prev_stage = stage_idx
        except Exception:
            pass

        info = {
            "equity": eq_close_t,
            "drawdown": dd_after,
            "weights": self._last_weights.copy(),
            # expose full decision path when available
            "weights_raw": w_raw.copy(),
            "weights_regime": (w_raw * float(gamma_t)),
            "weights_kelly_vol": (w_raw * float(trace.get("f_kelly", 1.0)) * float(trace.get("vol_scale", 1.0)) * float(gamma_t)),
            "weights_capped": self._last_weights.copy(),
            "r_base": float(r_base),
            "pen_turnover": float(pen_to),
            "pen_drawdown": float(pen_dd),
            "pen_vol": float(pen_vol),
            "pen_leverage": float(pen_lev),
            "turnover": float(turnover),
            "turnover_ep": float(self._turnover_ep),
            "edge_net": float(eq_close_t - eq_prev_close),
            "gross_leverage": float(gross),
            "net_leverage": float(net),
            "risk_applied": risk_applied,
            "risk_events": [e.get("type") for e in events],
            # costs & execution
            "bar_costs_bps": {
                "total": float(cost_bps_total),
            },
            "slippage_bps": {"arrival": float(slip_arrival)},
            "markouts_bps": markouts,
            "orders_intended": orders_intended,
            "orders_sent": orders_sent,
            "participation_pct": part_map,
            "canary": canary_info,
        }
        return self._obs(self._i), float(r), bool(terminated), bool(truncated), info

    def _dt_years(self):
        return 1.0 / 252.0 if self.cfg.interval == "1d" else 1.0 / 365.0

    def _dump_episode_artifacts(self):
        out_dir = getattr(self.cfg.episode, "artifacts_dir", None)
        if not out_dir:
            return
        p = Path(out_dir)
        p.mkdir(parents=True, exist_ok=True)
        if self.trades:
            pd.DataFrame(self.trades).to_csv(p / "trades.csv", index=False)
        if self._eq_ts:
            pd.DataFrame({"ts": self._eq_ts, "equity": self._eq_gross}).to_csv(p / "equity_gross.csv", index=False)
            pd.DataFrame({"ts": self._eq_ts, "equity": self._eq_net}).to_csv(p / "equity_net.csv", index=False)
        if self.sizing_trace:
            pd.DataFrame(self.sizing_trace).to_csv(p / "sizing_trace.csv", index=False)
        if self.risk_events:
            pd.DataFrame(self.risk_events).to_json(p / "risk_events.json", orient="records")
