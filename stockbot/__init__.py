"""Top-level package for the stockboty prototype.

This package contains modules for data ingestion, strategy execution,
risk management, monitoring, an optional large‑language‑model wrapper,
and utilities for running a simple trading bot.  The goal of this
project is to provide a minimal yet functional implementation of the
architecture described in the user’s specification.  The code is
organized into subpackages reflecting the different layers of the
system.  Each module exposes simple classes and functions that can be
combined to build a complete trading pipeline for backtesting or
simulation purposes.

The package intentionally avoids any external dependencies beyond
standard Python libraries and the PyYAML package, which is used for
configuration.  It is written in a straightforward manner to make it
easy to understand and extend.  See the README or the individual
module docstrings for more details on how to use the components.
"""

__all__ = [
    "config",
    "ingestion",
    "execution",
    "strategy",
    "models",
    "risk",
    "monitor",
    "jarvis",
    "backtest",
    "simulation",
    "utils",
]