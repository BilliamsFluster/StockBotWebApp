# schwab_provider.py

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from .base_provider import BaseProvider


class SchwabProvider(BaseProvider):
    """
    SchwabProvider implements account, quotes, history, orders, transactions, etc.
    """

    def __init__(
        self,
        access_token: str,
        base_url: str = "https://api.schwabapi.com",
        timeout: float = 5.0,
        **kwargs
    ):
        super().__init__(api_key=access_token, base_url=base_url, timeout=timeout)
        self.account_number: Optional[str] = None
        self.access_token = access_token

        # ✅ Ensure Bearer token is used for all requests
        self.session.headers.update({
            "Authorization": f"Bearer {access_token}"
        })

    # ─────────────────────────────────────────────────────────────
    # Internal request helper
    # ─────────────────────────────────────────────────────────────
    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None
    ) -> Any:
        url = self._full_url(path)
        resp = self.session.request(method, url, params=params, json=data, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    # ─────────────────────────────────────────────────────────────
    # Required abstract methods from BaseProvider
    # ─────────────────────────────────────────────────────────────
    def get_current_price(self, symbol: str) -> float:
        """Returns the most recent close price for a given symbol."""
        data = self._request("GET", "marketdata/v1/quotes", params={"symbols": symbol})
        quote = data.get(symbol, {}).get("quote", {})
        return float(quote.get("closePrice", 0.0))

    def get_historical_data(
        self,
        symbol: str,
        start: datetime,
        end: datetime,
        period_type: str = "year",
        period: int = 1,
        frequency_type: str = "daily",
        frequency: int = 1,
        need_extended: bool = True
    ) -> List[Dict[str, Any]]:
        """Returns OHLCV historical candles for a symbol."""
        params = {
            "symbol": symbol,
            "startDate": int(start.timestamp() * 1000),
            "endDate": int(end.timestamp() * 1000),
            "periodType": period_type,
            "period": period,
            "frequencyType": frequency_type,
            "frequency": frequency,
            "needExtendedHoursData": str(need_extended).lower()
        }
        data = self._request("GET", "marketdata/v1/pricehistory", params=params)
        return data.get("candles", [])

    # ─────────────────────────────────────────────────────────────
    # Account & portfolio helpers
    # ─────────────────────────────────────────────────────────────
    def get_encrypted_account_map(self) -> Dict[str, str]:
        """Maps plain account numbers to their encrypted IDs."""
        data = self._request("GET", "trader/v1/accounts/accountNumbers")
        return {item["accountNumber"]: item["hashValue"] for item in data}

    def get_account_list(self, include_positions: bool = True) -> Dict[str, Any]:
        """Fetches account list, optionally with positions."""
        path = "trader/v1/accounts"
        if include_positions:
            path += "?fields=positions"
        return self._request("GET", path)

    def get_account_summary(self) -> Dict[str, Any]:
        acct_data = self.get_account_list(include_positions=True)

        # If Schwab returns a list, take the first element
        if isinstance(acct_data, list) and acct_data:
            acct_data = acct_data[0]

        sec = acct_data.get("securitiesAccount", {})
        balances = sec.get("currentBalances", {})

        self.account_number = sec.get("accountNumber")

        return {
            "accountNumber": self.account_number,
            "liquidationValue": balances.get("liquidationValue", 0),
            "equity": balances.get("equity", 0),
            "cash": balances.get("cashBalance", 0),
            "buyingPower": balances.get("buyingPower", 0),
            "dayTradingBuyingPower": balances.get("dayTradingBuyingPower", 0),
        }


    def get_positions(self) -> List[Dict[str, Any]]:
        """Returns raw positions list."""
        if not self.account_number:
            self.get_account_summary()

        acct_data = self.get_account_list(include_positions=True)

        # ✅ Handle list response
        if isinstance(acct_data, list) and acct_data:
            acct_data = acct_data[0]

        sec = acct_data.get("securitiesAccount", {})
        return sec.get("positions", [])


    def get_transactions(
        self,
        lookback_days: int = 365,
        types: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Retrieves transactions for the account."""
        if not self.account_number:
            self.get_account_summary()
        enc_map = self.get_encrypted_account_map()
        enc = enc_map.get(self.account_number)
        now = datetime.utcnow()
        start = now - timedelta(days=lookback_days)
        params: Dict[str, Any] = {
            "startDate": start.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
            "endDate": now.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        }
        if types:
            params["types"] = ",".join(types)
        return self._request("GET", f"trader/v1/accounts/{enc}/transactions", params=params)

    # ─────────────────────────────────────────────────────────────
    # Unified portfolio data for stockbot
    # ─────────────────────────────────────────────────────────────
    def get_portfolio_data(self) -> Dict[str, Any]:
        """Returns a consistent portfolio structure for stockbot."""
        summary = self.get_account_summary()
        raw_positions = self.get_positions()
        try:
            raw_transactions = self.get_transactions()
        except Exception:
            raw_transactions = []

        # --- Performance metrics ---
        day_pl = sum(float(p.get("currentDayProfitLoss", 0)) for p in raw_positions)
        ytd_pl = 0.0
        current_year = datetime.utcnow().year
        for tx in raw_transactions:
            if tx.get("type") != "TRADE":
                continue
            trade_date = tx.get("tradeDate") or tx.get("time")
            try:
                dt = datetime.fromisoformat(str(trade_date).replace("Z", "+00:00"))
            except Exception:
                continue
            if dt.year != current_year:
                continue
            transfer_items = tx.get("transferItems", [])
            sec_item = next(
                (
                    item
                    for item in transfer_items
                    if item.get("instrument", {}).get("assetType") != "CURRENCY"
                ),
                None,
            )
            if not sec_item or sec_item.get("positionEffect") != "CLOSING":
                continue
            net = float(tx.get("netAmount", 0))
            cost = float(sec_item.get("cost", 0))
            ytd_pl += net - cost

        summary["dayPL"] = day_pl
        summary["ytdPL"] = ytd_pl

        # ✅ Normalize positions
        positions = []
        for pos in raw_positions:
            instrument = pos.get("instrument", {})
            symbol = instrument.get("symbol", "")
            qty = float(pos.get("longQuantity", 0)) - float(pos.get("shortQuantity", 0))
            price = (
                pos.get("averagePrice")
                or pos.get("averageLongPrice")
                or pos.get("averageShortPrice")
                or 0
            )
            try:
                positions.append({
                    "symbol": symbol,
                    "qty": float(qty),
                    "price": float(price),
                    "marketValue": float(pos.get("marketValue", 0)),
                    "dayPL": float(pos.get("currentDayProfitLoss", 0)),
                    "totalPL": float(
                        pos.get("longOpenProfitLoss", 0)
                        or pos.get("shortOpenProfitLoss", 0)
                    ),
                })
            except Exception:
                continue

        # ✅ Normalize transactions
        transactions = []
        for tx in raw_transactions:
            transfer_items = tx.get("transferItems", [])
            # Schwab returns multiple transfer items (fees, currency, security). Pick the security item if present.
            sec_item = next(
                (
                    item
                    for item in transfer_items
                    if item.get("instrument", {}).get("assetType") != "CURRENCY"
                ),
                transfer_items[0] if transfer_items else {},
            )
            instrument = sec_item.get("instrument", {})
            symbol = instrument.get("symbol", "").replace("CURRENCY_", "")
            quantity = float(sec_item.get("amount", 0))
            price = sec_item.get("price")
            if price is not None:
                try:
                    price = float(price)
                except Exception:
                    price = None
            try:
                transactions.append({
                    "id": tx.get("activityId"),
                    "date": tx.get("tradeDate") or tx.get("time"),
                    "symbol": symbol,
                    "type": tx.get("type"),
                    "quantity": quantity,
                    "amount": float(tx.get("netAmount", 0)),
                    "price": price,
                })
            except Exception:
                continue

        return {
            "summary": summary,
            "positions": positions,
            "transactions": transactions,
        }
