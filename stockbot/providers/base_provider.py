# base_provider.py

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, List, Optional
import requests

class BaseProvider(ABC):
    """
    Abstract base for any market‐data or brokerage API.
    """

    def __init__(self, api_key: str, base_url: str, timeout: float = 5.0):
        """
        :param api_key: your token / key for the service
        :param base_url: root URL (e.g. "https://api.schwabapi.com")
        :param timeout: request timeout
        """
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(self._default_headers())

    @abstractmethod
    def _request(self,
                 method: str,
                 path: str,
                 params: Optional[Dict[str, Any]] = None,
                 data: Optional[Dict[str, Any]] = None) -> Any:
        """
        Low‐level HTTP request. Must raise on error and return parsed JSON.
        """

    @abstractmethod
    def get_current_price(self, symbol: str) -> float:
        """
        :return: latest price for symbol
        """

    @abstractmethod
    def get_historical_data(self,
                            symbol: str,
                            start: datetime,
                            end: datetime,
                            **kwargs) -> List[Dict[str, Any]]:
        """
        :return: list of OHLC+volume dicts for symbol between start/end
        """

    @abstractmethod
    def get_account_summary(self) -> Dict[str, Any]:
        """Return a high-level account summary such as equity, cash, etc."""

    def _full_url(self, path: str) -> str:
        return f"{self.base_url}/{path.lstrip('/')}"

    def _default_headers(self) -> Dict[str, str]:
        # default to simple Bearer auth
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }
