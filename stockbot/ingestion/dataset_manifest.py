import hashlib
import json
import os
from typing import Dict, List


def build_manifest(
    symbols: List[str],
    interval: str,
    adjusted: bool,
    start: str,
    end: str,
    vendor: str,
    parquet_map: Dict[str, str],
) -> Dict:
    """Return a manifest dict with a deterministic ``content_hash``.

    The hash fingerprints the exact data slice used, taking into account the
    query parameters and the on-disk parquet files (paths, sizes and modified
    times).  This makes it possible to detect when any part of the dataset
    changes.
    """

    files = []
    for sym in symbols:
        path = parquet_map[sym]
        stat = os.stat(path)
        files.append(f"{path}:{stat.st_size}:{int(stat.st_mtime)}")

    manifest = {
        "symbols": symbols,
        "interval": interval,
        "adjusted": adjusted,
        "start": start,
        "end": end,
        "vendor": vendor,
        "parquet_map": parquet_map,
    }

    hash_payload = json.dumps({**manifest, "files": files}, sort_keys=True).encode()
    manifest["content_hash"] = hashlib.sha256(hash_payload).hexdigest()
    return manifest
