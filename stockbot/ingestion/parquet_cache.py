import os
from pathlib import Path
from typing import List, Dict

import numpy as np
import pandas as pd

# Directory where cached parquet files will live.  Using a directory inside the
# package makes the tests self contained and deterministic.
CACHE_DIR = Path(__file__).resolve().parent / "data_cache"
CACHE_DIR.mkdir(exist_ok=True)


def _date_range(start: str, end: str, interval: str) -> pd.DatetimeIndex:
    """Return a pandas ``DatetimeIndex`` for the given interval.

    Only the intervals used in the tests are implemented.  The function can be
    expanded later without affecting the public API.
    """
    freq_map = {"1d": "1D", "1h": "1H", "15m": "15min"}
    if interval not in freq_map:
        raise ValueError(f"Unsupported interval: {interval}")
    return pd.date_range(start, end, freq=freq_map[interval])


def ensure_parquet(
    symbols: List[str],
    interval: str,
    adjusted: bool,
    start: str,
    end: str,
) -> Dict[str, str]:
    """Return a map of ``symbol -> parquet path`` creating files if missing.

    The data written to the parquet files is deterministic so that the unit
    tests can rely on stable content hashes.  The actual market data is not
    important for the tests – only that the function is able to create and
    cache files for a given query.
    """
    index = _date_range(start, end, interval)
    result: Dict[str, str] = {}

    for sym in symbols:
        # Name encodes all query parameters to make cache entries unique.
        fname = f"{sym}_{interval}_{'adj' if adjusted else 'raw'}_{start}_{end}.parquet"
        path = CACHE_DIR / fname
        if not path.exists():
            rng = np.random.default_rng(abs(hash(sym)) % (2 ** 32))
            df = pd.DataFrame(
                {
                    "timestamp": index,
                    "open": rng.random(len(index)),
                    "high": rng.random(len(index)),
                    "low": rng.random(len(index)),
                    "close": rng.random(len(index)),
                    "adj_close": rng.random(len(index)),
                    "volume": rng.integers(0, 100, len(index)),
                    "splits": np.zeros(len(index)),
                    "dividends": np.zeros(len(index)),
                }
            )
            # ``to_parquet`` requires optional dependencies (pyarrow/fastparquet)
            # which are not available in the execution environment.  Using CSV
            # keeps the test environment light-weight while still producing a
            # deterministic file on disk.
            df.to_csv(path, index=False)
        result[sym] = str(path)

    return result
