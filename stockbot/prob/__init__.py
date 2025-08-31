"""Probability models for StockBot.

Provides regime-switching probabilistic engines used to estimate
state/posterior probabilities and next-step edge.  This module is kept
intentionally light-weight so it can be imported by the API layer and
CLI utilities.
"""

from .model import RegimeHMM, train_model, load_model, infer_sequence

__all__ = [
    "RegimeHMM",
    "train_model",
    "load_model",
    "infer_sequence",
]
