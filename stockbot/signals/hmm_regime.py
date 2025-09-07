from __future__ import annotations

"""Hidden Markov Model utilities for market regimes.

This module provides a light wrapper around ``hmmlearn``'s ``GaussianHMM``
with a diagonal covariance structure.  The helper standardises the input
features during training and persists the fitted parameters so the model can
be reused for out-of-sample evaluation or live trading.

The implementation purposely keeps the API small – only what the rest of the
codebase currently needs.  It does not aim to be a full featured HMM package
but offers a clean, well typed interface.
"""

from dataclasses import dataclass, asdict
from typing import Dict

import json
import numpy as np
from hmmlearn.hmm import GaussianHMM
from sklearn.cluster import KMeans


@dataclass
class HMMConfig:
    """Configuration for :class:`GaussianDiagHMM`."""

    n_states: int = 3
    var_floor: float = 1e-5
    max_iter: int = 100
    tol: float = 1e-4
    seed: int | None = None


class GaussianDiagHMM:
    """Gaussian HMM with diagonal covariances.

    Parameters
    ----------
    cfg:
        Model configuration.
    """

    def __init__(self, cfg: HMMConfig):
        self.cfg = cfg
        self.model = GaussianHMM(
            n_components=cfg.n_states,
            covariance_type="diag",
            n_iter=cfg.max_iter,
            tol=cfg.tol,
            random_state=cfg.seed,
            init_params="",  # keep any manually set params; avoid overwrite warnings
        )
        self.feature_mean_: np.ndarray | None = None
        self.feature_std_: np.ndarray | None = None

    # ------------------------------------------------------------------
    def fit(self, X_train: np.ndarray) -> "GaussianDiagHMM":
        """Fit the HMM on ``X_train``.

        ``X_train`` must be shaped ``(T, D)`` where ``T`` is the number of
        observations and ``D`` is the feature dimension.
        """

        if X_train.ndim != 2:
            raise ValueError("X_train must be 2-D array of shape (T, D)")
        self.feature_mean_ = X_train.mean(axis=0)
        self.feature_std_ = X_train.std(axis=0) + 1e-8
        X_std = (X_train - self.feature_mean_) / self.feature_std_

        # KMeans initialisation for the means.
        km = KMeans(n_clusters=self.cfg.n_states, n_init=10, random_state=self.cfg.seed)
        labels = km.fit_predict(X_std)
        means = km.cluster_centers_

        # Diagonal variances per cluster with floor.
        covars = np.zeros((self.cfg.n_states, X_std.shape[1]))
        for k in range(self.cfg.n_states):
            cluster_data = X_std[labels == k]
            if len(cluster_data) == 0:
                covars[k] = 1.0
            else:
                var = cluster_data.var(axis=0)
                covars[k] = np.maximum(var, self.cfg.var_floor)

        # Near-uniform transition matrix with self-bias.
        A = np.full((self.cfg.n_states, self.cfg.n_states), 1.0 / self.cfg.n_states)
        np.fill_diagonal(A, np.diag(A) + 0.2)
        A /= A.sum(axis=1, keepdims=True)

        self.model.startprob_ = np.full(self.cfg.n_states, 1.0 / self.cfg.n_states)
        self.model.transmat_ = A
        self.model.means_ = means
        self.model.covars_ = covars
        self.model.fit(X_std)
        return self

    # ------------------------------------------------------------------
    def _ensure_fitted(self) -> None:
        if self.feature_mean_ is None or self.feature_std_ is None:
            raise RuntimeError("Model must be fitted or loaded before use")

    def _standardise(self, X: np.ndarray) -> np.ndarray:
        self._ensure_fitted()
        return (X - self.feature_mean_) / self.feature_std_

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Posterior probabilities for each state."""

        X_std = self._standardise(X)
        return self.model.predict_proba(X_std)

    def viterbi(self, X: np.ndarray) -> np.ndarray:
        """Most likely state sequence (Viterbi path)."""

        X_std = self._standardise(X)
        return self.model.predict(X_std)

    # ------------------------------------------------------------------
    def save(self, path: str, feature_meta: Dict) -> None:
        """Persist model parameters to ``path``.

        Parameters
        ----------
        path:
            File path to store the ``.npz`` blob.
        feature_meta:
            Auxiliary metadata (feature names, etc.) stored alongside the
            parameters.  Serialised as JSON in the archive.
        """

        self._ensure_fitted()
        payload = {
            "startprob": self.model.startprob_,
            "transmat": self.model.transmat_,
            "means": self.model.means_,
            "covars": self.model.covars_,
            "feature_mean": self.feature_mean_,
            "feature_std": self.feature_std_,
            "cfg": asdict(self.cfg),
            "feature_meta": json.dumps(feature_meta),
        }
        np.savez_compressed(path, **payload)

    # ------------------------------------------------------------------
    @staticmethod
    def load(path: str) -> "GaussianDiagHMM":
        """Load a previously saved model."""

        data = np.load(path, allow_pickle=True)
        cfg_dict = data["cfg"].item()
        cfg = HMMConfig(**cfg_dict)
        obj = GaussianDiagHMM(cfg)
        obj.model.startprob_ = data["startprob"]
        obj.model.transmat_ = data["transmat"]
        obj.model.means_ = data["means"]
        obj.model.covars_ = data["covars"]
        obj.feature_mean_ = data["feature_mean"]
        obj.feature_std_ = data["feature_std"]
        return obj
