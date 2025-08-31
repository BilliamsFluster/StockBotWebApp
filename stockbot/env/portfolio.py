from dataclasses import dataclass, field
from typing import Dict
import numpy as np
from .orders import Fill
from .config import MarginConfig, FeeModel

@dataclass
class Position:
    qty: float = 0.0
    avg_cost: float = 0.0

@dataclass
class Portfolio:
    cash: float
    margin: MarginConfig
    fees: FeeModel
    positions: Dict[str, Position] = field(default_factory=dict)
    equity_peak: float = 0.0
    short_market_value: float = 0.0

    def value(self, prices: Dict[str,float]) -> float:
        pv = sum(pos.qty * prices[sym] for sym,pos in self.positions.items())
        return self.cash + pv

    def gross_exposure(self, prices: Dict[str,float], equity: float) -> float:
        if equity <= 0: return np.inf
        gross = sum(abs(pos.qty * prices[sym]) for sym,pos in self.positions.items())
        return gross / equity

    def net_exposure(self, prices: Dict[str,float], equity: float) -> float:
        """Return net dollar exposure (long minus short) as fraction of equity."""
        if equity == 0:
            return 0.0
        net = sum(pos.qty * prices[sym] for sym, pos in self.positions.items())
        return net / equity

    def weights(self, prices: Dict[str,float]) -> Dict[str,float]:
        eq = max(1e-9, self.value(prices))
        return {sym: (pos.qty*prices[sym])/eq for sym,pos in self.positions.items()}

    def apply_fills(self, fills: list[Fill]):
        for f in fills:
            pos = self.positions.setdefault(f.symbol, Position())
            # update avg cost (VWAP-style)
            new_qty = pos.qty + f.qty
            if abs(new_qty) < 1e-9:
                pos.qty, pos.avg_cost = 0.0, 0.0
            else:
                if pos.qty == 0:
                    pos.avg_cost = f.price
                else:
                    # if crossing through zero, avg_cost resets
                    if (pos.qty > 0 and f.qty < 0 and new_qty < 0) or (pos.qty < 0 and f.qty > 0 and new_qty > 0):
                        pos.avg_cost = f.price
                    else:
                        pos.avg_cost = (pos.qty*pos.avg_cost + f.qty*f.price) / new_qty
                pos.qty = new_qty
            # cash decreases on buy, increases on sell; always pay commission
            self.cash -= f.qty * f.price + f.commission

    def step_interest(self, prices: Dict[str, float], dt_years: float):
        # charge interest on negative cash
        if self.cash < 0:
            self.cash *= (1.0 + self.margin.cash_borrow_apr * dt_years)

        # borrow fees on short positions
        self.short_market_value = sum(
            -pos.qty * prices[sym]
            for sym, pos in self.positions.items()
            if pos.qty < 0
        )
        if self.short_market_value > 0:
            self.cash -= self.short_market_value * self.fees.borrow_fee_apr * dt_years

    def update_peak(self, equity: float):
        self.equity_peak = max(self.equity_peak, equity)

    def drawdown(self, equity: float) -> float:
        return 0.0 if self.equity_peak <= 0 else 1.0 - (equity / self.equity_peak)
