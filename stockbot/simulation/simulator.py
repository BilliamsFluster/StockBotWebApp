"""Run the trading bot in a simulated real‑time environment."""

from __future__ import annotations

from datetime import datetime
from typing import Dict, Any, List, Iterable

from ..config import load_settings
from ..ingestion import BaseProvider
from ..execution import PaperBroker, ExecutionManager, OrderSide
from ..strategy import StrategySelector, MarketSnapshot, Signal
from ..risk import Validator, ExposureTracker, CircuitBreaker, RiskParams, BreakerParams
from ..monitor import BotLogger
from ..jarvis import JarvisAgent

from ..execution.base_broker import Order


class Simulator:
    """Execute the trading pipeline using a streaming data source."""

    def __init__(self, config: Dict[str, Any], provider: BaseProvider) -> None:
        self.config = config
        settings = config.get("settings", {})
        initial_cash = settings.get("initial_cash", 100000.0)
        self.broker = PaperBroker(initial_cash=initial_cash)
        self.exec_manager = ExecutionManager(self.broker)
        risk_cfg = settings.get("risk", {})
        self.validator = Validator(RiskParams(max_position_size=risk_cfg.get("max_position_size", 100)))
        self.exposure = ExposureTracker()
        self.circuit = CircuitBreaker(
            BreakerParams(max_drawdown=risk_cfg.get("max_drawdown", 0.1)), self.exposure
        )
        log_cfg = settings.get("logging", {})
        self.logger = BotLogger(
            log_dir=log_cfg.get("log_dir"), enable_file_logging=log_cfg.get("enable_file_logging", False)
        )
        self.llm_enabled = settings.get("llm_enabled", False)
        self.jarvis = JarvisAgent(config) if self.llm_enabled else None
        self.provider = provider

    def run(self, symbol: str, steps: int = 100) -> Dict[str, Any]:
        strat_cfg = self.config.get("strategies", {})
        active_name = strat_cfg.get("active", "momentum")
        params = strat_cfg.get(active_name, {})
        strategy = StrategySelector.create(active_name, params)
        prices: List[float] = []
        equity_curve: List[float] = []
        stream = self.provider.stream_prices(symbol)
        for i in range(steps):
            ts, price = next(stream)
            prices.append(price)
            # update equity
            equity = self.broker.get_portfolio_value({symbol: price})
            self.exposure.update(equity)
            equity_curve.append(equity)
            if self.circuit.check():
                self.logger.log("Circuit breaker tripped; stopping simulation.")
                break
            snapshot = MarketSnapshot(prices=prices.copy())
            signal = strategy(snapshot)
            if signal == Signal.BUY:
                qty = 10
                order = Order(symbol, qty, OrderSide.BUY)
                position = self.broker.get_position(symbol)
                if self.validator.validate(order, position):
                    self.exec_manager.place_market_order(symbol, qty, OrderSide.BUY, price)
                    self.logger.log(f"BUY {qty} {symbol} at {price:.2f}")
            elif signal == Signal.SELL:
                qty = 10
                order = Order(symbol, qty, OrderSide.SELL)
                position = self.broker.get_position(symbol)
                if self.validator.validate(order, position):
                    self.exec_manager.place_market_order(symbol, qty, OrderSide.SELL, price)
                    self.logger.log(f"SELL {qty} {symbol} at {price:.2f}")
            # Jarvis analysis
            if self.llm_enabled and self.jarvis:
                self.jarvis.maybe_analyze(equity_curve, self.broker.trades, self.exposure, self.config)
        from ..backtest.analyzer import BacktestAnalyzer
        analyzer = BacktestAnalyzer()
        summary = analyzer.summarize(equity_curve, self.broker.trades)
        summary["equity_curve"] = equity_curve
        summary["trades"] = [
            {
                "timestamp": t.timestamp.isoformat(),
                "symbol": t.order.symbol,
                "side": t.order.side.value,
                "quantity": t.order.quantity,
                "price": t.price,
                "cost": t.cost,
            }
            for t in self.broker.trades
        ]
        return summary