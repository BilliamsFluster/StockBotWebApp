"""Backtest runner that orchestrates the entire trading pipeline."""

from __future__ import annotations

from datetime import datetime
from typing import Dict, Any, List, Iterable

from config import load_settings
from ingestion import MockProvider, BaseProvider
from execution import PaperBroker, ExecutionManager, OrderSide
from strategy import StrategySelector, BaseStrategy, MarketSnapshot, Signal
from risk import Validator, ExposureTracker, CircuitBreaker, RiskParams, BreakerParams
from monitor import BotLogger
from jarvis import JarvisAgent
from execution.base_broker import Order, OrderSide



class BacktestRunner:
    """Run a backtest over historical data and return results."""

    def __init__(
        self,
        config: Dict[str, Any],
        data_provider: BaseProvider,
    ) -> None:
        self.config = config
        self.provider = data_provider
        settings = config.get("settings", {})
        initial_cash = settings.get("initial_cash", 100000.0)
        self.broker = PaperBroker(initial_cash=initial_cash)
        self.exec_manager = ExecutionManager(self.broker)
        # risk params
        risk_cfg = settings.get("risk", {})
        self.validator = Validator(RiskParams(max_position_size=risk_cfg.get("max_position_size", 100)))
        # exposure tracker and circuit breaker
        self.exposure = ExposureTracker()
        self.circuit = CircuitBreaker(
            BreakerParams(max_drawdown=risk_cfg.get("max_drawdown", 0.1)), self.exposure
        )
        # logger
        log_cfg = settings.get("logging", {})
        self.logger = BotLogger(
            log_dir=log_cfg.get("log_dir"), enable_file_logging=log_cfg.get("enable_file_logging", False)
        )
        # jarvis
        self.llm_enabled = settings.get("llm_enabled", False)
        if self.llm_enabled:
            self.jarvis = JarvisAgent(config)
        else:
            self.jarvis = None

    def run(self, symbol: str, start: datetime, end: datetime, interval: str = "1d") -> Dict[str, Any]:
        """Execute backtest over the given date range and return summary."""
        # load strategy from config
        strat_cfg = self.config.get("strategies", {})
        active_name = strat_cfg.get("active", "momentum")
        params = strat_cfg.get(active_name, {})
        strategy = StrategySelector.create(active_name, params)

        equity_curve: List[float] = []
        prices: List[float] = []
        # iterate over historical data
        for ts, price in self.provider.get_historical_data(symbol, start, end, interval):
            prices.append(price)
            # compute current portfolio equity before action
            market_prices = {symbol: price}
            equity = self.broker.get_portfolio_value(market_prices)
            self.exposure.update(equity)
            equity_curve.append(equity)
            # Check circuit breaker
            if self.circuit.check():
                self.logger.log("Circuit breaker tripped; halting trading.")
                break
            # strategy snapshot
            snapshot = MarketSnapshot(prices=prices.copy())
            signal = strategy(snapshot)
            if signal == Signal.BUY:
                # Determine quantity: simple fixed size of 10
                qty = 10
                order = Order(symbol, qty, OrderSide.BUY)
                # risk check
                current_position = self.broker.get_position(symbol)
                if self.validator.validate(order, current_position):
                    trade = self.exec_manager.place_market_order(symbol, qty, OrderSide.BUY, price)
                    self.logger.log(f"BUY {qty} {symbol} at {price:.2f}")
                else:
                    self.logger.log("Buy order rejected by risk validator.")
            elif signal == Signal.SELL:
                qty = 10
                order = Order(symbol, qty, OrderSide.SELL)
                current_position = self.broker.get_position(symbol)
                if self.validator.validate(order, current_position):
                    trade = self.exec_manager.place_market_order(symbol, qty, OrderSide.SELL, price)
                    self.logger.log(f"SELL {qty} {symbol} at {price:.2f}")
                else:
                    self.logger.log("Sell order rejected by risk validator.")
            # call jarvis occasionally
            if self.llm_enabled and self.jarvis:
                self.jarvis.maybe_analyze(equity_curve, self.broker.trades, self.exposure, self.config)
        # compute final portfolio value at end
        if prices:
            final_price = prices[-1]
            equity = self.broker.get_portfolio_value({symbol: final_price})
            self.exposure.update(equity)
            equity_curve.append(equity)
        from .analyzer import BacktestAnalyzer

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