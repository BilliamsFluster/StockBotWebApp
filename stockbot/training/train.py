import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import os
import json
import time
from datetime import datetime
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class StockDataset(Dataset):
    def __init__(self, data, window_size=10, target_col='close'):
        self.data = data
        self.window_size = window_size
        self.target_col = target_col
        
    def __len__(self):
        return len(self.data) - self.window_size
    
    def __getitem__(self, idx):
        # Get the window of data
        window_data = self.data[idx:idx+self.window_size]
        
        # Features (all columns except target)
        features = window_data.drop(columns=[self.target_col]).values
        
        # Target value
        target = window_data[self.target_col].iloc[-1]
        
        return torch.FloatTensor(features), torch.FloatTensor([target])

class ModelTrainer:
    def __init__(self, model, device, config):
        self.model = model
        self.device = device
        self.config = config
        
        # Move model to device
        self.model.to(self.device)
        
        # Loss functions
        self.criterion = nn.CrossEntropyLoss()
        self.focal_loss = losses.FocalLoss(alpha=1, gamma=2)
        self.weighted_focal_loss = losses.WeightedFocalLoss(alpha=None, gamma=2)
        
        # Optimizers
        self.optimizer = optim.Adam(model.parameters(), 
                                  lr=config['learning_rate'], 
                                  weight_decay=config['weight_decay'])
        
        # Scheduler
        self.scheduler = optim.lr_scheduler.StepLR(self.optimizer, 
                                                 step_size=config['scheduler_step'], 
                                                 gamma=config['scheduler_gamma'])
        
        # Metrics tracking
        self.train_losses = []
        self.val_losses = []
        self.train_accuracies = []
        self.val_accuracies = []
        
    def calculate_accuracy(self, outputs, targets):
        _, predicted = torch.max(outputs.data, 1)
        total = targets.size(0)
        correct = (predicted == targets).sum().item()
        return correct / total
    
    def train_epoch(self, dataloader):
        self.model.train()
        running_loss = 0.0
        correct = 0
        total = 0
        
        for batch_idx, (data, target) in enumerate(dataloader):
            data, target = data.to(self.device), target.to(self.device)
            
            # Zero the parameter gradients
            self.optimizer.zero_grad()
            
            # Forward pass
            outputs = self.model(data)
            loss = self.criterion(outputs, target.long().squeeze())
            
            # Backward pass
            loss.backward()
            self.optimizer.step()
            
            # Statistics
            running_loss += loss.item()
            correct += self.calculate_accuracy(outputs, target)
            total += 1
            
        epoch_loss = running_loss / len(dataloader)
        epoch_acc = correct / total
        
        return epoch_loss, epoch_acc
    
    def validate(self, dataloader):
        self.model.eval()
        running_loss = 0.0
        correct = 0
        total = 0
        
        with torch.no_grad():
            for data, target in dataloader:
                data, target = data.to(self.device), target.to(self.device)
                
                outputs = self.model(data)
                loss = self.criterion(outputs, target.long().squeeze())
                
                running_loss += loss.item()
                correct += self.calculate_accuracy(outputs, target)
                total += 1
                
        epoch_loss = running_loss / len(dataloader)
        epoch_acc = correct / total
        
        return epoch_loss, epoch_acc
    
    def train(self, train_loader, val_loader, num_epochs):
        logger.info("Starting training...")
        
        for epoch in range(num_epochs):
            start_time = time.time()
            
            # Training
            train_loss, train_acc = self.train_epoch(train_loader)
            
            # Validation
            val_loss, val_acc = self.validate(val_loader)
            
            # Update scheduler
            self.scheduler.step()
            
            # Store metrics
            self.train_losses.append(train_loss)
            self.val_losses.append(val_loss)
            self.train_accuracies.append(train_acc)
            self.val_accuracies.append(val_acc)
            
            epoch_time = time.time() - start_time
            
            if (epoch + 1) % 10 == 0:
                logger.info(f'Epoch [{epoch+1}/{num_epochs}] '
                           f'Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.4f} '
                           f'Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.4f} '
                           f'Time: {epoch_time:.2f}s')
        
        logger.info("Training completed!")
    
    def save_model(self, path):
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'train_losses': self.train_losses,
            'val_losses': self.val_losses,
            'train_accuracies': self.train_accuracies,
            'val_accuracies': self.val_accuracies,
            'config': self.config
        }, path)
        logger.info(f"Model saved to {path}")
    
    def plot_training_history(self):
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
        
        # Plot losses
        ax1.plot(self.train_losses, label='Train Loss')
        ax1.plot(self.val_losses, label='Validation Loss')
        ax1.set_title('Model Loss')
        ax1.set_xlabel('Epoch')
        ax1.set_ylabel('Loss')
        ax1.legend()
        
        # Plot accuracies
        ax2.plot(self.train_accuracies, label='Train Accuracy')
        ax2.plot(self.val_accuracies, label='Validation Accuracy')
        ax2.set_title('Model Accuracy')
        ax2.set_xlabel('Epoch')
        ax2.set_ylabel('Accuracy')
        ax2.legend()
        
        plt.tight_layout()
        plt.savefig('training_history.png')
        plt.show()

def create_sample_data():
    """Create sample stock data for demonstration"""
    np.random.seed(42)
    dates = pd.date_range(start='2020-01-01', end='2023-12-31', freq='D')
    
    # Generate synthetic stock prices
    price = 100
    data = []
    
    for date in dates:
        # Random walk with some trend
        price = max(0, price + np.random.normal(0.001, 0.02))
        
        # Add some volatility clustering
        volatility = np.random.gamma(2, 0.5) if np.random.rand() < 0.1 else 0.02
        
        # Generate features
        features = {
            'open': price + np.random.normal(0, 0.01),
            'high': max(price, price + np.random.exponential(0.02)),
            'low': min(price, price - np.random.exponential(0.02)),
            'close': price,
            'volume': np.random.lognormal(10, 0.5),
            'date': date
        }
        
        data.append(features)
    
    return pd.DataFrame(data)

def main():
    # Configuration
    config = {
        'learning_rate': 0.001,
        'weight_decay': 1e-5,
        'scheduler_step': 30,
        'scheduler_gamma': 0.9,
        'batch_size': 32,
        'num_epochs': 100,
        'window_size': 10
    }
    
    # Device configuration
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    logger.info(f"Using device: {device}")
    
    # Create sample data
    df = create_sample_data()
    logger.info(f"Created sample dataset with {len(df)} rows")
    
    # Prepare features and target
    feature_cols = ['open', 'high', 'low', 'close', 'volume']
    df['target'] = (df['close'].shift(-1) > df['close']).astype(int)  # Binary classification
    
    # Remove last row with NaN target
    df = df.dropna()
    
    # Split data
    train_df, val_df = train_test_split(df, test_size=0.2, random_state=42)
    
    # Create datasets
    train_dataset = StockDataset(train_df[feature_cols + ['target']], 
                                window_size=config['window_size'], 
                                target_col='target')
    val_dataset = StockDataset(val_df[feature_cols + ['target']], 
                              window_size=config['window_size'], 
                              target_col='target')
    
    # Create data loaders
    train_loader = DataLoader(train_dataset, batch_size=config['batch_size'], shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=config['batch_size'], shuffle=False)
    
    # Initialize model (example with simple architecture)
    from models import SimpleStockModel  # Assuming this exists in your models.py
    
    model = SimpleStockModel(input_size=len(feature_cols), 
                            hidden_size=64, 
                            num_layers=2, 
                            output_size=2)  # Binary classification
    
    # Initialize trainer
    trainer = ModelTrainer(model, device, config)
    
    # Train the model
    trainer.train(train_loader, val_loader, config['num_epochs'])
    
    # Save the model
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    model_path = f"stock_model_{timestamp}.pth"
    trainer.save_model(model_path)
    
    # Plot training history
    trainer.plot_training_history()
    
    logger.info("Training pipeline completed successfully!")

if __name__ == "__main__":
    main()