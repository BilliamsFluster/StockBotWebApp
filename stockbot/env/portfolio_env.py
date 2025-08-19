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
from .broker_adapters import SimBroker   # NOTE: corrected import

class PortfolioTradingEnv(gym.Env):
    """
    Multi-asset portfolio env with target-weights actions (continuous).
    Observation:
      - window: (lookback, N, F)
      - portfolio: [cash_frac, leverage, drawdown] + weights (N)
    Action:
      - Box(N): unconstrained; mapped to target weights with leverage cap
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

        F = len(required)
        self.observation_space = spaces.Dict({
            "window": spaces.Box(low=-np.inf, high=np.inf, shape=(self.lookback, self.N, F), dtype=np.float32),
            "portfolio": spaces.Box(low=-np.inf, high=np.inf, shape=(3 + self.N,), dtype=np.float32)
        })
        self.action_space = spaces.Box(low=-3.0, high=3.0, shape=(self.N,), dtype=np.float32)

        self.exec = ExecutionModel(cfg.exec, cfg.fees)
        self.port = Portfolio(cash=cfg.episode.start_cash, margin=self.cfg.margin, fees=self.cfg.fees)

        self._i0 = self.lookback
        self._i = self._i0

        def _get_next():
            i = self._i
            prices = {s: tuple(self._ohlc(s, i)) for s in self.syms}
            vols   = {s: float(self.src.panel[s]["volume"].iloc[i]) for s in self.syms}
            return prices, vols
        self.broker = SimBroker(self.exec, _get_next)

        self._equity0 = cfg.episode.start_cash
        self._equity = self._equity0
        self._equity_peak = self._equity
        self._ret_hist: List[float] = []
        self._last_weights = np.zeros(self.N, dtype=np.float32)

    # ---------- helpers ----------
    def _ohlc(self, sym: str, i: int):
        df = self.src.panel[sym]
        return (float(df["open"].iloc[i]), float(df["high"].iloc[i]),
                float(df["low"].iloc[i]),  float(df["close"].iloc[i]))

    def _prices(self, i: int) -> Dict[str, float]:
        return {s: float(self.src.panel[s]["close"].iloc[i]) for s in self.syms}

    def _window_obs(self, i: int) -> np.ndarray:
        win = []
        for s in self.syms:
            sl = self.src.panel[s].iloc[i-self.lookback:i]
            arr = sl[["open","high","low","close","volume","logret"]].values
            win.append(arr)
        return np.transpose(np.stack(win, axis=0), (1,0,2)).astype(np.float32)

    def _portfolio_obs(self, prices: Dict[str,float]) -> np.ndarray:
        eq = self.port.value(prices)
        cash_frac = float(np.clip(self.port.cash / max(eq,1e-9), -10, 10))
        gross = self.port.gross_exposure(prices, eq)
        dd = self.port.drawdown(eq)
        w = self.port.weights(prices)
        weights = np.array([w.get(s,0.0) for s in self.syms], dtype=np.float32)
        return np.concatenate([[cash_frac, gross, dd], weights]).astype(np.float32)

    def _obs(self, i):
        prices = self._prices(i-1)
        return {"window": self._window_obs(i), "portfolio": self._portfolio_obs(prices)}

    def _map_action_to_weights(self, a: np.ndarray) -> np.ndarray:
        x = np.tanh(a)  # [-1,1]
        gross = np.sum(np.abs(x)) + 1e-9
        cap = self.cfg.margin.max_gross_leverage
        if gross > cap:
            x *= (cap / gross)
        return x.astype(np.float32)

    # ---------- Gym API ----------
    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self._i = self._i0
        self.port = Portfolio(cash=self.cfg.episode.start_cash, margin=self.cfg.margin, fees=self.cfg.fees)
        self._equity = self._equity0
        self._equity_peak = self._equity
        self._ret_hist.clear()
        self._last_weights[:] = 0.0
        return self._obs(self._i), {"i": self._i, "config": asdict(self.cfg)}

    def step(self, action):
        a = np.asarray(action, dtype=np.float32)
        target_w = self._map_action_to_weights(a)

        # ---- value at previous close (t-1)
        prices_prev_close = self._prices(self._i - 1)   # CLOSE[t-1]
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

        # ---- apply financing for this bar BEFORE valuing equity
        self.port.step_interest(dt_years=self._dt_years())

        # ---- value portfolio at CLOSE[t]
        prices_close_t = self._prices(self._i - 1)      # CLOSE[t]
        eq_close_t = self.port.value(prices_close_t)

        # drawdown and metrics
        self.port.update_peak(eq_close_t)
        dd_after = self.port.drawdown(eq_close_t)

        # ---- reward: close[t-1] -> close[t] (includes interest now)
        if self.cfg.reward.mode == "delta_nav":
            r_base = (eq_close_t - eq_prev_close) / max(self._equity0, 1e-9)
        else:
            r_base = np.log(max(eq_close_t, 1e-9)) - np.log(max(eq_prev_close, 1e-9))

        turnover = float(np.sum(np.abs(target_w - self._last_weights)))
        pen_dd = self.cfg.reward.w_drawdown * dd_after
        pen_to = self.cfg.reward.w_turnover * turnover
        r = r_base - pen_dd - pen_to

        self._last_weights = target_w
        terminated = self._i >= len(self.src.index) - 1
        truncated = False
        if self.cfg.episode.max_steps is not None:
            truncated = (self._i - self._i0) >= self.cfg.episode.max_steps

        info = {
            "equity": eq_close_t,
            "drawdown": dd_after,
            "weights": self._last_weights.copy(),
            "r_base": float(r_base),
            "pen_turnover": float(pen_to),
            "pen_drawdown": float(pen_dd),
        }
        return self._obs(self._i), float(r), bool(terminated), bool(truncated), info



    def _dt_years(self):
        return 1.0/252.0 if self.cfg.interval == "1d" else 1.0/365.0
