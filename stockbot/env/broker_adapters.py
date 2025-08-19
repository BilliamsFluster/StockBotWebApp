from __future__ import annotations
from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple, Literal, Any
from datetime import datetime
import math

from .orders import Order, Fill, OrderType, Side, TIF
from .config import ExecConfig, FeeModel

# Your providers:
# from stockbot.broker.alpaca_provider import AlpacaProvider
# from stockbot.broker.schwab_provider import SchwabProvider
# from stockbot.broker.base_provider import BaseProvider

@dataclass
class SubmitResult:
    order_id: str
    raw: Any

class BrokerAdapterBase:
    """Common surface for brokers (sim/live)."""

    def place_orders(self, orders: List[Order]) -> List[Fill]:
        """Synchronous fills (sim) or best-effort immediate fills (paper/live).
        For live, most brokers are async; we return empty fills and rely on
        the broker to confirm later. For paper we try to fill synchronously when possible.
        """
        raise NotImplementedError

    # Optional utilities for control/inspection
    def cancel_all(self) -> None: ...
    def get_open_orders(self) -> List[Dict[str, Any]]: return []
    def prices_now(self) -> Dict[str, float]: return {}
    def volumes_now(self) -> Dict[str, float]: return {}

# ------------------------------
# Sim broker (used by env/backtests)
# ------------------------------

class SimBroker(BrokerAdapterBase):
    """Tied to your ExecutionModel + 'next bar' snapshot provider."""
    def __init__(self, exec_model, get_next_bar):
        self.exec = exec_model
        self._get_next_bar = get_next_bar

    def place_orders(self, orders: List[Order]) -> List[Fill]:
        prices, volumes = self._get_next_bar()  # dicts: symbol -> (O,H,L,C), symbol -> vol
        return self.exec.simulate_fills(orders, prices, volumes)

# ------------------------------
# Live/Paper broker adapter
# ------------------------------

class LiveBrokerAdapter(BrokerAdapterBase):
    """Wraps your BaseProvider (AlpacaProvider or SchwabProvider)."""

    def __init__(
        self,
        provider,              # BaseProvider subclass
        fees: FeeModel,
        default_tif: TIF = "DAY",
        qty_rounding: int = 0  # equities share precision
    ):
        self.p = provider
        self.fees = fees
        self.default_tif = default_tif
        self.qty_rounding = qty_rounding

        # Capabilities
        self.cap_submit = hasattr(self.p, "submit_order")
        self.cap_cancel = hasattr(self.p, "cancel_order")
        self.cap_open   = hasattr(self.p, "get_orders")

    # ---------- Public API ----------

    def place_orders(self, orders: List[Order]) -> List[Fill]:
        if not self.cap_submit:
            # SchwabProvider currently has no submit_order; raise a clear error
            raise NotImplementedError(f"{self.p.__class__.__name__} has no submit_order() implemented.")

        fills: List[Fill] = []
        for o in orders:
            sub = self._submit_single(o)
            # Live brokers are async; we do not have fills yet.
            # You can poll later and translate to Fill objects when fills arrive.
            # Here we return an empty list to signal "accepted".
            # If you want a synchronous paper fill against latest price, uncomment below:
            # px = self.p.get_current_price(o.symbol)
            # commission = self._commission(abs(o.qty), px)
            # fills.append(Fill(order_id=-1, symbol=o.symbol, qty=o.qty, price=px, commission=commission))
        return fills

    def cancel_all(self) -> None:
        if not self.cap_open or not self.cap_cancel:
            return
        try:
            open_orders = self.p.get_orders(status="open")
            for od in open_orders:
                _id = od.get("id") or od.get("order_id") or od.get("client_order_id")
                if _id:
                    try:
                        self.p.cancel_order(_id)
                    except Exception:
                        pass
        except Exception:
            pass

    def get_open_orders(self) -> List[Dict[str, Any]]:
        if not self.cap_open:
            return []
        try:
            return self.p.get_orders(status="open")
        except Exception:
            return []

    # ---------- Internals ----------

    def _commission(self, qty: float, price: float) -> float:
        notional = abs(qty) * price
        return self.fees.commission_per_share * abs(qty) + self.fees.commission_pct_notional * notional

    def _round_qty(self, qty: float) -> int | float:
        if self.qty_rounding > 0:
            return round(qty, self.qty_rounding)
        return int(round(qty))  # equities default

    def _submit_single(self, o: Order) -> SubmitResult:
        side = "buy" if o.side == "buy" else "sell"
        tif  = (o.tif or self.default_tif)

        # Alpaca-specific payload (works out of the box)
        if self.p.__class__.__name__ == "AlpacaProvider":
            typ = "market" if o.type == "market" else "limit"
            body = {
                "symbol": o.symbol,
                "qty": self._round_qty(abs(o.qty)),
                "side": side,
                "type_": typ,
                "time_in_force": tif,
            }
            if typ == "limit":
                if o.limit_price is None:
                    raise ValueError("limit order requires limit_price")
                body["limit_price"] = float(o.limit_price)
            resp = self.p.submit_order(**body)
            oid = str(resp.get("id") or resp.get("client_order_id") or "")
            return SubmitResult(order_id=oid, raw=resp)

        # Schwab-specific: you need to implement submit_order() in your SchwabProvider.
        # The adapter will call it here in the same signature as Alpaca:
        if self.p.__class__.__name__ == "SchwabProvider":
            if not hasattr(self.p, "submit_order"):
                raise NotImplementedError("SchwabProvider.submit_order() not implemented yet.")
            typ = "market" if o.type == "market" else "limit"
            body = {
                "symbol": o.symbol,
                "qty": self._round_qty(abs(o.qty)),
                "side": side,
                "type_": typ,
                "time_in_force": tif,
            }
            if typ == "limit":
                if o.limit_price is None:
                    raise ValueError("limit order requires limit_price")
                body["price"] = float(o.limit_price)
            resp = self.p.submit_order(**body)
            oid = str(resp.get("orderId") or resp.get("id") or "")
            return SubmitResult(order_id=oid, raw=resp)

        # Generic BaseProvider fallback (if you add another provider later)
        if hasattr(self.p, "submit_order"):
            resp = self.p.submit_order(
                symbol=o.symbol,
                qty=self._round_qty(abs(o.qty)),
                side=side,
                type_="market" if o.type == "market" else "limit",
                time_in_force=tif,
                **({"limit_price": float(o.limit_price)} if o.type == "limit" else {})
            )
            oid = str(resp.get("id") or resp.get("orderId") or "")
            return SubmitResult(order_id=oid, raw=resp)

        raise NotImplementedError("Provider missing submit_order()")
