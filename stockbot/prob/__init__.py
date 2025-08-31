"""Probability models for StockBot.

Provides regime-switching probabilistic engines used to estimate
state/posterior probabilities and next-step edge. This module is kept
intentionally light-weight so it can be imported by the API layer and
CLI utilities.
"""

from .markov_states import MarkovStates, default_states
from .estimation import fit_hmm, train_model
from .inference import forward_filter, infer_sequence, load_model
from .walkforward import evaluate_walkforward, split_walkforward

__all__ = [
    "MarkovStates",
    "default_states",
    "fit_hmm",
    "train_model",
    "forward_filter",
    "infer_sequence",
    "load_model",
    "evaluate_walkforward",
    "split_walkforward",
]
