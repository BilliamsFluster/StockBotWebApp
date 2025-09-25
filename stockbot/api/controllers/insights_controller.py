from __future__ import annotations

from statistics import fmean
from typing import Any, Dict, Iterable, List

from pydantic import BaseModel

from providers.provider_manager import ProviderManager


class InsightsRequest(BaseModel):
    broker: str
    credentials: dict


def _to_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _best(items: Iterable[Dict[str, Any]], key: str, reverse: bool = True) -> Dict[str, Any] | None:
    items = [item for item in items if isinstance(item, dict)]
    if not items:
        return None
    return max(items, key=lambda item: _to_float(item.get(key, 0.0)), default=None) if reverse else min(
        items, key=lambda item: _to_float(item.get(key, 0.0)), default=None
    )


def _concentration(positions: List[Dict[str, Any]]) -> float:
    exposures = [_to_float(pos.get("marketValue")) for pos in positions]
    invested = sum(val for val in exposures if val > 0)
    if invested <= 0:
        return 0.0
    return max((val / invested) for val in exposures if val > 0)


def _average_turnover(transactions: List[Dict[str, Any]]) -> float:
    if not transactions:
        return 0.0
    sizes = [abs(_to_float(tx.get("amount", 0.0))) for tx in transactions if _to_float(tx.get("amount", 0.0))]
    if not sizes:
        return 0.0
    return fmean(sizes)


def generate_insights(req: InsightsRequest) -> dict:
    provider = ProviderManager.get_provider(req.broker, req.credentials)

    positions: List[Dict[str, Any]] = []
    transactions: List[Dict[str, Any]] = []

    try:
        portfolio = provider.get_portfolio_data()  # type: ignore[attr-defined]
    except Exception:
        portfolio = {}

    summary = portfolio.get("summary") if isinstance(portfolio, dict) else None
    if not isinstance(summary, dict):
        summary = provider.get_account_summary()

    if isinstance(portfolio, dict):
        positions = portfolio.get("positions") or []
        transactions = portfolio.get("transactions") or []

    equity = _to_float(summary.get("equity") or summary.get("liquidationValue"))
    cash = _to_float(summary.get("cash"))
    buying_power = _to_float(summary.get("buyingPower"))
    day_pl = _to_float(summary.get("dayPL")) if "dayPL" in summary else sum(
        _to_float(p.get("dayPL")) for p in positions
    )

    invested_value = sum(max(_to_float(p.get("marketValue")), 0.0) for p in positions)
    open_positions = [p for p in positions if _to_float(p.get("qty"))]
    cash_ratio = (cash / equity) if equity else 0.0

    top_winner = _best(open_positions, "dayPL", reverse=True)
    top_loser = _best(open_positions, "dayPL", reverse=False)
    worst_draw = _best(open_positions, "totalPL", reverse=False)
    avg_turnover = _average_turnover(transactions)
    concentration = _concentration(open_positions)

    insights: List[str] = []
    bot_name = "Jarvis"

    summary_parts = [
        f"Account equity stands at ${equity:,.2f}",
        f"cash reserves ${cash:,.2f} ({cash_ratio:.0%} of equity)",
    ]
    if open_positions:
        summary_parts.append(
            f"with {len(open_positions)} open positions representing ${invested_value:,.2f} in exposure"
        )
    if buying_power:
        summary_parts.append(f"and available buying power of ${buying_power:,.2f}")
    if day_pl:
        summary_parts.append(f"today's P/L is ${day_pl:,.2f}")
    insights.append("; ".join(summary_parts) + ".")

    if top_winner and _to_float(top_winner.get("dayPL")) > 0:
        sym = top_winner.get("symbol", "top holding")
        gain = _to_float(top_winner.get("dayPL"))
        total_pl = _to_float(top_winner.get("totalPL"))
        insights.append(
            f"✅ Strength: {sym} contributed ${gain:,.2f} today and is ${total_pl:,.2f} ahead overall, supporting the strategy's signals."
        )
    else:
        insights.append("✅ Strength: Portfolio is defensively positioned with limited downside captured in today's results.")

    if top_loser and _to_float(top_loser.get("dayPL")) < 0:
        sym = top_loser.get("symbol", "a holding")
        loss = _to_float(top_loser.get("dayPL"))
        total_loss = _to_float(top_loser.get("totalPL"))
        insights.append(
            f"⚠️ Watchlist: {sym} is dragging performance with a ${loss:,.2f} move on the session and ${total_loss:,.2f} unrealized drawdown."
        )
    elif worst_draw and _to_float(worst_draw.get("totalPL")) < 0:
        sym = worst_draw.get("symbol", "a holding")
        total_loss = _to_float(worst_draw.get("totalPL"))
        insights.append(
            f"⚠️ Watchlist: {sym} holds the deepest unrealized loss at ${total_loss:,.2f}; review its thesis."
        )
    elif not open_positions:
        insights.append("⚠️ Watchlist: No active positions — verify that the policy is allowed to deploy capital as intended.")

    recommendations: List[str] = []
    if cash_ratio > 0.45:
        recommendations.append(
            "increase `sizing.invest_max` or relax `guards.per_name_weight_cap` in the config snapshot to put idle cash to work"
        )
    if concentration > 0.25:
        recommendations.append(
            "tighten `guards.per_name_weight_cap` or raise diversification in the universe to reduce single-name concentration"
        )
    if top_loser and _to_float(top_loser.get("totalPL")) < -0.02 * equity:
        recommendations.append(
            "consider lowering `guards.daily_loss_limit_pct` or adding stricter stop logic for underperforming names"
        )
    if avg_turnover > 0 and avg_turnover > 0.05 * equity:
        recommendations.append("dial back trade frequency via a higher `rebalance_eps` or lower `max_step_change` to reduce churn")
    if not recommendations:
        recommendations.append(
            "continue monitoring regime detection and refresh the config snapshot after the next backtest to keep signals aligned"
        )

    insights.append("🔧 Next tweaks: " + "; ".join(recommendations) + ".")

    account_value = equity if equity else invested_value + cash

    return {"insights": insights, "accountValue": account_value, "bot": bot_name}
