from __future__ import annotations
import torch as th
import torch.nn as nn
from stable_baselines3.common.torch_layers import BaseFeaturesExtractor

class WindowCNNExtractor(BaseFeaturesExtractor):
    """
    Dict obs:
      - window: (L, N, F) -> treat as (B, C=F, H=L, W=N) for Conv2d
      - portfolio: (P,)    -> small MLP
    """
    def __init__(self, observation_space, out_dim: int = 256):
        super().__init__(observation_space, features_dim=out_dim)
        win_space = observation_space["window"]
        port_space = observation_space["portfolio"]
        L, N, F = win_space.shape
        P = port_space.shape[0]

        C = F
        self.cnn = nn.Sequential(
            nn.Conv2d(C, 32, kernel_size=(5, 1), stride=(2, 1), padding=(2, 0)),
            nn.ReLU(),
            nn.Conv2d(32, 64, kernel_size=(5, 3), stride=(2, 1), padding=(2, 1)),
            nn.ReLU(),
            nn.Conv2d(64, 64, kernel_size=(3, 3), stride=(2, 1), padding=(1, 1)),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d((1, 1))  # -> (B,64,1,1)
        )
        self.port_mlp = nn.Sequential(
            nn.Linear(P, 64),
            nn.ReLU(),
            nn.Linear(64, 64),
            nn.ReLU(),
        )
        self.proj = nn.Sequential(
            nn.Linear(64 + 64, out_dim),
            nn.ReLU(),
        )

    def forward(self, obs_dict):
        win = obs_dict["window"]            # (B,L,N,F)
        port = obs_dict["portfolio"]        # (B,P)
        win = win.permute(0, 3, 1, 2).contiguous()  # (B,F,L,N)
        feat_win = self.cnn(win).view(win.size(0), -1)
        feat_port = self.port_mlp(port)
        return self.proj(th.cat([feat_win, feat_port], dim=1))


class WindowLSTMExtractor(BaseFeaturesExtractor):
    """LSTM-based extractor for windowed observations.

    Dict obs:
      - window: (L, N, F) treated as sequence of length ``L`` with features ``N*F``
      - portfolio: (P,) processed via a small MLP
    """

    def __init__(self, observation_space, out_dim: int = 256,
                 hidden_size: int = 128, num_layers: int = 1,
                 dropout: float = 0.0):
        super().__init__(observation_space, features_dim=out_dim)
        win_space = observation_space["window"]
        port_space = observation_space["portfolio"]
        L, N, F = win_space.shape
        P = port_space.shape[0]

        in_dim = N * F
        # batch_first so inputs are (B, L, in_dim)
        self.lstm = nn.LSTM(
            input_size=in_dim,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )

        self.port_mlp = nn.Sequential(
            nn.Linear(P, 64),
            nn.ReLU(),
            nn.Linear(64, 64),
            nn.ReLU(),
        )
        self.proj = nn.Sequential(
            nn.Linear(hidden_size + 64, out_dim),
            nn.ReLU(),
        )

    def forward(self, obs_dict):
        win = obs_dict["window"]            # (B,L,N,F)
        port = obs_dict["portfolio"]        # (B,P)
        B, L, N, F = win.shape
        win = win.view(B, L, N * F)
        _, (h_n, _) = self.lstm(win)
        feat_win = h_n[-1]                  # (B, hidden_size)
        feat_port = self.port_mlp(port)
        return self.proj(th.cat([feat_win, feat_port], dim=1))
