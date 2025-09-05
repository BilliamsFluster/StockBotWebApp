from dataclasses import dataclass
from typing import Dict


@dataclass
class CostParams:
    commission_per_share: float
    taker_fee_bps: float
    maker_rebate_bps: float
    half_spread_bps: float
    impact_k: float


def apply_costs(
    planned_price: float,
    side: str,
    is_taker: bool,
    qty: float,
    cost: CostParams,
    participation: float,
) -> Dict:
    """Apply transaction costs and return realized metrics.

    The function returns the realized price, total cost in dollars and bps, and
    a breakdown of the individual components.  The model is intentionally
    lightweight but captures the key effects required for unit testing.
    """
    notional = planned_price * qty
    commission = cost.commission_per_share * abs(qty)
    spread = cost.half_spread_bps / 10000.0 * abs(notional) * 2.0
    fee_rate = cost.taker_fee_bps if is_taker else cost.maker_rebate_bps
    fees = fee_rate / 10000.0 * abs(notional)
    impact = cost.impact_k * (participation ** 0.5) / 10000.0 * abs(notional)
    total_cost = commission + spread + fees + impact

    sign = 1 if side == "buy" else -1
    realized_price = planned_price + sign * (spread + impact) / abs(qty)
    cost_bps = (total_cost / abs(notional)) * 10000 if notional != 0 else 0.0
    return {
        "realized_price": realized_price,
        "cost_bps": cost_bps,
        "cost_$": total_cost,
        "breakdown": {
            "commission": commission,
            "spread": spread,
            "fees": fees,
            "impact": impact,
        },
    }
