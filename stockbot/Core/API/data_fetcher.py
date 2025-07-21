import requests
from tkinter import messagebox
import Core.config.shared_state as shared_state
import pandas as pd
import time

def fetch_account_info():
    base_url = "https://api.schwabapi.com/trader/v1/"
    
    account_response = requests.get(
        f'{base_url}/accounts/accountNumbers',
        headers={'Authorization': f'Bearer {shared_state.access_token}'}
    )
    account_data = account_response.json()
    print(f"Account Numbers: {account_data}")

    account_balances_response = requests.get(
        f'{base_url}/accounts',
        headers={'Authorization': f'Bearer {shared_state.access_token}'}
    )
    account_balances_data = account_balances_response.json()
    print(f"Account Balances: {account_balances_data}")

    return account_balances_data

def fetch_detailed_account_info(account_number):
    url = f"https://api.schwabapi.com/trader/v1/accounts/{account_number}?fields=positions"
    headers = {'Authorization': f'Bearer {shared_state.access_token}'}
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Failed to fetch account details. Status: {response.status_code}")
        print(response.text)
        return None



def fetch_market_data(symbol):
    base_url = "https://api.schwabapi.com/marketdata/v1/quotes"
    
    params = {'symbols': symbol}
    headers = {'Authorization': f'Bearer {shared_state.access_token}'}
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

def fetch_historical_data(symbol, start_date, end_date, period_type='year', period=1):
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
    headers = {'Authorization': f'Bearer {shared_state.access_token}'}
    response = requests.get(base_url, headers=headers, params=params)
    
    if response.status_code == 200:
        data = response.json()
        if 'candles' in data:
            historical_data = data['candles']
            df = pd.DataFrame(historical_data)
            pd.set_option('display.max_rows', 100)
            return df
        else:
            print("No historical data found for the specified symbol.")
            return pd.DataFrame()
    else:
        print(f"Error fetching historical data: {response.status_code}\n{response.text}")
        return pd.DataFrame()
    
def get_account_data_for_ai():
    headers = {'Authorization': f'Bearer {shared_state.access_token}'}
    response = requests.get("https://api.schwabapi.com/trader/v1/accounts?fields=positions", headers=headers)


    if response.status_code != 200:
        return f"⚠️ Failed to fetch account data. Status: {response.status_code}"

    try:
        account_data_list = response.json()  # ✅ /accounts returns a list
    except Exception:
        return "⚠️ Failed to parse account data response."

    if not account_data_list:
        return "⚠️ No accounts returned."

    account = account_data_list[0].get('securitiesAccount', {})
    account_number = account.get('accountNumber', 'N/A')
    balances = account.get('currentBalances', {})
    positions = account.get('positions', [])
    print("[DEBUG] Raw Positions:", positions)

    liquidation_value = balances.get('liquidationValue', 0)
    equity = balances.get('equity', 0)

    position_summaries = []
    for p in positions:
        symbol = p.get('instrument', {}).get('symbol', 'N/A')
        qty = p.get('longQuantity', 0)
        val = p.get('marketValue', 0)
        gain = p.get('currentDayProfitLoss', 0)
        position_summaries.append(f"- {symbol}: {qty} shares, Market Value ${val:.2f}, P/L Today: ${gain:.2f}")

    if not position_summaries:
        position_summaries.append("No visible positions found.")

    return f"""
### 💼 Account Summary  
- **Account Number**: {account_number}  
- **Liquidation Value**: ${liquidation_value:,.2f}  
- **Equity**: ${equity:,.2f}  

### 📈 Positions  
{chr(10).join(position_summaries)}
"""





