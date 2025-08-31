from __future__ import annotations

import json
import os
import pickle
from dataclasses import dataclass
from math import erf, sqrt, exp, pi
from typing import List, Dict, Any

import numpy as np
from sklearn.cluster import KMeans


def _gaussian_pdf(x: float, mean: float, std: float) -> float:
    std = max(std, 1e-6)
    return (1.0 / (std * sqrt(2 * pi))) * exp(-0.5 * ((x - mean) / std) ** 2)


def _gaussian_cdf_pos(mean: float, std: float) -> float:
    std = max(std, 1e-6)
    return 0.5 * (1 + erf(mean / (std * sqrt(2))))


@dataclass
class RegimeHMM:
    """Simple Gaussian HMM estimated via clustering and counting."""

    n_states: int
    transition: np.ndarray | None = None
    emissions: List[tuple] | None = None  # (mean, std)
    state_names: List[str] | None = None

    def fit(self, series: List[float]) -> "RegimeHMM":
        X = np.array(series).reshape(-1, 1)
        kmeans = KMeans(n_clusters=self.n_states, n_init=10, random_state=0).fit(X)
        labels = kmeans.labels_
        self.state_names = [f"state_{i}" for i in range(self.n_states)]
        trans = np.zeros((self.n_states, self.n_states))
        for i in range(len(labels) - 1):
            trans[labels[i], labels[i + 1]] += 1
        trans = np.where(trans.sum(axis=1, keepdims=True) == 0,
                         1.0 / self.n_states,
                         trans)
        trans = trans / trans.sum(axis=1, keepdims=True)
        self.transition = trans
        self.emissions = []
        for i in range(self.n_states):
            vals = X[labels == i].flatten()
            if len(vals) == 0:
                mean, std = 0.0, 1.0
            else:
                mean, std = float(vals.mean()), float(vals.std() or 1e-6)
            self.emissions.append((mean, std))
        return self

    # ---- Serialization ---------------------------------------------------------
    def save(self, out_dir: str) -> None:
        if self.transition is None or self.emissions is None:
            raise ValueError("Model not trained")
        os.makedirs(out_dir, exist_ok=True)
        np.save(os.path.join(out_dir, "transition.npy"), self.transition)
        with open(os.path.join(out_dir, "emissions.pkl"), "wb") as f:
            pickle.dump(self.emissions, f)
        meta = {"state_names": self.state_names}
        with open(os.path.join(out_dir, "state_meta.json"), "w") as f:
            json.dump(meta, f)

    @classmethod
    def load(cls, model_dir: str) -> "RegimeHMM":
        trans = np.load(os.path.join(model_dir, "transition.npy"))
        with open(os.path.join(model_dir, "emissions.pkl"), "rb") as f:
            emissions = pickle.load(f)
        with open(os.path.join(model_dir, "state_meta.json")) as f:
            meta = json.load(f)
        return cls(
            n_states=len(emissions),
            transition=trans,
            emissions=emissions,
            state_names=meta.get("state_names"),
        )

    # ---- Inference -------------------------------------------------------------
    def infer(self, series: List[float]) -> Dict[str, Any]:
        if self.transition is None or self.emissions is None:
            raise ValueError("Model not loaded")
        n = len(series)
        m = self.n_states
        start = np.full(m, 1.0 / m)
        alpha = np.zeros((n, m))
        for j in range(m):
            mean, std = self.emissions[j]
            alpha[0, j] = start[j] * _gaussian_pdf(series[0], mean, std)
        alpha[0] /= alpha[0].sum()
        for t in range(1, n):
            for j in range(m):
                mean, std = self.emissions[j]
                emit = _gaussian_pdf(series[t], mean, std)
                alpha[t, j] = emit * np.dot(alpha[t - 1], self.transition[:, j])
            alpha[t] /= alpha[t].sum()
        posteriors = [dict(zip(self.state_names, alpha[t])) for t in range(n)]
        next_state = np.dot(alpha[-1], self.transition)
        p_up_state = [_gaussian_cdf_pos(*e) for e in self.emissions]
        p_up = float(np.dot(next_state, p_up_state))
        return {"posteriors": posteriors, "p_up": p_up}


# Convenience functions ---------------------------------------------------------

def train_model(series: List[float], n_states: int, out_dir: str) -> str:
    model = RegimeHMM(n_states=n_states).fit(series)
    model.save(out_dir)
    return out_dir


def load_model(model_dir: str) -> RegimeHMM:
    return RegimeHMM.load(model_dir)


def infer_sequence(model_dir: str, series: List[float]) -> Dict[str, Any]:
    model = load_model(model_dir)
    return model.infer(series)
