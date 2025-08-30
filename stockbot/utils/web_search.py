import requests
from bs4 import BeautifulSoup
from ddgs import DDGS
from textblob import TextBlob
import hashlib
import time
from datetime import datetime, timedelta
import feedparser
import os

seen_articles = set()
cache = {}
last_query_time = datetime.min

def hash_text(text):
    return hashlib.md5(text.encode("utf-8")).hexdigest()

def fetch_rss_fallback():
    fallback_headlines = []
    feeds = [
        "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US",
        "https://feeds.marketwatch.com/marketwatch/topstories/"
    ]
    for feed_url in feeds:
        try:
            parsed = feedparser.parse(feed_url)
            for entry in parsed.entries[:5]:
                title = entry.get("title", "").strip()
                summary = entry.get("summary", "").strip()
                link = entry.get("link", "").strip()
                article_hash = hash_text(title + summary)
                if article_hash not in seen_articles:
                    seen_articles.add(article_hash)
                    sentiment_score = TextBlob(f"{title} {summary}").sentiment.polarity
                    sentiment = "🟢 Positive" if sentiment_score > 0.2 else "🔴 Negative" if sentiment_score < -0.2 else "🟡 Neutral"
                    fallback_headlines.append(f"- {title} ({sentiment})\n  {summary}\n  {link}")
        except Exception:
            continue
    return fallback_headlines


def fetch_economic_calendar():
    """Fetch upcoming economic events with details.

    Uses Financial Modeling Prep's API and returns a list of pipe-delimited
    strings so the frontend can easily split the values. Each item follows the
    pattern ``date|event|actual|expected|impact``. A static fallback is returned
    if the request fails so the UI still displays content.
    """

    try:
        start = datetime.utcnow().strftime("%Y-%m-%d")
        end = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d")
        api_key = os.getenv("FMP_API_KEY", "demo")
        url = (
            "https://financialmodelingprep.com/api/v3/economic_calendar"
            f"?from={start}&to={end}&apikey={api_key}"
        )
        r = requests.get(url, timeout=10)
        data = r.json()
        events = []
        for ev in data[:10]:
            date = ev.get("date")
            event = ev.get("event")
            actual = ev.get("actual")
            expected = ev.get("consensus") or ev.get("forecast")
            impact = ev.get("impact")
            if not date or not event:
                continue
            events.append(
                f"- {date}|{event}|{actual or 'N/A'}|{expected or 'N/A'}|{impact or 'N/A'}"
            )
        if events:
            return events
    except Exception:
        pass

    # Static fallback when API is unreachable
    return [
        "- 2024-05-02|Non-Farm Payrolls|N/A|N/A|High",
        "- 2024-05-03|Unemployment Rate|N/A|N/A|Medium",
    ]

def fetch_financial_snippets():
    global last_query_time

    # ---- Step 1: Get market index data from Yahoo Finance ----
    index_data = {}
    index_labels = {
        "^DJI": "Dow Jones",
        "^GSPC": "S&P 500",
        "^IXIC": "NASDAQ",
    }

    try:
        for symbol, name in index_labels.items():
            url = f"https://finance.yahoo.com/quote/{symbol}"
            r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
            soup = BeautifulSoup(r.text, "html.parser")
            price_tag = soup.find(
                "fin-streamer",
                {"data-symbol": symbol, "data-field": "regularMarketPrice"},
            )
            change_tag = soup.find(
                "fin-streamer",
                {"data-symbol": symbol, "data-field": "regularMarketChangePercent"},
            )
            if price_tag and change_tag:
                price = price_tag.text
                change = change_tag.text
                index_data[name] = f"{price} ({change})"
    except Exception:
        index_data = {
            "Dow Jones": "35000 (+0.3%)",
            "S&P 500": "4500 (+0.2%)",
            "NASDAQ": "14000 (-0.1%)",
        }

    # ---- Step 2: Skip redundant search if <15s passed ----
    now = datetime.now()
    if now - last_query_time < timedelta(seconds=15):
        return cache.get("last_output", "🕓 Throttled to avoid rate limit.")

    last_query_time = now

    # ---- Step 3: Try DDG multi-source query ----
    sources = [
        "site:finance.yahoo.com",
        "site:cnbc.com",
        "site:marketwatch.com",
        "site:reuters.com",
        "site:bloomberg.com"
    ]
    headlines = []

    try:
        with DDGS() as ddgs:
            for source in sources:
                time.sleep(1.5)  # throttle DDG requests
                results = ddgs.text(f"today stock market {source}", max_results=3)
                for r in results:
                    title = r.get("title", "").strip()
                    body = r.get("body", "").strip()
                    href = r.get("href", "").strip()

                    if not title or not href:
                        continue

                    article_hash = hash_text(title + body)
                    if article_hash in seen_articles:
                        continue
                    seen_articles.add(article_hash)

                    sentiment_score = TextBlob(f"{title} {body}").sentiment.polarity
                    sentiment = "🟢 Positive" if sentiment_score > 0.2 else "🔴 Negative" if sentiment_score < -0.2 else "🟡 Neutral"
                    headlines.append(f"- {title} ({sentiment})\n  {body}\n  {href}")
    except Exception as e:
        headlines.append(f"Error fetching headlines: {e}")

    # ---- Step 4: Fallback to RSS if headlines failed or empty ----
    if not headlines or any("Error" in h for h in headlines):
        headlines = fetch_rss_fallback()

    if not headlines:
        headlines = [
            "- Market data unavailable; using placeholder headlines.",
            "- Check your network connection for live news updates.",
        ]

    # ---- Step 5: Fetch economic calendar ----
    calendar_items = fetch_economic_calendar()

    # ---- Step 6: Final output formatting with three sections ----
    highlight_lines = [f"- {k}: {v}" for k, v in index_data.items()]
    index_summary = "Market Highlights\n" + "\n".join(highlight_lines)
    headline_summary = "Relevant Events\n" + "\n".join(headlines)
    calendar_summary = "Economic Calendar\n" + "\n".join(calendar_items)

    final_output = f"{index_summary}\n\n{headline_summary}\n\n{calendar_summary}"
    cache["last_output"] = final_output
    return final_output
