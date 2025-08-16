# examples/demo_ingestion.py
from datetime import datetime, timedelta, timezone
from typing import List
from stockbot.ingestion.alpha_vantage_ingestion import AlphaVantageProvider
from stockbot.ingestion.ingestion_base import (
    IngestionProvider,
    AssetType,
    BarInterval,
    IngestionError,
    NotSupported,
    PriceBar,
    Quote,
    Dividend,
    Split,
)
# run command -- (venv) D:\Websites\StockBot>python -m stockbot.ingestion.example_ingestion_workflow
# examples/demo_yfinance.py
from datetime import datetime, timedelta, timezone
from stockbot.ingestion.yfinance_ingestion import YFinanceProvider


p = YFinanceProvider()

print("caps:", p.capabilities())
print("map_symbol('AAPL'):", p.map_symbol("AAPL", AssetType.EQUITY))

q = p.get_quote("AAPL")
print("quote:", q)

bars = p.get_price_bars(
    "AAPL",
    interval=BarInterval.MIN_5,
    start=datetime.now(timezone.utc) - timedelta(days=5),
    end=datetime.now(timezone.utc),
    adjusted=True,
    limit=120,
)
print(f"bars: {len(bars)}; last close={bars[-1].close if bars else None}")

divs = p.get_dividends("AAPL")
print("dividends:", len(divs), divs[:3])

spls = p.get_splits("AAPL")
print("splits:", len(spls), spls[:3])


def print_capabilities(p: IngestionProvider) -> None:
    caps = p.capabilities()
    print(f"\n[{p.name}] Capabilities")
    print(" Bars:", [i.value for i in caps.get("bars", [])])
    print(" Quote:", caps.get("quote"))
    print(" Dividends:", caps.get("dividends"))
    print(" Splits:", caps.get("splits"))
    print(" Search:", caps.get("search"))
    print(" Asset types:", [a.value for a in caps.get("asset_types", [])])

def try_search(p: IngestionProvider, query: str) -> None:
    print(f"\n[{p.name}] search('{query}')")
    try:
        matches = p.search(query, limit=5)
        for m in matches:
            print(f"  {m.symbol} — {m.name} ({m.exchange}, {m.currency}) provider_symbol={m.provider_symbol}")
    except NotSupported:
        print("  search() not supported")
    except IngestionError as e:
        print("  search() failed:", e)

def try_quote(p: IngestionProvider, symbol: str) -> None:
    print(f"\n[{p.name}] get_quote('{symbol}')")
    try:
        q: Quote = p.get_quote(symbol, asset_type=AssetType.EQUITY)
        print(f"  ts={q.ts.isoformat()} price={q.price} bid={q.bid} ask={q.ask} vol={q.volume}")
    except NotSupported:
        print("  quote() not supported")
    except IngestionError as e:
        print("  quote() failed:", e)

def try_bars(
    p: IngestionProvider,
    symbol: str,
    interval: BarInterval,
    days_back: int = 60,
    limit: int = 120,
    adjusted: bool = True,
) -> None:
    print(f"\n[{p.name}] get_price_bars('{symbol}', interval={interval.value})")
    start = datetime.now(timezone.utc) - timedelta(days=days_back)
    end = datetime.now(timezone.utc)
    try:
        bars: List[PriceBar] = p.get_price_bars(
            symbol,
            interval=interval,
            start=start,
            end=end,
            adjusted=adjusted,
            limit=limit,
        )
        if not bars:
            print("  No bars returned")
            return
        print(f"  Returned {len(bars)} bars; first={bars[0].ts.isoformat()} last={bars[-1].ts.isoformat()}")
        last = bars[-1]
        print(f"  Last bar: O={last.open} H={last.high} L={last.low} C={last.close} V={last.volume}")
    except NotSupported as e:
        print(" ", str(e))
    except IngestionError as e:
        print("  bars() failed:", e)

def try_dividends(p: IngestionProvider, symbol: str) -> None:
    print(f"\n[{p.name}] get_dividends('{symbol}')")
    try:
        divs: List[Dividend] = p.get_dividends(symbol)
        print(f"  Returned {len(divs)} dividends")
        for d in divs[:3]:
            print(f"   ex_date={d.ex_date.date()} amount={d.amount} {d.currency}")
    except NotSupported:
        print("  dividends() not supported")
    except IngestionError as e:
        print("  dividends() failed:", e)

def try_splits(p: IngestionProvider, symbol: str) -> None:
    print(f"\n[{p.name}] get_splits('{symbol}')")
    try:
        splits: List[Split] = p.get_splits(symbol)
        print(f"  Returned {len(splits)} splits")
        for s in splits[:3]:
            print(f"   ex_date={s.ex_date.date()} ratio={s.numerator}:{s.denominator}")
    except NotSupported:
        print("  splits() not supported")
    except IngestionError as e:
        print("  splits() failed:", e)

def main():
    # ---- Choose your provider (Alpha Vantage example) ----
    av = AlphaVantageProvider(api_key="MZP1BL1GPUTICK08")

    # Every provider can be exercised through the same functions below:
    provider: IngestionProvider = av

    # Capabilities
    print_capabilities(provider)

    # Symbol mapping (useful when providers need special symbols, e.g., BRK.B vs BRK-B)
    meta = provider.map_symbol("AAPL", asset_type=AssetType.EQUITY)
    print(f"\n[{provider.name}] map_symbol('AAPL') -> provider_symbol='{meta.provider_symbol}'")

    # Search
    try_search(provider, "Tesla")

    # Quote
    try_quote(provider, "AAPL")

    # Bars (multiple intervals)
    try_bars(provider, "AAPL", BarInterval.DAY_1, days_back=365, limit=200, adjusted=True)
    try_bars(provider, "AAPL", BarInterval.MIN_5, days_back=5, limit=300, adjusted=True)

    # Corporate actions (may be unsupported on some providers; example shows graceful handling)
    try_dividends(provider, "AAPL")
    try_splits(provider, "AAPL")

    # Swap providers later without changing any call sites:
    # other = SomeOtherProvider(api_key="...")
    # provider = other
    # repeat the same calls as above…

if __name__ == "__main__":
    main()
