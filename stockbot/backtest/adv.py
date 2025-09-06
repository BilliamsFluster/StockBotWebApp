import pandas as pd


def est_adv(series_price: pd.Series, series_vol: pd.Series, window: int = 20) -> pd.Series:
    """Estimate average daily volume (in $) using a rolling window."""
    dollar_vol = series_price * series_vol
    return dollar_vol.rolling(window=window, min_periods=1).mean()
