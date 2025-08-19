from __future__ import annotations
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.nn.utils.rnn import pad_sequence
import math

class LSTMModel(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, output_size, dropout=0.2):
        super(LSTMModel, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True, dropout=dropout)
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_size, output_size)
        
    def forward(self, x):
        # Initialize hidden state and cell state
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        
        out, _ = self.lstm(x, (h0, c0))
        
        # Use the last time step output
        out = self.dropout(out[:, -1, :])
        out = self.fc(out)
        return out

class CNN1DModel(nn.Module):
    def __init__(self, input_size, num_classes, dropout=0.2):
        super(CNN1DModel, self).__init__()
        
        # Convolutional layers
        self.conv1 = nn.Conv1d(input_size, 64, kernel_size=3, padding=1)
        self.conv2 = nn.Conv1d(64, 128, kernel_size=3, padding=1)
        self.conv3 = nn.Conv1d(128, 256, kernel_size=3, padding=1)
        
        # Pooling
        self.pool = nn.MaxPool1d(2)
        
        # Fully connected layers
        self.fc1 = nn.Linear(256 * 4, 128)  # Adjust based on sequence length
        self.fc2 = nn.Linear(128, num_classes)
        self.dropout = nn.Dropout(dropout)
        
    def forward(self, x):
        # x shape: (batch_size, seq_len, input_size)
        x = x.transpose(1, 2)  # Convert to (batch_size, input_size, seq_len)
        
        x = self.pool(F.relu(self.conv1(x)))
        x = self.pool(F.relu(self.conv2(x)))
        x = self.pool(F.relu(self.conv3(x)))
        
        # Flatten
        x = x.view(x.size(0), -1)
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)
        return x

class TCNBlock(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size, dropout=0.2):
        super(TCNBlock, self).__init__()
        
        self.conv1 = nn.Conv1d(in_channels, out_channels, kernel_size, padding=kernel_size-1)
        self.conv2 = nn.Conv1d(out_channels, out_channels, kernel_size, padding=kernel_size-1)
        self.dropout = nn.Dropout(dropout)
        self.relu = nn.ReLU()
        self.downsample = nn.Conv1d(in_channels, out_channels, 1) if in_channels != out_channels else None

    def forward(self, x):
        residual = x
        x = self.conv1(x)
        x = self.relu(x)
        x = self.dropout(x)
        x = self.conv2(x)
        x = self.relu(x)
        x = self.dropout(x)
        # Crop x to match residual's sequence length
        if x.shape[-1] > residual.shape[-1]:
            x = x[..., :residual.shape[-1]]
        elif x.shape[-1] < residual.shape[-1]:
            residual = residual[..., :x.shape[-1]]
        # Downsample residual if needed
        if self.downsample:
            residual = self.downsample(residual)
        return x + residual

class TCNModel(nn.Module):
    def __init__(self, input_size, num_classes, num_blocks=3, kernel_size=3, dropout=0.2):
        super(TCNModel, self).__init__()
        
        self.conv_input = nn.Conv1d(input_size, 64, 1)
        self.tcn_blocks = nn.ModuleList([
            TCNBlock(64, 64, kernel_size, dropout) for _ in range(num_blocks)
        ])
        self.fc = nn.Linear(64, num_classes)
        
    def forward(self, x):
        # x shape: (batch_size, seq_len, input_size)
        x = x.transpose(1, 2)  # Convert to (batch_size, input_size, seq_len)
        x = self.conv_input(x)
        
        for block in self.tcn_blocks:
            x = block(x)
            
        # Global average pooling
        x = F.adaptive_avg_pool1d(x, 1)
        x = x.view(x.size(0), -1)
        x = self.fc(x)
        return x

class AttentionLayer(nn.Module):
    def __init__(self, hidden_size):
        super(AttentionLayer, self).__init__()
        self.hidden_size = hidden_size
        self.attention = nn.Linear(hidden_size, 1)
        
    def forward(self, lstm_output):
        # lstm_output shape: (batch_size, seq_len, hidden_size)
        attention_weights = torch.softmax(self.attention(lstm_output), dim=1)
        context_vector = torch.sum(attention_weights * lstm_output, dim=1)
        return context_vector

class AttentionLSTMModel(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, output_size, dropout=0.2):
        super(AttentionLSTMModel, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True, dropout=dropout)
        self.attention = AttentionLayer(hidden_size)
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_size, output_size)
        
    def forward(self, x):
        # Initialize hidden state and cell state
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        
        out, _ = self.lstm(x, (h0, c0))
        
        # Apply attention
        context_vector = self.attention(out)
        out = self.dropout(context_vector)
        out = self.fc(out)
        return out

class EnsembleModel(nn.Module):
    def __init__(self, input_size, num_classes, hidden_size=96, dropout=0.2):
        super(EnsembleModel, self).__init__()
        
        # Individual models
        self.lstm_model = LSTMModel(input_size, hidden_size, 2, num_classes, dropout)
        self.cnn_model = CNN1DModel(input_size, num_classes, dropout)
        self.tcn_model = TCNModel(input_size, num_classes, dropout=dropout)
        
        # Ensemble weights
        self.weights = nn.Parameter(torch.ones(3))
        
    def forward(self, x):
        # Get predictions from each model
        lstm_pred = self.lstm_model(x)
        cnn_pred = self.cnn_model(x)
        tcn_pred = self.tcn_model(x)
        
        # Normalize weights
        weights = F.softmax(self.weights, dim=0)
        
        # Ensemble prediction
        ensemble_pred = (weights[0] * lstm_pred + 
                         weights[1] * cnn_pred + 
                         weights[2] * tcn_pred)
        
        return ensemble_pred

# Model factory function
def create_model(model_name, input_size, num_classes, hidden_size=96, dropout=0.2):
    if model_name == "lstm":
        return LSTMModel(input_size, hidden_size, 2, num_classes, dropout)
    elif model_name == "cnn1d":
        return CNN1DModel(input_size, num_classes, dropout)
    elif model_name == "tcn":
        return TCNModel(input_size, num_classes, dropout=dropout)
    elif model_name == "attention_lstm":
        return AttentionLSTMModel(input_size, hidden_size, 2, num_classes, dropout)
    elif model_name == "ensemble":
        return EnsembleModel(input_size, num_classes, hidden_size, dropout)
    else:
        raise ValueError(f"Unknown model name: {model_name}")

def build_model(model_name, num_features, seq_len, hidden_size=96, dropout=0.2):
    # num_features = input_size, seq_len is not used by most models
    num_classes = 2  # or set dynamically if needed
    return create_model(model_name, num_features, num_classes, hidden_size, dropout)
