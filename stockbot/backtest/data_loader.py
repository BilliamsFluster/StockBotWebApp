
import pandas as pd
from typing import Dict, Any
from ingestion.yfinance_ingestion import YFinanceIngestion
from ingestion.alpha_vantage_ingestion import AlphaVantageIngestion

class BacktestDataLoader:
    """Data loader for backtesting that uses ingestion classes"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.data = None
        
    def load_data(self, source: str = 'yfinance', **kwargs) -> pd.DataFrame:
        """Load data using specified ingestion source"""
        
        if source == 'yfinance':
            ingestion_config = {
                'ticker': kwargs.get('ticker', 'AAPL'),
                'period': kwargs.get('period', '2y'),
                'interval': kwargs.get('interval', '1d')
            }
            ingestion = YFinanceIngestion(ingestion_config)
            
        elif source == 'alpha_vantage':
            ingestion_config = {
                'api_key': self.config.get('alpha_vantage_api_key')
            }
            ingestion = AlphaVantageIngestion(ingestion_config)
            
        else:
            raise ValueError(f"Unknown data source: {source}")
            
        # Load the data
        self.data = ingestion.load_data(**kwargs)
        return self.data
        
    def get_processed_data(self) -> pd.DataFrame:
        """Get the loaded and processed data"""
        return self.data