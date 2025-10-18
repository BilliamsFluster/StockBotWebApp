from __future__ import annotations

import collections
import json
import logging
import math
import os
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import numpy as np
import pandas as pd
from stable_baselines3 import PPO

from stockbot.env.broker_adapters import LiveBrokerAdapter
from stockbot.env.config import EnvConfig
from stockbot.env.data_adapter import compute_indicators
from stockbot.env.orders import Order
from stockbot.execution.live_guardrails import LiveGuardrails
from stockbot.providers.provider_manager import ProviderManager

logger = logging.getLogger(__name__)

_BASE_COLUMNS = ["open", "high", "low", "close", "volume"]
_INDICATOR_ALIAS_MINIMAL = [
    "logret",
    "logret5",
    "logret20",
    "vol10",
    "vol20",
    "atr14",
    "bb_width",
    "keltner_width",
    "vol_z20",
    "amihud",
]

_INTERVAL_TIMEFRAME = {
    "1m": "1Min",
    "5m": "5Min",
    "15m": "15Min",
    "30m": "30Min",
    "1h": "1Hour",
    "1d": "1Day",
}

_INTERVAL_SECONDS = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "1d": 86400,
}

_MIN_NOTIONAL = 5.0  # minimum dollar change to trigger an order


def _expand_indicators(raw: Sequence[str]) -> List[str]:
    expanded: List[str] = []
    for ind in raw:
        if ind in ("minimal", "minimal_core"):
            expanded.extend(_INDICATOR_ALIAS_MINIMAL)
        elif ind == "bbands":
            expanded.extend(["bb_upper", "bb_lower"])
        else:
            expanded.append(ind)
    return expanded


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _write_jsonl(path: Path, payload: Dict) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, default=str) + "\n")
    except Exception as exc:  # pragma: no cover - best effort logging only
        logger.debug("Failed to write %s: %s", path, exc)


@dataclass
class MarketSnapshot:
    window: np.ndarray
    portfolio_vec: np.ndarray
    prices: Dict[str, float]
    positions_qty: Dict[str, float]
    weights: Dict[str, float]
    equity: float
    cash: float
    last_bar_ts: int
    returns_fraction: float


class LiveRunnerError(RuntimeError):
    """Raised when live trading setup fails."""


class LiveTradingSession:
    """Background runner that deploys a trained policy to a live paper broker."""

    def __init__(
        self,
        *,
        session_id: str,
        broker: str,
        credentials: Dict[str, str],
        env_config: EnvConfig,
        policy_path: Path,
        run_dir: Path,
        run_id: Optional[str] = None,
    ) -> None:
        self.session_id = session_id
        self.broker = broker
        self.credentials = dict(credentials)
        self.cfg = env_config
        self.policy_path = Path(policy_path)
        self.run_dir = Path(run_dir)
        self.run_id = run_id

        if not self.policy_path.exists():
            raise LiveRunnerError(f"Policy not found at {self.policy_path}")
        if not self.run_dir.exists():
            raise LiveRunnerError(f"Run directory {self.run_dir} does not exist")

        self.symbols = list(self.cfg.symbols)
        if not self.symbols:
            raise LiveRunnerError("Env config contains no symbols")

        self.lookback = int(getattr(self.cfg.episode, "lookback", 0) or 0)
        if self.lookback <= 0:
            raise LiveRunnerError("Env lookback must be > 0 for live trading")

        self.timeframe = _INTERVAL_TIMEFRAME.get(self.cfg.interval.lower())
        if not self.timeframe:
            raise LiveRunnerError(f"Unsupported interval for live trading: {self.cfg.interval}")
        default_interval = _INTERVAL_SECONDS.get(self.cfg.interval.lower(), 300)
        env_poll = os.environ.get("STOCKBOT_LIVE_POLL_SECONDS")
        if env_poll:
            try:
                self.poll_interval = max(10, int(env_poll))
            except ValueError:
                logger.warning("Invalid STOCKBOT_LIVE_POLL_SECONDS=%s, using default", env_poll)
                self.poll_interval = max(30, default_interval)
        else:
            self.poll_interval = max(30, default_interval)

        indicators = tuple(getattr(self.cfg.features, "indicators", ()) or ())
        self.indicators = indicators
        self.feature_columns = _BASE_COLUMNS + _expand_indicators(indicators)

        self.provider = ProviderManager.get_provider(self.broker, self.credentials)
        self.broker_adapter = LiveBrokerAdapter(self.provider, self.cfg.fees)
        self.policy = PPO.load(self.policy_path)

        self.guardrails = LiveGuardrails()
        self._ret_window: collections.deque[float] = collections.deque(maxlen=200)
        self._turnover_window: collections.deque[float] = collections.deque(maxlen=100)
        self._equity_peak: Optional[float] = None
        self._prev_equity: Optional[float] = None
        self._prev_weights: Optional[np.ndarray] = None
        self._stage: float = 0.0
        self._halted: bool = False

        self.telemetry_path = self.run_dir / "live_telemetry.jsonl"
        self.events_path = self.run_dir / "live_events.jsonl"

        self.started_at = _now_utc()
        self._status: Dict[str, object] = {
            "status": "starting",
            "session_id": self.session_id,
            "broker": self.broker,
            "run_id": self.run_id,
            "message": "Bootstrapping live session",
            "started_at": self.started_at.isoformat(),
            "last_update": self.started_at.isoformat(),
        }

        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._run_loop, name=f"LiveRunner-{self.session_id}", daemon=True)
        self._order_seq = 0

    # ---------------------------- public API ----------------------------
    def start(self) -> None:
        logger.info("[LiveRunner] Starting session %s for broker=%s", self.session_id, self.broker)
        self._thread.start()

    def stop(self) -> Dict[str, object]:
        logger.info("[LiveRunner] Stopping session %s", self.session_id)
        self._stop_event.set()
        if self._thread.is_alive():
            self._thread.join(timeout=self.poll_interval + 5)
        return self.status()

    def status(self) -> Dict[str, object]:
        with self._lock:
            return json.loads(json.dumps(self._status))

    def is_running(self) -> bool:
        return self._thread.is_alive() and not self._stop_event.is_set()

    # ---------------------------- internals -----------------------------
    def _set_status(self, **updates: object) -> None:
        now_iso = _now_utc().isoformat()
        with self._lock:
            self._status.update(updates)
            self._status["last_update"] = now_iso

    def _run_loop(self) -> None:
        self._set_status(status="running", message="Session active")
        _write_jsonl(self.events_path, {
            "ts": self.started_at.isoformat(),
            "event": "session_started",
            "session_id": self.session_id,
            "symbols": self.symbols,
        })

        while not self._stop_event.is_set():
            loop_start = time.time()
            try:
                snapshot = self._collect_snapshot()
                stage, halted = self._update_guardrails(snapshot)
                target_weights = self._infer_weights(snapshot)
                effective_weights = self._apply_stage(target_weights, stage)
                orders = []
                fills = []
                if not halted and self._should_trade(effective_weights, snapshot):
                    orders = self._build_orders(effective_weights, snapshot)
                    if orders:
                        fills = self.broker_adapter.place_orders(orders)
                        self._record_order_events(orders, fills)
                self._record_turnover(effective_weights)
                self._prev_weights = effective_weights
                self._emit_telemetry(snapshot, effective_weights, stage, halted, orders, fills)
                self._set_status(
                    status="running" if not halted else "halted",
                    message="Guardrails halted trading" if halted else "Session active",
                    stage=stage,
                    halted=halted,
                    equity=float(snapshot.equity),
                    cash=float(snapshot.cash),
                    target_weights={sym: float(round(effective_weights[i], 6)) for i, sym in enumerate(self.symbols)},
                    current_weights={sym: float(val) for sym, val in snapshot.weights.items()},
                    positions={sym: float(val) for sym, val in snapshot.positions_qty.items()},
                )
            except Exception as exc:  # pragma: no cover - defensive guard
                logger.exception("[LiveRunner] loop error: %s", exc)
                self._set_status(status="error", message=str(exc))
                _write_jsonl(self.events_path, {
                    "ts": _now_utc().isoformat(),
                    "event": "error",
                    "detail": str(exc),
                })
            finally:
                elapsed = time.time() - loop_start
                wait_sec = max(5.0, self.poll_interval - elapsed)
                if self._stop_event.wait(wait_sec):
                    break

        self._set_status(status="stopped", message="Session stopped", halted=self._halted)
        _write_jsonl(self.events_path, {
            "ts": _now_utc().isoformat(),
            "event": "session_stopped",
            "session_id": self.session_id,
        })

    # ------------------------------------------------------------------
    # Snapshots & inference
    # ------------------------------------------------------------------
    def _collect_snapshot(self) -> MarketSnapshot:
        end = _now_utc()
        interval_seconds = _INTERVAL_SECONDS.get(self.cfg.interval.lower(), 300)
        span = timedelta(seconds=interval_seconds * (self.lookback + 5))
        start = end - span

        frames: Dict[str, pd.DataFrame] = {}
        for sym in self.symbols:
            raw = self.provider.get_historical_data(sym, start=start, end=end, timeframe=self.timeframe)
            if not raw:
                raise LiveRunnerError(f"No bars returned for {sym}")
            df = pd.DataFrame(raw)
            if "t" in df.columns:
                df["ts"] = pd.to_datetime(df["t"], utc=True)
            elif "timestamp" in df.columns:
                df["ts"] = pd.to_datetime(df["timestamp"], utc=True)
            else:
                raise LiveRunnerError(f"Bars response missing timestamp for {sym}")
            rename = {
                "o": "open",
                "h": "high",
                "l": "low",
                "c": "close",
                "v": "volume",
                "Open": "open",
                "High": "high",
                "Low": "low",
                "Close": "close",
                "Volume": "volume",
            }
            df = df.rename(columns=rename)
            missing = [col for col in _BASE_COLUMNS if col not in df.columns]
            if missing:
                raise LiveRunnerError(f"Bars missing columns {missing} for {sym}")
            df = df.sort_values("ts").set_index("ts")
            feat = compute_indicators(df, self.indicators)
            frames[sym] = feat

        aligned_index = None
        for df in frames.values():
            aligned_index = df.index if aligned_index is None else aligned_index.intersection(df.index)
        if aligned_index is None or len(aligned_index) < self.lookback:
            raise LiveRunnerError("Insufficient overlapping history for live observation")

        aligned_index = aligned_index[-(self.lookback + 1):]
        for sym in frames:
            frames[sym] = frames[sym].reindex(aligned_index).dropna()
            if len(frames[sym]) < self.lookback:
                raise LiveRunnerError(f"Not enough rows after alignment for {sym}")

        cols = [col for col in self.feature_columns if col in frames[self.symbols[0]].columns]
        if len(cols) < len(self.feature_columns):
            missing = set(self.feature_columns) - set(cols)
            if missing:
                logger.debug("[LiveRunner] Missing live indicators for %s", sorted(missing))
        window_slices = []
        for sym in self.symbols:
            arr = frames[sym][cols].iloc[-self.lookback:].to_numpy(dtype=np.float32)
            window_slices.append(arr)
        window = np.transpose(np.stack(window_slices, axis=0), (1, 0, 2)).astype(np.float32)

        prices = {sym: float(frames[sym]["close"].iloc[-1]) for sym in self.symbols}
        last_bar_ts = int(frames[self.symbols[0]].index[-1].timestamp())

        account = self.provider.get_account()
        positions_raw = self.provider.get_positions()
        equity = float(account.get("portfolio_value") or account.get("equity") or 0.0)
        cash = float(account.get("cash", 0.0))
        if equity <= 0:
            raise LiveRunnerError("Broker returned non-positive equity")

        if self._equity_peak is None:
            self._equity_peak = equity
        else:
            self._equity_peak = max(self._equity_peak, equity)

        positions_qty: Dict[str, float] = {}
        weights: Dict[str, float] = {}
        for item in positions_raw:
            sym = item.get("symbol")
            if not sym:
                continue
            qty = float(item.get("qty") or item.get("quantity") or 0.0)
            side = (item.get("side") or "long").lower()
            if side == "short":
                qty = -abs(qty)
            price_ref = prices.get(sym)
            if price_ref is None:
                continue
            positions_qty[sym] = qty
            weights[sym] = float(qty * price_ref / equity)

        portfolio_vec = self._build_portfolio_vec(account, equity, cash, weights)

        returns_fraction = 0.0
        if self._prev_equity is not None and self._prev_equity > 0:
            returns_fraction = (equity - self._prev_equity) / max(self._prev_equity, 1e-9)
        self._prev_equity = equity
        self._ret_window.append(returns_fraction)

        return MarketSnapshot(
            window=window,
            portfolio_vec=portfolio_vec,
            prices=prices,
            positions_qty=positions_qty,
            weights={sym: weights.get(sym, 0.0) for sym in self.symbols},
            equity=equity,
            cash=cash,
            last_bar_ts=last_bar_ts,
            returns_fraction=returns_fraction,
        )

    def _build_portfolio_vec(
        self,
        account: Dict[str, object],
        equity: float,
        cash: float,
        weights: Dict[str, float],
    ) -> np.ndarray:
        cash_frac = float(np.clip(cash / max(equity, 1e-9), -10.0, 10.0))
        gross = float(sum(abs(w) for w in weights.values()))
        unreal = float(account.get("unrealized_pl", 0.0))
        realized = float(account.get("realized_pl", 0.0))
        start_equity = float(account.get("last_equity", equity) or equity)
        unreal_frac = unreal / max(start_equity, 1e-9)
        realized_frac = realized / max(start_equity, 1e-9)

        drawdown = 0.0
        if self._equity_peak:
            drawdown = max(0.0, (self._equity_peak - equity) / max(self._equity_peak, 1e-9))

        vol = float(np.std(self._ret_window)) if len(self._ret_window) > 5 else 0.0
        turnover = float(self._turnover_window[-1] if self._turnover_window else 0.0)

        weights_array = np.array([weights.get(sym, 0.0) for sym in self.symbols], dtype=np.float32)
        base = np.array([
            cash_frac,
            gross,
            drawdown,
            unreal_frac,
            realized_frac,
            vol,
            turnover,
        ], dtype=np.float32)
        return np.concatenate((base, weights_array)).astype(np.float32)

    def _update_guardrails(self, snapshot: MarketSnapshot) -> tuple[float, bool]:
        now_ts = int(_now_utc().timestamp())
        sharpe = 0.0
        if len(self._ret_window) > 10:
            mean = float(np.mean(self._ret_window))
            std = float(np.std(self._ret_window))
            if std > 1e-9:
                sharpe = mean / std * math.sqrt(len(self._ret_window))
        hitrate = float(sum(r > 0 for r in self._ret_window)) / max(len(self._ret_window), 1)
        max_dd_pct = 0.0
        if self._equity_peak:
            max_dd_pct = max(max_dd_pct, (self._equity_peak - snapshot.equity) / max(self._equity_peak, 1e-9) * 100.0)

        metrics = {
            "sharpe": sharpe,
            "hitrate": hitrate,
            "slippage_bps": 0.0,
            "max_daily_dd_pct": max_dd_pct,
        }
        stage = self.guardrails.record(metrics, snapshot.last_bar_ts, now_ts, broker_ok=True)
        self._stage = float(stage)
        self._halted = bool(self.guardrails.state.halted)
        return self._stage, self._halted

    def _infer_weights(self, snapshot: MarketSnapshot) -> np.ndarray:
        obs = {
            "window": snapshot.window,
            "portfolio": snapshot.portfolio_vec,
        }
        action, _ = self.policy.predict(obs, deterministic=True)
        action = np.asarray(action, dtype=np.float32).reshape(-1)
        if self.cfg.episode.mapping_mode == "simplex_cash":
            asset_logits = action[:-1]
            gate_logit = action[-1]
            invest_frac = float(1.0 / (1.0 + math.exp(-float(gate_logit)))) * float(getattr(self.cfg.episode, "invest_max", 1.0))
            shifted = asset_logits - float(np.max(asset_logits))
            exp = np.exp(shifted)
            alloc = exp / (np.sum(exp) + 1e-9)
            weights = invest_frac * alloc
            if self._prev_weights is not None and self._prev_weights.shape == weights.shape:
                delta = np.clip(
                    weights - self._prev_weights,
                    -float(getattr(self.cfg.episode, "max_step_change", 0.10)),
                    float(getattr(self.cfg.episode, "max_step_change", 0.10)),
                )
                weights = self._prev_weights + delta
        else:
            weights = np.tanh(action)
            gross = np.sum(np.abs(weights)) + 1e-9
            cap = float(getattr(self.cfg.margin, "max_gross_leverage", 1.0))
            if gross > cap:
                weights = weights * (cap / gross)
        if not getattr(self.cfg.episode, "allow_short", True):
            weights = np.clip(weights, 0.0, None)
        cap_w = float(getattr(self.cfg.margin, "max_position_weight", 1.0))
        weights = np.clip(weights, -cap_w, cap_w)
        return weights.astype(np.float32)

    def _apply_stage(self, weights: np.ndarray, stage: float) -> np.ndarray:
        if stage <= 0:
            return np.zeros_like(weights)
        gross = float(np.sum(np.abs(weights)))
        if gross <= 1e-9:
            return weights
        scale = min(1.0, stage / max(gross, 1e-9))
        return (weights * scale).astype(np.float32)

    def _should_trade(self, weights: np.ndarray, snapshot: MarketSnapshot) -> bool:
        if self._halted or np.sum(np.abs(weights)) <= 1e-6:
            return False
        if math.isclose(snapshot.equity, 0.0, abs_tol=1e-2):
            return False
        return True

    def _build_orders(self, target_weights: np.ndarray, snapshot: MarketSnapshot) -> List[Order]:
        orders: List[Order] = []
        equity = snapshot.equity
        lot_size = float(getattr(self.cfg.exec, "lot_size", 1.0))
        for idx, sym in enumerate(self.symbols):
            price = snapshot.prices.get(sym)
            if not price or price <= 0:
                continue
            target_notional = float(target_weights[idx]) * equity
            target_qty = target_notional / price
            current_qty = snapshot.positions_qty.get(sym, 0.0)
            delta_qty = target_qty - current_qty
            notional_change = abs(delta_qty) * price
            if notional_change < _MIN_NOTIONAL:
                continue
            if lot_size >= 1.0:
                qty_units = int(round(delta_qty))
                if qty_units == 0:
                    qty_units = 1 if delta_qty > 0 else -1
                qty = float(qty_units)
            else:
                qty = round(delta_qty / lot_size) * lot_size
            if qty == 0:
                continue
            side = "buy" if qty > 0 else "sell"
            orders.append(Order(
                id=self._next_order_id(),
                ts_submitted=_now_utc(),
                symbol=sym,
                side=side,
                qty=abs(qty),
                tif="DAY",
            ))
        return orders

    def _record_turnover(self, target_weights: np.ndarray) -> None:
        if self._prev_weights is None:
            self._turnover_window.append(float(np.sum(np.abs(target_weights))))
        else:
            delta = float(np.sum(np.abs(target_weights - self._prev_weights)))
            self._turnover_window.append(delta)

    def _emit_telemetry(
        self,
        snapshot: MarketSnapshot,
        target_weights: np.ndarray,
        stage: float,
        halted: bool,
        orders: Sequence[Order],
        fills: Sequence,
    ) -> None:
        payload = {
            "ts": _now_utc().isoformat(),
            "session_id": self.session_id,
            "stage": stage,
            "halted": halted,
            "equity": snapshot.equity,
            "cash": snapshot.cash,
            "target_weights": {sym: float(round(target_weights[i], 6)) for i, sym in enumerate(self.symbols)},
            "current_weights": snapshot.weights,
            "positions": snapshot.positions_qty,
            "orders": [
                {
                    "symbol": o.symbol,
                    "side": o.side,
                    "qty": float(o.qty),
                }
                for o in orders
            ],
            "fills": [
                {
                    "symbol": getattr(f, "symbol", None),
                    "qty": float(getattr(f, "qty", 0.0)),
                    "price": float(getattr(f, "price", 0.0)),
                }
                for f in fills
            ],
        }
        _write_jsonl(self.telemetry_path, payload)

    def _record_order_events(self, orders: Sequence[Order], fills: Sequence) -> None:
        ts = _now_utc().isoformat()
        for order in orders:
            _write_jsonl(self.events_path, {
                "ts": ts,
                "event": "order_submitted",
                "symbol": order.symbol,
                "side": order.side,
                "qty": float(order.qty),
            })
        for fill in fills:
            _write_jsonl(self.events_path, {
                "ts": ts,
                "event": "fill",
                "symbol": getattr(fill, "symbol", None),
                "qty": float(getattr(fill, "qty", 0.0)),
                "price": float(getattr(fill, "price", 0.0)),
            })

    def _next_order_id(self) -> int:
        self._order_seq += 1
        return self._order_seq


class LiveTradingManager:
    """Singleton-style manager coordinating a single live session."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._session: Optional[LiveTradingSession] = None

    def start_session(
        self,
        *,
        broker: str,
        credentials: Dict[str, str],
        env_config: EnvConfig,
        policy_path: Path,
        run_dir: Path,
        run_id: Optional[str] = None,
    ) -> Dict[str, object]:
        with self._lock:
            if self._session and self._session.is_running():
                raise LiveRunnerError("A live session is already running")
            session_id = f"live-{int(time.time())}"
            session = LiveTradingSession(
                session_id=session_id,
                broker=broker,
                credentials=credentials,
                env_config=env_config,
                policy_path=policy_path,
                run_dir=run_dir,
                run_id=run_id,
            )
            session.start()
            self._session = session
            return session.status()

    def stop_session(self) -> Dict[str, object]:
        with self._lock:
            if not self._session:
                return {"status": "idle"}
            status = self._session.stop()
            self._session = None
            return status

    def status(self) -> Dict[str, object]:
        with self._lock:
            if not self._session:
                return {"status": "idle"}
            return self._session.status()


_GLOBAL_MANAGER: Optional[LiveTradingManager] = None

def ensure_manager() -> LiveTradingManager:
    global _GLOBAL_MANAGER
    if _GLOBAL_MANAGER is None:
        _GLOBAL_MANAGER = LiveTradingManager()
    return _GLOBAL_MANAGER
