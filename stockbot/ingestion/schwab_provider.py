# schwab_provider.py

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from base_provider import BaseProvider

class SchwabProvider(BaseProvider):
    """
    SchwabProvider implements account, quotes, history, orders, transactions, etc.
    """

    def __init__(self,
                 access_token: str,
                 base_url: str = "https://api.schwabapi.com",
                 timeout: float = 5.0):
        super().__init__(api_key=access_token, base_url=base_url, timeout=timeout)
        self.account_number: Optional[str] = None

    def _request(self,
                 method: str,
                 path: str,
                 params: Optional[Dict[str, Any]] = None,
                 data: Optional[Dict[str, Any]] = None) -> Any:
        url = self._full_url(path)
        resp = self.session.request(method, url,
                                    params=params, json=data,
                                    timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    # ─── Account Endpoints ───────────────────────────────────────────────────

    def get_encrypted_account_map(self) -> Dict[str, str]:
        # GET /trader/v1/accounts/accountNumbers
        data = self._request("GET", "trader/v1/accounts/accountNumbers")
        return {item["accountNumber"]: item["hashValue"] for item in data}

    def get_account_list(self, include_positions: bool = True) -> Dict[str, Any]:
        # GET /trader/v1/accounts?fields=positions
        path = "trader/v1/accounts"
        if include_positions:
            path += "?fields=positions"
        return self._request("GET", path)

    def get_account_summary(self) -> Dict[str, Any]:
        """
        Fetches summary balances + sets self.account_number.
        """
        acct_data = self.get_account_list(include_positions=True)
        sec = acct_data.get("securitiesAccount", acct_data)
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
        """
        Returns raw positions list.
        """
        if not self.account_number:
            self.get_account_summary()
        sec = self.get_account_list(include_positions=True).get("securitiesAccount", {})
        return sec.get("positions", [])

    # ─── Quotes & History ────────────────────────────────────────────────────

    def get_current_price(self, symbol: str) -> float:
        """
        GET /marketdata/v1/quotes?symbols={symbol}
        """
        data = self._request("GET", "marketdata/v1/quotes", params={"symbols": symbol})
        quote = data.get(symbol, {}).get("quote", {})
        return float(quote.get("closePrice", 0.0))

    def get_historical_data(self,
                            symbol: str,
                            start: datetime,
                            end: datetime,
                            period_type: str = "year",
                            period: int = 1,
                            frequency_type: str = "daily",
                            frequency: int = 1,
                            need_extended: bool = True
                           ) -> List[Dict[str, Any]]:
        """
        GET /marketdata/v1/pricehistory
        returns the raw 'candles' list.
        """
        params = {
            "symbol": symbol,
            "startDate": int(start.timestamp() * 1000),
            "endDate":   int(end.timestamp()   * 1000),
            "periodType": period_type,
            "period":     period,
            "frequencyType": frequency_type,
            "frequency":  frequency,
            "needExtendedHoursData": str(need_extended).lower()
        }
        data = self._request("GET", "marketdata/v1/pricehistory", params=params)
        return data.get("candles", [])

    # ─── Orders & Transactions ────────────────────────────────────────────────

    def get_orders(self) -> List[Dict[str, Any]]:
        """
        GET /trader/v1/accounts/{encAcct}/orders
        """
        if not self.account_number:
            self.get_account_summary()
        enc_map = self.get_encrypted_account_map()
        enc = enc_map.get(self.account_number)
        return self._request("GET", f"trader/v1/accounts/{enc}/orders")

    def get_transactions(self,
                         lookback_days: int = 365,
                         types: Optional[List[str]] = None
                        ) -> List[Dict[str, Any]]:
        """
        GET /trader/v1/accounts/{encAcct}/transactions
        """
        if not self.account_number:
            self.get_account_summary()
        enc_map = self.get_encrypted_account_map()
        enc = enc_map.get(self.account_number)

        now = datetime.utcnow()
        start = now - timedelta(days=lookback_days)
        params: Dict[str, Any] = {
            "startDate": start.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
            "endDate":   now.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        }
        if types:
            params["types"] = ",".join(types)

        return self._request("GET", f"trader/v1/accounts/{enc}/transactions", params=params)
