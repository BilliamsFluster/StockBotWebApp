import requests
from tkinter import messagebox
import Core.config.shared_state as shared_state
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
import pandas as pd
import time
SCHWAB_BASE_URL = "https://api.schwabapi.com/trader/v1"

def fetch_account_info(access_token=None):
    if not access_token:
        from Core.config import shared_state
        access_token = shared_state.access_token

    base_url = "https://api.schwabapi.com/trader/v1/"
    headers = {'Authorization': f'Bearer {access_token}'}

    account_response = requests.get(f'{base_url}/accounts/accountNumbers', headers=headers)
    account_data = account_response.json()
    print(f"Account Numbers: {account_data}")

    account_balances_response = requests.get(f'{base_url}/accounts', headers=headers)
    account_balances_data = account_balances_response.json()
    print(f"Account Balances: {account_balances_data}")

    return account_balances_data


def fetch_detailed_account_info(account_number, access_token=None):
    if not access_token:
        from Core.config import shared_state
        access_token = shared_state.access_token

    url = f"https://api.schwabapi.com/trader/v1/accounts/{account_number}?fields=positions"
    headers = {'Authorization': f'Bearer {access_token}'}
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        return response.json()
    else:
        print(f"Failed to fetch account details. Status: {response.status_code}")
        print(response.text)
        return None


def fetch_market_data(symbol, access_token=None):
    if not access_token:
        from Core.config import shared_state
        access_token = shared_state.access_token

    base_url = "https://api.schwabapi.com/marketdata/v1/quotes"
    params = {'symbols': symbol}
    headers = {'Authorization': f'Bearer {access_token}'}
    response = requests.get(base_url, headers=headers, params=params)

    print(f"Request URL: {response.url}")
    print(f"Response Status Code: {response.status_code}")
    print(f"Response Content: {response.content}")

    if response.status_code == 200:
        data = response.json()
        if symbol in data:
            quote = data[symbol]['quote']
            data_dict = {
                'close': [quote['closePrice']],
                'open': [quote['openPrice']],
                'high': [quote['highPrice']],
                'low': [quote['lowPrice']],
                'volume': [quote['totalVolume']],
                'date': [quote['quoteTime']]
            }
            return pd.DataFrame(data_dict)
        else:
            messagebox.showerror("Error", "Symbol not found in market data response.")
            return pd.DataFrame()
    else:
        messagebox.showerror("Error", f"Error fetching market data: {response.status_code}")
        return pd.DataFrame()


def fetch_historical_data(symbol, start_date, end_date, period_type='year', period=1, access_token=None):
    if not access_token:
        from Core.config import shared_state
        access_token = shared_state.access_token

    base_url = "https://api.schwabapi.com/marketdata/v1/pricehistory"
    period_type_to_frequency_type = {
        'day': 'minute',
        'month': 'daily',
        'year': 'daily',
        'ytd': 'daily'
    }
    frequency_type = period_type_to_frequency_type[period_type]

    params = {
        'symbol': symbol,
        'startDate': int(time.mktime(time.strptime(start_date, '%Y-%m-%d')) * 1000),
        'endDate': int(time.mktime(time.strptime(end_date, '%Y-%m-%d')) * 1000),
        'periodType': period_type,
        'period': period,
        'frequencyType': frequency_type,
        'frequency': 1,
        'needExtendedHoursData': 'true'
    }
    headers = {'Authorization': f'Bearer {access_token}'}
    response = requests.get(base_url, headers=headers, params=params)

    if response.status_code == 200:
        data = response.json()
        if 'candles' in data:
            df = pd.DataFrame(data['candles'])
            pd.set_option('display.max_rows', 100)
            return df
        else:
            print("No historical data found for the specified symbol.")
            return pd.DataFrame()
    else:
        print(f"Error fetching historical data: {response.status_code}\n{response.text}")
        return pd.DataFrame()
    
import requests
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any

SCHWAB_BASE_URL = "https://api.schwabapi.com/trader/v1"

# ───── Helper: Authorization Header ─────
def get_auth_headers(access_token: str) -> Dict[str, str]:
    return {'Authorization': f'Bearer {access_token}'}


# ───── Step 1: Account Data (with positions) ─────
def get_account_list(headers: Dict[str, str]) -> List[Dict[str, Any]]:
    url = f"{SCHWAB_BASE_URL}/accounts?fields=positions"
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    return resp.json()


# ───── Step 2: Account Hash Lookup ─────
def get_encrypted_account_map(headers: Dict[str, str]) -> Dict[str, str]:
    url = f"{SCHWAB_BASE_URL}/accounts/accountNumbers"
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    return {item['accountNumber']: item['hashValue'] for item in resp.json()}


# ───── Step 3: Parse Account Summary ─────
def get_account_summary(account_data: Dict[str, Any]) -> (Dict[str, Any], List[Dict[str, Any]], str):
    account = account_data.get('securitiesAccount', {})
    account_number = account.get('accountNumber', 'N/A')
    balances = account.get('currentBalances', {})
    positions = account.get('positions', [])

    summary = {
        "accountNumber": account_number,
        "liquidationValue": balances.get('liquidationValue', 0),
        "equity": balances.get('equity', 0),
        "cash": balances.get('cashBalance', 0),
        "buyingPower": balances.get('buyingPower', 0),
        "dayTradingBuyingPower": balances.get('dayTradingBuyingPower', 0),
        "cashAvailableForTrading": balances.get('cashAvailableForTrading', 0),
        "cashAvailableForWithdrawal": balances.get('cashAvailableForWithdrawal', 0),
        "accruedInterest": balances.get('accruedInterest', 0),
        "marginBalance": balances.get('marginBalance', 0),
        "shortBalance": balances.get('shortBalance', 0),
    }
    return summary, positions, account_number


# ───── Step 4: Format Positions ─────
def structure_positions(positions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    total_value = sum(p.get('marketValue', 0) for p in positions) or 1
    structured = []

    for p in positions:
        symbol = p.get('instrument', {}).get('symbol', 'N/A')
        qty = p.get('longQuantity', 0)
        val = p.get('marketValue', 0)
        gain = p.get('currentDayProfitLoss', 0)
        percentage = (val / total_value) * 100
        structured.append({
            "symbol": symbol,
            "qty": qty,
            "value": val,
            "gain": gain,
            "percentage": percentage
        })
    return structured


# ───── Step 5: Orders ─────
def get_orders(account_number: str, headers: Dict[str, str]) -> List[Dict[str, Any]]:
    url = f"{SCHWAB_BASE_URL}/accounts/{account_number}/orders"
    resp = requests.get(url, headers=headers)
    return resp.json() if resp.status_code == 200 else []


# ───── Step 6: Transactions ─────
def get_transactions(account_number: str, headers: Dict[str, str]) -> List[Dict[str, Any]]:
    now = datetime.utcnow()
    start_date = now - timedelta(days=365)

    params = {
        "startDate": start_date.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        "endDate": now.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        "types": ",".join([
            "TRADE",
            "RECEIVE_AND_DELIVER",
            "DIVIDEND_OR_INTEREST",
            "ACH_RECEIPT",
            "ACH_DISBURSEMENT",
            "CASH_RECEIPT",
            "CASH_DISBURSEMENT",
            "ELECTRONIC_FUND",
            "WIRE_OUT",
            "WIRE_IN",
            "JOURNAL",
            "MEMORANDUM",
            "MARGIN_CALL",
            "MONEY_MARKET",
            "SMA_ADJUSTMENT"
        ])
    }

    url = f"{SCHWAB_BASE_URL}/accounts/{account_number}/transactions"
    resp = requests.get(url, headers=headers, params=params)
    print(f"Transaction fetch URL: {resp.json()}")

    try:
        resp.raise_for_status()
    except Exception as e:
        print("🔴 TRANSACTION ERROR:", resp.status_code, resp.text)
        return []

    return resp.json()


# ───── Main Entry ─────
def get_account_data_for_ai(
    access_token: Optional[str] = None,
    include_summary: bool = True,
    include_positions: bool = True,
    include_orders: bool = True,
    include_transactions: bool = True
) -> Dict[str, Any]:
    if not access_token:
        from Core.config import shared_state
        access_token = shared_state.access_token

    headers = get_auth_headers(access_token)
    result = {}

    plain_account_number = None

    # Summary and positions require full account list
    if include_summary or include_positions:
        accounts_data = get_account_list(headers)
        if not accounts_data:
            raise Exception("No accounts returned.")
        summary, positions, plain_account_number = get_account_summary(accounts_data[0])
        if include_summary:
            result["summary"] = summary
        if include_positions:
            result["positions"] = structure_positions(positions)
    else:
        # Fallback to get account number without fetching positions
        account_list = get_account_list(headers)
        plain_account_number = account_list[0].get("securitiesAccount", {}).get("accountNumber", None)

    if include_orders or include_transactions:
        encrypted_map = get_encrypted_account_map(headers)
        encrypted_account_number = encrypted_map.get(plain_account_number)
        if not encrypted_account_number:
            raise Exception("Encrypted account number not found for provided account.")

        if include_orders:
            result["orders"] = get_orders(encrypted_account_number, headers)

        if include_transactions:
            result["transactions"] = get_transactions(encrypted_account_number, headers)

    return result
