# alpaca_provider.py

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from .base_provider import BaseProvider


class AlpacaProvider(BaseProvider):
    """
    Alpaca Trading API client for paper/live trading:
    - Switches base URLs automatically based on mode.
    - Uses Market Data API (data.alpaca.markets) for trades/latest and historical bars.
    """

    def __init__(
        self,
        app_key: str,
        app_secret: str,
        mode: str = "paper",  # "paper" or "live"
        timeout: float = 5.0
    ):
        # Pick base trading API based on mode
        if mode == "live":
            base_url = "https://api.alpaca.markets"
        else:
            base_url = "https://paper-api.alpaca.markets"

        data_url = "https://data.alpaca.markets"

        # Init BaseProvider with API key
        super().__init__(api_key=app_key, base_url=base_url, timeout=timeout)

        self.mode = mode
        self.data_url = data_url

        # Add Alpaca authentication headers
        self.session.headers.update({
            "APCA-API-KEY-ID": app_key,
            "APCA-API-SECRET-KEY": app_secret,
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

        if resp.status_code == 204 or not resp.text.strip():
            return None

        return resp.json()

    # --- Trading API Methods ---
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
        return resp.get("bars", [])

    def get_account(self) -> Dict[str, Any]:
        print(self.api_key)
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

    # --- Unified Portfolio Method for Frontend ---
    def get_portfolio_data(self) -> dict:
        """
        Combines account summary and positions into a single portfolio object.
        Matches the structure expected by the frontend.
        """
        account = self.get_account()
        positions = self.get_positions()

        summary = {
            "accountNumber": account.get("account_number", "—"),
            "liquidationValue": float(account.get("portfolio_value", 0)),
            "equity": float(account.get("equity", 0)),
            "cash": float(account.get("cash", 0)),
            "buyingPower": float(account.get("buying_power", 0)),
            "dayTradingBuyingPower": float(account.get("daytrading_buying_power", 0)),
        }

        return {
            "summary": summary,
            "positions": positions,
            "transactions": []  # Can integrate Alpaca transactions later
        }
