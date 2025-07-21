import requests
import base64
import threading
import time
import webbrowser
from tkinter import messagebox
import Core.config.shared_state as shared_state
from Core.config.config import save_tokens, load_tokens
import urllib.parse

def open_auth_url(appKey):
    authUrl = f'https://api.schwabapi.com/v1/oauth/authorize?client_id={appKey}&redirect_uri=https://127.0.0.1'
    webbrowser.open(authUrl)
    messagebox.showinfo("Authenticate", "Please authenticate and paste the redirect URL in the provided field.")

def parse_redirect_url(returnedLink, appKey, appSecret):
    try:
        parsed_url = urllib.parse.urlparse(returnedLink.strip())
        query = parsed_url.query or parsed_url.fragment

        if not query:
            messagebox.showerror("Error", "No query or fragment in the URL. Paste the full redirect URL.")
            return

        params = urllib.parse.parse_qs(query)
        code_list = params.get('code')

        if not code_list or not code_list[0].strip():
            messagebox.showerror("Error", "No 'code' parameter found in the URL. Make sure it's copied completely.")
            return

        code = code_list[0].strip()
        print("Authorization code extracted:", code)
        authenticate_and_get_tokens(code, appKey, appSecret)

    except Exception as e:
        messagebox.showerror("Error", f"Something went wrong parsing the URL.\n{str(e)}")


def authenticate_and_get_tokens(code, appKey, appSecret):
    headers = {
        'Authorization': f'Basic {base64.b64encode(bytes(f"{appKey}:{appSecret}", "utf-8")).decode("utf-8")}',
        'Content-Type': 'application/x-www-form-urlencoded'
    }

    data = {'grant_type': 'authorization_code', 'code': code, 'redirect_uri': 'https://127.0.0.1'}
    response = requests.post('https://api.schwabapi.com/v1/oauth/token', headers=headers, data=data)
    if response.status_code == 200:
        tD = response.json()
        tD['expires_at'] = time.time() + tD['expires_in']  # Save exact expiration
        shared_state.access_token = tD['access_token']
        shared_state.refresh_token = tD['refresh_token']
        save_tokens(tD)
        start_refresh_token_thread(appKey, appSecret)
        messagebox.showinfo("Success", "Authenticated successfully!")
    else:
        messagebox.showerror("Error", f"Failed to authenticate: {response.status_code}\n{response.content}")

def refresh_access_token(app_key, app_secret):
    tokens = load_tokens()
    if tokens:
        # ✅ Skip refresh if still valid (with 60 second buffer)
        if 'expires_at' in tokens and time.time() < tokens['expires_at'] - 60:
            shared_state.access_token = tokens['access_token']
            shared_state.refresh_token = tokens.get('refresh_token', '')
            return True

        if 'refresh_token' in tokens:
            headers = {
                'Authorization': f'Basic {base64.b64encode(bytes(f"{app_key}:{app_secret}", "utf-8")).decode("utf-8")}',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
            data = {
                'grant_type': 'refresh_token',
                'refresh_token': tokens['refresh_token'],
                'redirect_uri': 'https://127.0.0.1'
            }
            response = requests.post('https://api.schwabapi.com/v1/oauth/token', headers=headers, data=data)
            if response.status_code == 200:
                response_data = response.json()
                response_data['expires_at'] = time.time() + response_data['expires_in']
                shared_state.access_token = response_data['access_token']
                shared_state.refresh_token = response_data.get('refresh_token', tokens['refresh_token'])
                save_tokens(response_data)
                return True
            else:
                print(f"Failed to refresh access token: {response.status_code}")
                print("Response content:", response.content)
                return False
    return False

def start_refresh_token_thread(app_key, app_secret):
    def refresh_token_loop():
        while True:
            time.sleep(1800)  # Refresh the token every 28 minutes
            refresh_access_token(app_key, app_secret)
    threading.Thread(target=refresh_token_loop, daemon=True).start()
