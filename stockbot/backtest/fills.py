from typing import Dict, List, Literal

import numpy as np


def plan_fills(
    target_w_prev: np.ndarray,
    target_w_new: np.ndarray,
    nav: float,
    prices_next: np.ndarray,
    adv_next: np.ndarray,
    policy: Literal["next_open", "vwap_window"],
    max_participation: float,
) -> List[Dict]:
    """Plan fills between two weight vectors.

    The implementation is intentionally simple and assumes all orders are
    executed at the next bar's open price.  ``vwap_window`` behaves the same as
    ``next_open`` but is included for API completeness.
    """
    diff = target_w_new - target_w_prev
    orders: List[Dict] = []

    for i, d in enumerate(diff):
        if abs(d) < 1e-12:
            continue
        qty_intended = nav * d / prices_next[i]
        qty = qty_intended
        side = "buy" if qty > 0 else "sell"
        notional = abs(qty * prices_next[i])
        participation_intended = 0.0 if adv_next[i] == 0 else notional / adv_next[i]
        participation = participation_intended
        if participation > max_participation and adv_next[i] > 0:
            capped_notional = max_participation * adv_next[i]
            qty = capped_notional / prices_next[i] * np.sign(qty)
            participation = max_participation
        orders.append(
            {
                "symbol_idx": i,
                "side": side,
                "qty": float(qty),
                "qty_intended": float(qty_intended),
                "planned_price": float(prices_next[i]),
                "participation": float(participation),
                "participation_intended": float(participation_intended),
            }
        )
    return orders
