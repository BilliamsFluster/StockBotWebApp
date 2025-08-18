import torch
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

def create_sequences(data, sequence_length):
    """
    Create sequences for time series prediction
    
    Args:
        data: Input data (numpy array or pandas DataFrame)
        sequence_length: Length of each sequence
    
    Returns:
        X, y: Sequences and targets
    """
    X, y = [], []
    
    if isinstance(data, pd.DataFrame):
        data = data.values
    
    for i in range(len(data) - sequence_length):
        X.append(data[i:(i + sequence_length)])
        y.append(data[i + sequence_length])
    
    return np.array(X), np.array(y)

def prepare_data(df, feature_cols, target_col, sequence_length=10, test_size=0.2):
    """
    Prepare data for training
    
    Args:
        df: Input DataFrame
        feature_cols: List of feature column names
        target_col: Target column name
        sequence_length: Length of sequences
        test_size: Proportion of data to use for testing
    
    Returns:
        train_loader, val_loader: Data loaders for training and validation
    """
    
    # Create sequences
    X, y = create_sequences(df[feature_cols + [target_col]], sequence_length)
    
    # Split data
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=test_size, random_state=42, shuffle=False
    )
    
    # Convert to PyTorch tensors
    X_train_tensor = torch.FloatTensor(X_train)
    X_val_tensor = torch.FloatTensor(X_val)
    y_train_tensor = torch.LongTensor(y_train) if len(np.unique(y)) <= 2 else torch.FloatTensor(y_train)
    y_val_tensor = torch.LongTensor(y_val) if len(np.unique(y)) <= 2 else torch.FloatTensor(y_val)
    
    # Create datasets
    train_dataset = torch.utils.data.TensorDataset(X_train_tensor, y_train_tensor)
    val_dataset = torch.utils.data.TensorDataset(X_val_tensor, y_val_tensor)
    
    return train_dataset, val_dataset

def calculate_metrics(y_true, y_pred):
    """
    Calculate various metrics for model evaluation
    
    Args:
        y_true: True values
        y_pred: Predicted values
    
    Returns:
        Dictionary of metrics
    """
    
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, mean_squared_error, mean_absolute_error
    
    metrics = {}
    
    if len(np.unique(y_true)) <= 2:  # Binary classification
        metrics['accuracy'] = accuracy_score(y_true, y_pred)
        metrics['precision'] = precision_score(y_true, y_pred)
        metrics['recall'] = recall_score(y_true, y_pred)
        metrics['f1'] = f1_score(y_true, y_pred)
    else:  # Regression
        metrics['mse'] = mean_squared_error(y_true, y_pred)
        metrics['rmse'] = np.sqrt(metrics['mse'])
        metrics['mae'] = mean_absolute_error(y_true, y_pred)
    
    return metrics

def plot_predictions(y_true, y_pred, title="Predictions vs Actual"):
    """
    Plot predictions against actual values
    
    Args:
        y_true: True values
        y_pred: Predicted values
        title: Plot title
    """
    
    plt.figure(figsize=(10, 6))
    
    if len(np.unique(y_true)) <= 2:  # Binary classification
        plt.scatter(y_true, y_pred, alpha=0.5)
        plt.plot([0, 1], [0, 1], 'r--')
        plt.xlabel('True Values')
        plt.ylabel('Predicted Values')
    else:  # Regression
        plt.scatter(y_true, y_pred, alpha=0.5)
        plt.plot([y_true.min(), y_true.max()], [y_true.min(), y_true.max()], 'r--')
        plt.xlabel('True Values')
        plt.ylabel('Predicted Values')
    
    plt.title(title)
    plt.grid(True)
    plt.show()

def get_model_info(model):
    """
    Get information about the model architecture
    
    Args:
        model: PyTorch model
    
    Returns:
        Dictionary with model information
    """
    
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    
    info = {
        'total_parameters': total_params,
        'trainable_parameters': trainable_params,
        'model_type': type(model).__name__
    }
    
    return info

def save_model_checkpoint(model, optimizer, epoch, loss, filepath):
    """
    Save model checkpoint
    
    Args:
        model: PyTorch model
        optimizer: Optimizer
        epoch: Current epoch
        loss: Current loss
        filepath: Path to save checkpoint
    """
    
    checkpoint = {
        'epoch': epoch,
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'loss': loss,
    }
    
    torch.save(checkpoint, filepath)
    print(f"Checkpoint saved to {filepath}")

def load_model_checkpoint(model, filepath):
    """
    Load model checkpoint
    
    Args:
        model: PyTorch model
        filepath: Path to checkpoint file
    
    Returns:
        Loaded model
    """
    
    checkpoint = torch.load(filepath)
    model.load_state_dict(checkpoint['model_state_dict'])
    print(f"Checkpoint loaded from {filepath}")
    
    return model

def create_sample_data(n_samples=1000):
    """
    Create sample stock market data for testing
    
    Args:
        n_samples: Number of samples to generate
    
    Returns:
        DataFrame with sample data
    """
    
    np.random.seed(42)
    
    dates = pd.date_range(start='2020-01-01', periods=n_samples, freq='D')
    
    # Generate correlated features
    price = 100 + np.cumsum(np.random.normal(0, 0.5, n_samples))
    volume = np.random.lognormal(10, 0.5, n_samples)
    
    # Create features with some correlation
    open_price = price + np.random.normal(0, 0.2, n_samples)
    high_price = np.maximum(open_price, price + np.abs(np.random.normal(0, 0.3, n_samples)))
    low_price = np.minimum(open_price, price - np.abs(np.random.normal(0, 0.3, n_samples)))
    
    # Create target (binary classification: 1 if next day's close > current close)
    target = (np.roll(price, -1) > price).astype(int)[:-1]
    
    data = pd.DataFrame({
        'date': dates,
        'open': open_price[:-1],
        'high': high_price[:-1],
        'low': low_price[:-1],
        'close': price[:-1],
        'volume': volume[:-1],
        'target': target
    })
    
    return data

# Example usage:
if __name__ == "__main__":
    # Create sample data
    df = create_sample_data(1000)
    print("Sample data created:")
    print(df.head())
    print(f"Shape: {df.shape}")