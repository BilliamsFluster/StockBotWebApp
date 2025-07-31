# alpaca_provider.py

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from base_provider import BaseProvider

class AlpacaProvider(BaseProvider):
    """
    Alpaca Trading API client for paper trading:
    - Uses trading API (paper-api.alpaca.markets) for account, orders, and assets.
    - Uses Market Data API (data.alpaca.markets) for trades/latest and historical bars with IEX feed.
    """
    def __init__(
        self,
        api_key: str,
        api_secret: str,
        base_url: str = "https://paper-api.alpaca.markets",
        data_url: str = "https://data.alpaca.markets",
        timeout: float = 5.0
    ):
        super().__init__(api_key=api_key, base_url=base_url, timeout=timeout)
        self.data_url = data_url
        self.session.headers.update({
            "APCA-API-KEY-ID": api_key,
            "APCA-API-SECRET-KEY": api_secret,
        })

    def _request(self, method: str, path: str,
             params: Optional[Dict[str, Any]] = None,
             data: Optional[Dict[str, Any]] = None,
             use_data_api: bool = False) -> Any:
        base = self.data_url if use_data_api else self.base_url
        resp = self.session.request(method, f"{base}{path}",
                                    params=params, json=data,
                                    timeout=self.timeout)
        resp.raise_for_status()

        # No content to parse
        if resp.status_code == 204 or not resp.text.strip():
            return None

        return resp.json()


    def get_assets(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {}
        if status:
            params["status"] = status
        return self._request("GET", "/v2/assets", params=params)

    def get_current_price(self, symbol: str) -> float:
        resp = self._request("GET", f"/v2/stocks/{symbol}/trades/latest", use_data_api=True)
        return float(resp["trade"]["p"])

    def get_historical_data(self,
                            symbol: str,
                            start: datetime,
                            end: datetime,
                            timeframe: str = "1H") -> List[Dict[str, Any]]:
        params = {
            "start": start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "end":   (end - timedelta(minutes=15)).astimezone(timezone.utc)
                       .isoformat().replace("+00:00", "Z"),
            "timeframe": timeframe,
            "feed": "iex"
        }
        resp = self._request("GET", f"/v2/stocks/{symbol}/bars", params=params, use_data_api=True)
        bars = resp.get("bars")
        return bars if bars else []

    def get_account(self) -> Dict[str, Any]:
        return self._request("GET", "/v2/account")

    def get_positions(self) -> List[Dict[str, Any]]:
        return self._request("GET", "/v2/positions")

    def get_orders(self, status: Optional[str] = None, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {}
        if status: params["status"] = status
        if limit: params["limit"] = limit
        return self._request("GET", "/v2/orders", params=params)

    def submit_order(self,
                     symbol: str,
                     qty: int,
                     side: str,
                     type_: str,
                     time_in_force: str,
                     **kwargs) -> Dict[str, Any]:
        body = {
            "symbol": symbol,
            "qty": qty,
            "side": side,
            "type": type_,
            "time_in_force": time_in_force,
            **kwargs
        }
        return self._request("POST", "/v2/orders", data=body)

    def cancel_order(self, order_id: str) -> None:
        self._request("DELETE", f"/v2/orders/{order_id}")

if __name__ == "__main__":
    import os
    from datetime import datetime, timezone, timedelta
    from alpaca_provider import AlpacaProvider

    API_KEY    = os.getenv("ALPACA_API_KEY", "PKYT80KONI3I0L40UGXU")
    API_SECRET = os.getenv("ALPACA_API_SECRET", "YQXDP3aoV7NY3gcBUnk45gYILWfTlt8RY0ghHNrg")
    BASE_URL   = os.getenv("ALPACA_BASE_URL", "https://paper-api.alpaca.markets")
    DATA_URL   = "https://data.alpaca.markets"

    provider = AlpacaProvider(api_key=API_KEY,
                              api_secret=API_SECRET,
                              base_url=BASE_URL,
                              data_url=DATA_URL,
                              timeout=10.0)

    now = datetime.now(timezone.utc)
    print("=== Testing AlpacaProvider ===")

    assets = provider.get_assets()
    print(f"Assets count: {len(assets)} – sample: {assets[:3]}")  # Uses /v2/assets trading API :contentReference[oaicite:1]{index=1}

    symbol = "AAPL"

    price = provider.get_current_price(symbol)
    print(f"{symbol} current price: {price}")  # Uses trades/latest from data API

    start = (now - timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    bars = provider.get_historical_data(symbol, start=start, end=now, timeframe="1H")
    print(f"Retrieved {len(bars)} bars – first timestamp: {bars[0]['t'] if bars else 'none'}")  # Handles null safety

    account = provider.get_account()
    print(f"Account status: {account.get('status')} | Equity: {account.get('equity')}")

    positions = provider.get_positions()
    print(f"Positions count: {len(positions)} – {positions}")

    order = provider.submit_order(symbol=symbol, qty=1, side="buy", type_="market", time_in_force="day")
    print(f"Order submitted: id={order.get('id')}")

    open_orders = provider.get_orders(status="open", limit=5)
    print(f"Open orders: {len(open_orders)} – {open_orders}")

    provider.cancel_order(order.get("id"))
    print(f"Cancelled order id={order.get('id')}")

    open_after = provider.get_orders(status="open", limit=5)
    print(f"Open orders after cancel: {len(open_after)}")

    print("✅ All API tests ran without errors.")
