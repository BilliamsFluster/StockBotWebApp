"""Model estimation for regime-switching probabilities."""

from __future__ import annotations

import json
import os
import pickle
from typing import List, Tuple

import numpy as np
from sklearn.cluster import KMeans

from .markov_states import default_states


def fit_hmm(series: List[float], n_states: int) -> Tuple[np.ndarray, List[Tuple[float, float]], List[str]]:
    """Estimate a simple Gaussian HMM via clustering and counting.

    Parameters
    ----------
    series : list of float
        Observed return/feature series.
    n_states : int
        Number of latent regimes.

    Returns
    -------
    transition : np.ndarray
        Estimated transition matrix ``A`` with shape ``(n_states, n_states)``.
    emissions : list[tuple]
        List of ``(mean, std)`` tuples for each state's Gaussian emission.
    state_names : list[str]
        Names for each regime, derived from :func:`default_states`.
    """

    X = np.array(series).reshape(-1, 1)
    kmeans = KMeans(n_clusters=n_states, n_init=10, random_state=0).fit(X)
    labels = kmeans.labels_
    trans = np.zeros((n_states, n_states))
    for i in range(len(labels) - 1):
        trans[labels[i], labels[i + 1]] += 1
    trans = np.where(trans.sum(axis=1, keepdims=True) == 0, 1.0 / n_states, trans)
    trans = trans / trans.sum(axis=1, keepdims=True)
    emissions: List[Tuple[float, float]] = []
    for i in range(n_states):
        vals = X[labels == i].flatten()
        if len(vals) == 0:
            mean, std = 0.0, 1.0
        else:
            mean, std = float(vals.mean()), float(vals.std() or 1e-6)
        emissions.append((mean, std))
    state_names = default_states(n_states).state_names
    return trans, emissions, state_names


def train_model(series: List[float], n_states: int, out_dir: str) -> str:
    """Fit an HMM and persist transition/emission parameters."""

    transition, emissions, state_names = fit_hmm(series, n_states)
    os.makedirs(out_dir, exist_ok=True)
    np.save(os.path.join(out_dir, "transition.npy"), transition)
    with open(os.path.join(out_dir, "emissions.pkl"), "wb") as f:
        pickle.dump(emissions, f)
    with open(os.path.join(out_dir, "state_meta.json"), "w") as f:
        json.dump({"state_names": state_names}, f)
    return out_dir
