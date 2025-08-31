"""Walk-forward evaluation for regime-switching models.

This module provides utilities to split a historical return series into
rolling train/test windows and evaluate a Hidden Markov Model (HMM) on
those folds. For each train/test split we fit a model using the existing
:mod:`stockbot.prob` estimation utilities, run inference on the test
segment and accumulate log-likelihood based metrics.

The module exposes a simple command line interface so the evaluation can
be executed as::

    python -m stockbot.prob.walkforward data.json --train 200 --test 50 --states 2

which will print a JSON blob containing per-fold log-likelihoods and the
average log-loss across folds.
"""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import numpy as np

from .estimation import train_model
from .inference import _gaussian_pdf, infer_sequence, load_model


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def _load_series(path: str) -> List[float]:
    p = Path(path)
    if p.suffix.lower() == ".json":
        return json.loads(p.read_text())
    elif p.suffix.lower() in {".txt", ".csv"}:
        return [float(x) for x in p.read_text().replace(",", " ").split() if x]
    else:
        raise ValueError("Unsupported file format")


# ---------------------------------------------------------------------------
# Walk-forward splitting
# ---------------------------------------------------------------------------

def split_walkforward(series: List[float], train_size: int, test_size: int) -> Iterable[Tuple[List[float], List[float]]]:
    """Generate rolling train/test splits.

    Parameters
    ----------
    series : list of float
        Full historical return series.
    train_size : int
        Number of observations used for fitting.
    test_size : int
        Number of observations in each evaluation window.
    """

    limit = len(series) - train_size - test_size + 1
    for start in range(0, max(limit, 0), test_size):
        train = series[start : start + train_size]
        test = series[start + train_size : start + train_size + test_size]
        if len(test) == test_size:
            yield train, test


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def _sequence_log_likelihood(series: List[float], transition: np.ndarray, emissions: List[Tuple[float, float]]) -> float:
    """Compute the log-likelihood of a sequence under an HMM."""

    m = len(emissions)
    start = np.full(m, 1.0 / m)
    alpha = start * np.array([_gaussian_pdf(series[0], *emissions[j]) for j in range(m)])
    c = alpha.sum()
    alpha /= c
    log_likelihood = np.log(c)
    for t in range(1, len(series)):
        next_alpha = np.zeros(m)
        for j in range(m):
            emit = _gaussian_pdf(series[t], *emissions[j])
            next_alpha[j] = emit * np.dot(alpha, transition[:, j])
        c = next_alpha.sum()
        next_alpha /= c
        log_likelihood += np.log(c)
        alpha = next_alpha
    return float(log_likelihood)


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def evaluate_walkforward(series: List[float], train_size: int, test_size: int, n_states: int) -> Dict[str, object]:
    """Run walk-forward evaluation and return metrics."""

    folds: List[Dict[str, float]] = []
    for train, test in split_walkforward(series, train_size, test_size):
        with tempfile.TemporaryDirectory() as tmp:
            train_model(train, n_states, tmp)
            # Run inference to mirror production pipeline
            infer_sequence(tmp, test)
            transition, emissions, _ = load_model(tmp)
            ll = _sequence_log_likelihood(test, transition, emissions)
            folds.append({"log_likelihood": ll, "log_loss": -ll / len(test)})
    avg_log_loss = float(np.mean([f["log_loss"] for f in folds])) if folds else float("nan")
    return {"folds": folds, "avg_log_loss": avg_log_loss}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Walk-forward evaluation of regime HMM")
    parser.add_argument("data", help="Path to return series (json/csv)")
    parser.add_argument("--train", type=int, required=True, help="Training window size")
    parser.add_argument("--test", type=int, required=True, help="Test window size")
    parser.add_argument("--states", type=int, default=2, help="Number of regimes")
    parser.add_argument("--out", help="Optional path to save metrics JSON")
    args = parser.parse_args()
    series = _load_series(args.data)
    metrics = evaluate_walkforward(series, args.train, args.test, args.states)
    output = json.dumps(metrics, indent=2)
    if args.out:
        Path(args.out).write_text(output)
    else:
        print(output)


if __name__ == "__main__":  # pragma: no cover
    main()
