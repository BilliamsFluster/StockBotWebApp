import json
import os

CREDENTIALS_FILE = "credentials.json"
TOKENS_FILE = "tokens.json"

def load_or_create_credentials():
    if os.path.exists(CREDENTIALS_FILE):
        with open(CREDENTIALS_FILE, "r") as file:
            return json.load(file)
    else:
        credentials = {
            "app_key": "",
            "app_secret": "",
            "stock_symbol": ""
        }
        with open(CREDENTIALS_FILE, "w") as file:
            json.dump(credentials, file)
        return credentials

def save_credentials(credentials):
    with open(CREDENTIALS_FILE, "w") as file:
        json.dump(credentials, file)

def load_tokens():
    if os.path.exists(TOKENS_FILE):
        with open(TOKENS_FILE, "r") as file:
            return json.load(file)
    return None

def save_tokens(tokens):
    with open(TOKENS_FILE, "w") as file:
        json.dump(tokens, file)
