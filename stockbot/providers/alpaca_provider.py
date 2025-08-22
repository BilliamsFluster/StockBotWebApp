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

    # --- Account activities / transactions ---
    def get_transactions(
        self,
        lookback_days: int = 365,
        activity_types: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve recent account activities.

        The Alpaca `/v2/account/activities` endpoint returns fills, dividends,
        transfers, etc. This helper fetches up to 100 activities within a
        configurable lookback window and optionally filters by type.
        """

        start = datetime.utcnow() - timedelta(days=lookback_days)
        params: Dict[str, Any] = {
            "after": start.strftime("%Y-%m-%d"),
            "page_size": 100,
            "direction": "desc",
        }
        if activity_types:
            params["activity_types"] = ",".join(activity_types)

        data = self._request("GET", "/v2/account/activities", params=params)
        return data if isinstance(data, list) else []

    # --- Unified Portfolio Method for Frontend ---
    def get_portfolio_data(self) -> dict:
        """
        Combines account summary and positions into a single portfolio object.
        Matches the structure expected by the frontend.
        """
        account = self.get_account()
        raw_positions = self.get_positions()
        try:
            raw_transactions = self.get_transactions()
        except Exception:
            raw_transactions = []

        summary = {
            "accountNumber": account.get("account_number", "—"),
            "liquidationValue": float(account.get("portfolio_value", 0)),
            "equity": float(account.get("equity", 0)),
            "cash": float(account.get("cash", 0)),
            "buyingPower": float(account.get("buying_power", 0)),
            "dayTradingBuyingPower": float(account.get("daytrading_buying_power", 0)),
        }

        # ✅ Normalize positions to a common structure for the frontend
        positions = []
        for pos in raw_positions:
            try:
                positions.append({
                    "symbol": pos.get("symbol", ""),
                    "qty": float(pos.get("qty", 0)),
                    "price": float(pos.get("avg_entry_price", 0)),
                    "marketValue": float(pos.get("market_value", 0)),
                    "dayPL": float(pos.get("unrealized_intraday_pl", 0)),
                    "totalPL": float(pos.get("unrealized_pl", 0)),
                })
            except Exception:
                continue

        # ✅ Normalize account activities into transactions
        transactions: List[Dict[str, Any]] = []
        for act in raw_transactions:
            try:
                activity_type = act.get("activity_type", "").upper()
                symbol = act.get("symbol") or "USD"

                if activity_type == "FILL":
                    qty = float(act.get("qty", 0))
                    side = act.get("side", "").lower()
                    price_val = act.get("price")
                    price = float(price_val) if price_val is not None else None
                    quantity = qty if side == "buy" else -qty
                    amount = qty * (price or 0)
                    if side == "buy":
                        amount *= -1
                    tx_price = price
                else:
                    amount = float(act.get("net_amount", 0))
                    quantity = float(act.get("qty", amount))
                    tx_price = (
                        float(act.get("price", 0))
                        if act.get("price") is not None
                        else 0
                    )

                transactions.append(
                    {
                        "id": act.get("id"),
                        "date": act.get("transaction_time") or act.get("date"),
                        "symbol": symbol,
                        "type": "TRADE" if activity_type == "FILL" else activity_type,
                        "quantity": quantity,
                        "amount": amount,
                        "price": tx_price,
                    }
                )
            except Exception:
                continue

        return {
            "summary": summary,
            "positions": positions,
            "transactions": transactions,
        }
