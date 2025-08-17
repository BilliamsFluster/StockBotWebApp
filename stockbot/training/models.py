from __future__ import annotations
import torch
import torch.nn as nn

class LSTMClassifier(nn.Module):
    def __init__(self, num_features: int, hidden_size: int = 96, num_layers: int = 1, dropout: float = 0.2):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=num_features,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.fc = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(hidden_size, 2)
        )

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])

class CNN1DClassifier(nn.Module):
    """
    1D CNN over the time axis (sequence_length) for fast training and strong baselines.
    """
    def __init__(self, num_features: int, seq_len: int, dropout: float = 0.2):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(in_channels=num_features, out_channels=64, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv1d(64, 128, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.AdaptiveMaxPool1d(1),
        )
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(dropout),
            nn.Linear(128, 2)
        )

    def forward(self, x):
        # x: [B, T, F] -> transpose to [B, F, T] for Conv1d
        x = x.transpose(1, 2)
        z = self.net(x)
        return self.head(z)

class TCNBlock(nn.Module):
    def __init__(self, in_ch, out_ch, k=3, d=1, dropout=0.1):
        super().__init__()
        self.conv1 = nn.Conv1d(in_ch, out_ch, kernel_size=k, padding=d*(k-1)//2, dilation=d)
        self.relu1 = nn.ReLU(inplace=True)
        self.conv2 = nn.Conv1d(out_ch, out_ch, kernel_size=k, padding=d*(k-1)//2, dilation=d)
        self.relu2 = nn.ReLU(inplace=True)
        self.dropout = nn.Dropout(dropout)
        self.res = nn.Conv1d(in_ch, out_ch, 1) if in_ch != out_ch else nn.Identity()

    def forward(self, x):
        h = self.relu1(self.conv1(x))
        h = self.dropout(self.relu2(self.conv2(h)))
        return h + self.res(x)

class TCNClassifier(nn.Module):
    def __init__(self, num_features: int, channels=(64, 128), dropout: float = 0.1):
        super().__init__()
        layers = []
        in_ch = num_features
        dilation = 1
        for out_ch in channels:
            layers.append(TCNBlock(in_ch, out_ch, k=3, d=dilation, dropout=dropout))
            in_ch = out_ch
            dilation *= 2
        self.tcn = nn.Sequential(*layers, nn.AdaptiveMaxPool1d(1))
        self.head = nn.Sequential(nn.Flatten(), nn.Dropout(dropout), nn.Linear(channels[-1], 2))

    def forward(self, x):
        x = x.transpose(1, 2)  # [B, T, F] -> [B, F, T]
        z = self.tcn(x)
        return self.head(z)

def build_model(kind: str, num_features: int, seq_len: int, hidden_size: int = 96, dropout: float = 0.2):
    kind = (kind or "lstm").lower()
    if kind == "lstm":
        return LSTMClassifier(num_features=num_features, hidden_size=hidden_size, dropout=dropout)
    if kind == "cnn1d":
        return CNN1DClassifier(num_features=num_features, seq_len=seq_len, dropout=dropout)
    if kind == "tcn":
        return TCNClassifier(num_features=num_features, dropout=dropout)
    if kind == "xgb":
        # Placeholder: XGB handled in pipeline (non-torch)
        return None
    raise ValueError(f"Unknown model kind: {kind}")
