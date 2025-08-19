from typing import List, Dict, Tuple
import math
from .orders import Order, Fill
from .config import ExecConfig, FeeModel

class ExecutionModel:
    def __init__(self, exec_cfg: ExecConfig, fees: FeeModel, participation_cap: float | None = None):
        self.cfg = exec_cfg
        self.fees = fees

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
            O,H,L,C = next_bar_prices[o.symbol]
            V = max(1.0, float(next_bar_volumes[o.symbol]))
            max_qty = cap * V if cap and cap > 0 else abs(o.qty)
            qty = max(-max_qty, min(o.qty, max_qty))  # clamp to POV

            if abs(qty) < 1e-8:
                continue

            if o.type == "market":
                # slippage bps around open
                slip = (self.fees.slippage_bps * 1e-4) * math.copysign(1.0, qty)
                px = O * (1.0 + slip)
                fills.append(Fill(o.id, o.symbol, qty, px, self._commission(qty, px)))
            else:
                # LIMIT: execute if price crosses
                if qty > 0:  # buy
                    # Buy if next bar trades at/below limit
                    if O <= o.limit_price:      # gap down through limit: fill at open
                        px = O
                    elif L <= o.limit_price <= H:
                        px = o.limit_price
                    else:
                        continue
                else:        # sell
                    if O >= o.limit_price:
                        px = O
                    elif L <= o.limit_price <= H:
                        px = o.limit_price
                    else:
                        continue
                fills.append(Fill(o.id, o.symbol, qty, px, self._commission(qty, px)))
        return fills
