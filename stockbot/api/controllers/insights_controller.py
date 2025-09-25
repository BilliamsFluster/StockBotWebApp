from __future__ import annotations

import json
import logging
from statistics import fmean
from typing import Any, Dict, Iterable, List

from pydantic import BaseModel

from providers.provider_manager import ProviderManager

try:
    from jarvis.jarvis_factory import jarvis_service_instance

    _OLLAMA_AGENT = getattr(jarvis_service_instance, "agent", None)
except Exception:  # pragma: no cover - defensive import guard
    _OLLAMA_AGENT = None


logger = logging.getLogger(__name__)


class InsightsRequest(BaseModel):
    broker: str
    credentials: dict


def _to_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _format_currency(value: float) -> str:
    return f"${value:,.2f}"


def _format_percent(value: float) -> str:
    return f"{value:.1%}"


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

    bot_name = "Jarvis"

    turnover_ratio = (avg_turnover / equity) if equity else 0.0

    fallback_insights: List[str] = []
    overview_parts = [
        f"Account equity stands at {_format_currency(equity)}" if equity else "Account equity is unavailable",
        f"cash reserves {_format_currency(cash)} ({_format_percent(cash_ratio)} of equity)" if equity else f"cash on hand {_format_currency(cash)}",
    ]
    if open_positions:
        exposure_pct = (invested_value / equity) if equity else 0.0
        overview_parts.append(
            f"{len(open_positions)} open positions with {_format_currency(invested_value)} deployed ({_format_percent(exposure_pct)} of equity)"
        )
    if buying_power:
        overview_parts.append(f"available buying power of {_format_currency(buying_power)}")
    if day_pl:
        overview_parts.append(f"today's P/L at {_format_currency(day_pl)}")
    if turnover_ratio:
        overview_parts.append(f"average ticket size running at {_format_percent(turnover_ratio)} of equity per trade")
    fallback_insights.append("Overview: " + "; ".join(overview_parts) + ".")

    concentration_text = (
        f"Current risk budget shows single-name concentration around {_format_percent(concentration)}, which is {'elevated' if concentration > 0.25 else 'within guardrails'}."
        if open_positions
        else "No active positions at the moment to judge concentration."
    )

    if top_winner and _to_float(top_winner.get("dayPL")) > 0:
        sym = top_winner.get("symbol", "top holding")
        gain = _to_float(top_winner.get("dayPL"))
        total_pl = _to_float(top_winner.get("totalPL"))
        fallback_insights.append(
            "✅ Strength: "
            + f"{sym} contributed {_format_currency(gain)} today and sits {_format_currency(total_pl)} ahead overall, confirming the bot's entry logic."
        )
    else:
        fallback_insights.append(
            "✅ Strength: Portfolio remains defensively positioned with limited downside captured in today's results."
        )

    if top_loser and _to_float(top_loser.get("dayPL")) < 0:
        sym = top_loser.get("symbol", "a holding")
        loss = _to_float(top_loser.get("dayPL"))
        total_loss = _to_float(top_loser.get("totalPL"))
        watchlist_text = (
            f"{sym} is dragging performance with a {_format_currency(loss)} move on the session and {_format_currency(total_loss)} unrealized drawdown."
        )
        fallback_insights.append("⚠️ Watchlist: " + watchlist_text)
    elif worst_draw and _to_float(worst_draw.get("totalPL")) < 0:
        sym = worst_draw.get("symbol", "a holding")
        total_loss = _to_float(worst_draw.get("totalPL"))
        fallback_insights.append(
            "⚠️ Watchlist: " + f"{sym} holds the deepest unrealized loss at {_format_currency(total_loss)}; review its thesis."
        )
    elif not open_positions:
        fallback_insights.append(
            "⚠️ Watchlist: No active positions — verify that the policy is allowed to deploy capital as intended."
        )
    else:
        fallback_insights.append("⚠️ Watchlist: Positions remain orderly with no outsized drawdowns detected today.")

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
        recommendations.append(
            "dial back trade frequency via a higher `rebalance_eps` or lower `max_step_change` to reduce churn"
        )
    if not recommendations:
        recommendations.append(
            "continue monitoring regime detection and refresh the config snapshot after the next backtest to keep signals aligned"
        )

    fallback_insights.append(
        "🔧 Next tweaks: " + "; ".join(recommendations) + ". " + concentration_text
    )

    account_value = equity if equity else invested_value + cash

    if _OLLAMA_AGENT:
        prompt_payload: Dict[str, Any] = {
            "account_summary": summary,
            "positions": open_positions,
            "transactions": transactions,
            "calculated": {
                "equity": equity,
                "cash": cash,
                "buying_power": buying_power,
                "day_pl": day_pl,
                "invested_value": invested_value,
                "cash_ratio": cash_ratio,
                "turnover_ratio": turnover_ratio,
                "concentration": concentration,
                "top_winner": top_winner,
                "top_loser": top_loser,
                "worst_draw": worst_draw,
            },
        }
        if isinstance(portfolio, dict):
            prompt_payload["portfolio_raw"] = {
                key: value
                for key, value in portfolio.items()
                if key not in {"summary", "positions", "transactions"}
            }

        prompt = (
            "You are Jarvis, a trading assistant that speaks in concise trading-desk briefs. "
            "Review the provided brokerage snapshot JSON and craft a focused report. "
            "Return strict JSON with keys 'insights' (an ordered list of four strings) and 'accountValue' (number). "
            "Each insight should begin respectively with 'Overview:', '✅ Strength:', '⚠️ Watchlist:', and '🔧 Next tweaks:' "
            "and reference configuration levers such as sizing or guards where relevant. Do not include any extra keys or prose.\n\n"
            f"<DATA>\n{json.dumps(prompt_payload, indent=2, default=str)}\n</DATA>"
        )

        try:
            raw_response = _OLLAMA_AGENT.generate(prompt, output_format="json")
            parsed = json.loads(raw_response)
            llm_insights = parsed.get("insights")
            llm_account_value = parsed.get("accountValue", account_value)

            if isinstance(llm_insights, list) and all(isinstance(item, str) for item in llm_insights):
                try:
                    account_value = float(llm_account_value)
                except (TypeError, ValueError):
                    pass
                return {"insights": llm_insights, "accountValue": account_value, "bot": bot_name}
        except Exception as exc:  # pragma: no cover - rely on fallback if agent fails
            logger.warning("Falling back to rule-based insights: %s", exc)

    return {"insights": fallback_insights, "accountValue": account_value, "bot": bot_name}
