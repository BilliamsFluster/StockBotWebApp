# stockbot/env/portfolio_env.py
from __future__ import annotations
import numpy as np, gymnasium as gym
from gymnasium import spaces
from dataclasses import asdict
from typing import Dict, List

from .config import EnvConfig
from .data_adapter import PanelSource
from .orders import Order
from .execution import ExecutionModel
from .portfolio import Portfolio
from .broker_adapters import SimBroker  # NOTE: corrected import


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

    def __init__(self, panel: PanelSource, cfg: EnvConfig):
        super().__init__()
        self.cfg = cfg
        self.src = panel
        self.syms = panel.symbols
        self.N = len(self.syms)
        self.lookback = cfg.episode.lookback

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

        self._cols = list(required)
        F = len(self._cols)
        self.observation_space = spaces.Dict({
            "window": spaces.Box(low=-np.inf, high=np.inf, shape=(self.lookback, self.N, F), dtype=np.float32),
            # portfolio: [cash_frac, margin_used, drawdown, unrealized, realized,
            #             rolling_vol, turnover] + weights (N)
            "portfolio": spaces.Box(low=-np.inf, high=np.inf, shape=(7 + self.N,), dtype=np.float32)
        })

        # --- Mapping/turnover knobs (driven via episode.* or env.*)
        self.mapping_mode = getattr(self.cfg.episode, "mapping_mode", getattr(self.cfg, "mapping_mode", "simplex_cash"))
        self.max_step_change = float(getattr(self.cfg.episode, "max_step_change", 0.10))
        self.invest_max = float(getattr(self.cfg.episode, "invest_max", 1.00))

        if self.mapping_mode == "simplex_cash":
            # N asset logits + 1 gate logit (cash/invest fraction)
            self.action_space = spaces.Box(low=-6.0, high=6.0, shape=(self.N + 1,), dtype=np.float32)
        else:
            self.action_space = spaces.Box(low=-3.0, high=3.0, shape=(self.N,), dtype=np.float32)

        self.exec = ExecutionModel(cfg.exec, cfg.fees)
        self.port = Portfolio(cash=cfg.episode.start_cash, margin=self.cfg.margin, fees=self.cfg.fees)

        self._i0 = self.lookback
        self._i = self._i0

        def _get_next():
            i = self._i
            prices = {s: tuple(self._ohlc(s, i)) for s in self.syms}
            vols = {s: float(self.src.panel[s]["volume"].iloc[i]) for s in self.syms}
            return prices, vols

        self.broker = SimBroker(self.exec, _get_next)

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
        return np.concatenate([[cash_frac, margin_used, dd, unreal, realized, vol, turnover], weights]).astype(np.float32)

    def _obs(self, i):
        prices = self._prices(i - 1)
        return {"window": self._window_obs(i), "portfolio": self._portfolio_obs(prices)}

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

        return self._obs(self._i), {"i": self._i, "config": asdict(self.cfg)}

    def step(self, action):
        a = np.asarray(action, dtype=np.float32)
        prev_w = self._last_weights.copy()
        target_w = self._map_action_to_weights(a)
        if self.min_hold_bars > 0:
            for k in range(self.N):
                if self._hold_since[k] < self.min_hold_bars and np.sign(target_w[k]) != np.sign(prev_w[k]):
                    target_w[k] = prev_w[k]

        # ---- value at previous close (t-1)
        prices_prev_close = self._prices(self._i - 1)  # CLOSE[t-1]
        eq_prev_close = self.port.value(prices_prev_close)

        # ---- convert target weights -> target shares using prev close
        tgt_shares = {}
        for k, sym in enumerate(self.syms):
            px = prices_prev_close[sym]
            tgt_shares[sym] = float((target_w[k] * eq_prev_close) / max(px, 1e-9))

        cur_shares = {sym: (self.port.positions.get(sym).qty if sym in self.port.positions else 0.0)
                      for sym in self.syms}

        # ---- deltas -> orders (skip micro-rebalances via rebalance_eps)
        w_eps = float(getattr(self.cfg.episode, "rebalance_eps", 0.0))
        orders = []
        oid = 0
        for k, sym in enumerate(self.syms):
            delta = tgt_shares[sym] - cur_shares[sym]
            if w_eps > 0.0:
                min_shares = (w_eps * eq_prev_close) / max(prices_prev_close[sym], 1e-9)
                if abs(delta) < min_shares:
                    continue
            if abs(delta) < 1e-6:
                continue
            side = "buy" if delta > 0 else "sell"
            if self.cfg.exec.order_type == "market":
                orders.append(Order(id=oid, ts_submitted=None, symbol=sym, side=side, qty=float(delta)))
            else:
                off = self.cfg.exec.limit_offset_bps * 1e-4
                limit = prices_prev_close[sym] * (1.0 - abs(off) if side == "buy" else 1.0 + abs(off))
                orders.append(Order(id=oid, ts_submitted=None, symbol=sym, side=side,
                                    qty=float(delta), type="limit", limit_price=float(limit)))
            oid += 1

        # ---- execute at OPEN[t] (SimBroker already uses self._i bar)
        fills = self.broker.place_orders(orders)
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

        info = {
            "equity": eq_close_t,
            "drawdown": dd_after,
            "weights": self._last_weights.copy(),
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
        }
        return self._obs(self._i), float(r), bool(terminated), bool(truncated), info

    def _dt_years(self):
        return 1.0 / 252.0 if self.cfg.interval == "1d" else 1.0 / 365.0
