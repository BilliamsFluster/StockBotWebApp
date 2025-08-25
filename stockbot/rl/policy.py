from __future__ import annotations
"""
Feature extractors for Multi-Input dict observations.

Expected observation Dict space:
  - "window": (L, N, F)  # rolling window length L, N assets, F features per asset
  - "portfolio": (P,)    # portfolio/account-level features

Extractors:
  - WindowCNNExtractor: treats "window" as an image-like tensor and uses Conv2d
  - WindowLSTMExtractor: treats "window" as a sequence and uses an LSTM

Both include LayerNorm, Dropout and orthogonal initialization to stabilize training
on non-stationary financial time-series.
"""

import torch as th
import torch.nn as nn
from stable_baselines3.common.torch_layers import BaseFeaturesExtractor


def orthogonal_init(module: nn.Module) -> None:
    """Orthogonal initialization for Linear/Conv2d + zero bias."""
    if isinstance(module, (nn.Linear, nn.Conv2d)):
        nn.init.orthogonal_(module.weight, gain=nn.init.calculate_gain("relu"))
        if module.bias is not None:
            nn.init.zeros_(module.bias)


class WindowCNNExtractor(BaseFeaturesExtractor):
    """
    CNN-based extractor for windowed observations.

    Dict obs:
      - window: (L, N, F) -> we permute to (B, C=F, H=L, W=N) for Conv2d
      - portfolio: (P,)    -> processed via a small MLP
    """
    def __init__(self, observation_space, out_dim: int = 256, dropout: float = 0.10):
        super().__init__(observation_space, features_dim=out_dim)
        win_space = observation_space["window"]
        port_space = observation_space["portfolio"]
        L, N, F = win_space.shape  # (length, assets, features)
        P = port_space.shape[0]

        C = F
        self.cnn = nn.Sequential(
            nn.Conv2d(C, 32, kernel_size=(5, 1), stride=(2, 1), padding=(2, 0)),
            nn.ReLU(),
            nn.Conv2d(32, 64, kernel_size=(5, 3), stride=(2, 1), padding=(2, 1)),
            nn.ReLU(),
            nn.Conv2d(64, 64, kernel_size=(3, 3), stride=(2, 1), padding=(1, 1)),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d((1, 1))  # -> (B, 64, 1, 1)
        )

        self.port_mlp = nn.Sequential(
            nn.Linear(P, 64), nn.ReLU(),
            nn.LayerNorm(64),
            nn.Dropout(dropout),
            nn.Linear(64, 64), nn.ReLU(),
            nn.LayerNorm(64),
            nn.Dropout(dropout),
        )

        self.proj = nn.Sequential(
            nn.Linear(64 + 64, out_dim), nn.ReLU(),
            nn.LayerNorm(out_dim),
            nn.Dropout(dropout),
        )

        self.apply(orthogonal_init)

    def forward(self, obs_dict):
        win = obs_dict["window"]            # (B, L, N, F)
        port = obs_dict["portfolio"]        # (B, P)

        # Conv2d expects (B, C, H, W) = (B, F, L, N)
        win = win.permute(0, 3, 1, 2).contiguous()
        feat_win = self.cnn(win).flatten(1)      # (B, 64)
        feat_port = self.port_mlp(port)          # (B, 64)
        fused = th.cat([feat_win, feat_port], dim=1)
        return self.proj(fused)                  # (B, out_dim)


class WindowLSTMExtractor(BaseFeaturesExtractor):
    """
    LSTM-based extractor for windowed observations.

    Dict obs:
      - window: (L, N, F) -> treated as sequence of length L with features N*F
      - portfolio: (P,)   -> processed via a small MLP
    """
    def __init__(
        self,
        observation_space,
        out_dim: int = 256,
        hidden_size: int = 128,
        num_layers: int = 1,
        dropout: float = 0.10,
    ):
        super().__init__(observation_space, features_dim=out_dim)
        win_space = observation_space["window"]
        port_space = observation_space["portfolio"]
        L, N, F = win_space.shape
        P = port_space.shape[0]

        in_dim = N * F
        self.lstm = nn.LSTM(
            input_size=in_dim,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )

        self.port_mlp = nn.Sequential(
            nn.Linear(P, 64), nn.ReLU(),
            nn.LayerNorm(64),
            nn.Dropout(dropout),
            nn.Linear(64, 64), nn.ReLU(),
            nn.LayerNorm(64),
            nn.Dropout(dropout),
        )

        self.proj = nn.Sequential(
            nn.Linear(hidden_size + 64, out_dim), nn.ReLU(),
            nn.LayerNorm(out_dim),
            nn.Dropout(dropout),
        )

        self.apply(orthogonal_init)

    def forward(self, obs_dict):
        win = obs_dict["window"]            # (B, L, N, F)
        port = obs_dict["portfolio"]        # (B, P)
        B, L, N, F = win.shape
        win = win.view(B, L, N * F)         # (B, L, N*F)
        _, (h_n, _) = self.lstm(win)
        feat_win = h_n[-1]                  # (B, hidden_size)
        feat_port = self.port_mlp(port)     # (B, 64)
        fused = th.cat([feat_win, feat_port], dim=1)
        return self.proj(fused)             # (B, out_dim)
