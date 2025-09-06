from typing import List, Dict, Tuple
import math
import statistics
from collections import defaultdict, deque
from .orders import Order, Fill
from .config import ExecConfig, FeeModel

class ExecutionModel:
    def __init__(self, exec_cfg: ExecConfig, fees: FeeModel, participation_cap: float | None = None):
        self.cfg = exec_cfg
        self.fees = fees
        self._hist: Dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=self.cfg.vol_lookback))

    def _commission(self, qty: float, price: float) -> float:
        notional = abs(qty) * price
        return self.fees.commission_per_share * abs(qty) + self.fees.commission_pct_notional * notional

    def simulate_fills(
        self,
        orders: List[Order],
        next_bar_prices: Dict[str, Tuple[float,float,float,float]],  # O,H,L,C
        next_bar_volumes: Dict[str, float]
    ) -> List[Fill]:
        fills: List[Fill] = []
        cap = self.cfg.participation_cap
        for o in orders:
            O, H, L, C = next_bar_prices[o.symbol]
            V = max(1.0, float(next_bar_volumes[o.symbol]))
            max_qty = cap * V if cap and cap > 0 else abs(o.qty)
            qty = max(-max_qty, min(o.qty, max_qty))  # clamp to POV

            # lot-size rounding
            lot = max(1e-9, float(self.cfg.lot_size))
            qty = math.copysign(math.floor(abs(qty) / lot) * lot, qty)
            if abs(qty) < 1e-8:
                continue

            if o.type == "market":
                participation = abs(qty) / V
                spread_bps = self._spread_bps(o.symbol, O, H, L, C)
                vol_bps = self._volatility_bps(o.symbol)
                slip_bps = (spread_bps + vol_bps) * participation
                slip = (slip_bps * 1e-4) * math.copysign(1.0, qty)
                px = C * (1.0 + slip)
            else:
                # LIMIT: execute if price crosses
                if qty > 0:  # buy
                    if O <= o.limit_price:
                        px = O
                    elif L <= o.limit_price <= H:
                        px = o.limit_price
                    else:
                        continue
                else:  # sell
                    if O >= o.limit_price:
                        px = O
                    elif L <= o.limit_price <= H:
                        px = o.limit_price
                    else:
                        continue
            # tick rounding on price
            tick = max(1e-9, float(self.cfg.tick_size))
            px = round(px / tick) * tick
            fills.append(Fill(o.id, o.symbol, qty, px, self._commission(qty, px)))
        for sym, (_, _, _, close) in next_bar_prices.items():
            self._hist[sym].append(close)
        return fills

    def _spread_bps(self, sym: str, O: float, H: float, L: float, C: float) -> float:
        if getattr(self.cfg, "spread_source", "fee_model") == "hl":
            return ((H - L) / C) * 1e4 if C else 0.0
        return float(self.fees.slippage_bps)

    def _volatility_bps(self, sym: str) -> float:
        hist = self._hist[sym]
        if len(hist) < 2:
            return 0.0
        rets = [math.log(hist[i] / hist[i - 1]) for i in range(1, len(hist))]
        if len(rets) < 2:
            return 0.0
        vol = statistics.pstdev(rets)
        return vol * 1e4
