from dataclasses import dataclass
from typing import Optional, Literal
from datetime import datetime

Side = Literal["buy","sell"]
OrderType = Literal["market","limit"]
TIF = Literal["DAY","IOC","FOK"]

@dataclass
class Order:
    id: int
    ts_submitted: datetime
    symbol: str
    side: Side
    qty: float
    type: OrderType = "market"
    limit_price: Optional[float] = None
    tif: TIF = "DAY"

@dataclass
class Fill:
    order_id: int
    symbol: str
    qty: float
    price: float
    commission: float
