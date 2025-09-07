from __future__ import annotations

"""CachedPanelSource: PanelSource backed by cached parquet/CSV artifacts.

This mirrors PanelSource but loads per-symbol OHLCV from the dataset manifest
produced by env_builder.ensure_parquet/build_manifest, then applies the same
feature pipeline as data_adapter.PanelSource.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Sequence

import numpy as np
import pandas as pd

from stockbot.env.config import EnvConfig
from stockbot.env.data_adapter import _build_features  # reuse same feature builder


@dataclass
class CachedPanelSource:
    cfg: EnvConfig
    manifest_path: Path

    def __init__(self, manifest_path: str | Path, cfg: EnvConfig):
        self.cfg = cfg
        mp = Path(manifest_path)
        if not mp.exists():
            raise FileNotFoundError(f"dataset_manifest not found: {mp}")
        run_root = mp.parent

        # Prefer precomputed windows if available (env_builder output)
        win_path = run_root / "windows.npz"
        meta_path = run_root / "meta.json"
        if win_path.exists() and meta_path.exists():
            try:
                import json
                X = np.load(win_path)["X"]  # (T, L, N, F)
                meta = json.loads(meta_path.read_text())
                ts = pd.to_datetime(meta.get("timestamps", []))
                syms = list(meta.get("symbols", []))
                cols = list(meta.get("feature_names", []))
                if X.ndim != 4:
                    raise ValueError("windows.npz has unexpected shape")
                T, L, N, F = X.shape
                if len(ts) != T:
                    raise ValueError("meta timestamps length mismatch with windows")
                if len(syms) != N:
                    raise ValueError("meta symbols length mismatch with windows")
                if len(cols) != F:
                    raise ValueError("meta feature_names length mismatch with windows")
                # Current-bar features at each t
                cur = X[:, -1, :, :]  # (T, N, F)
                frames: Dict[str, pd.DataFrame] = {}
                for si, sym in enumerate(syms):
                    df = pd.DataFrame(cur[:, si, :], index=ts, columns=cols)
                    frames[sym] = df
                using_windows = True
                required_cols = cols
                self.symbols = syms
            except Exception as e:
                print(f"[CachedPanelSource] Failed to use windows/meta: {e}; falling back to CSV cache.")
                using_windows = False
        else:
            using_windows = False

        if not using_windows:
            # build from cached CSV files listed in manifest
            import json
            self._manifest = json.loads(mp.read_text())
            parquet_map: Dict[str, str] = dict(self._manifest.get("parquet_map", {}))
            self.symbols = list(parquet_map.keys())

            frames = {}
            for sym, path in parquet_map.items():
                df = pd.read_csv(path)
                if "timestamp" in df.columns:
                    df = df.rename(columns={"timestamp": "ts"})
                df = df.sort_values("ts").set_index("ts")
                frames[sym] = _build_features(df, cfg.features)

        # Align by intersection of original indexes first
        idx = None
        for df in frames.values():
            idx = df.index if idx is None else idx.intersection(df.index)
        if idx is None or len(idx) == 0:
            raise RuntimeError("No overlapping timestamps across symbols in cached data")

        # Determine required columns
        if using_windows:
            required = required_cols  # use feature_names from meta/windows
        else:
            base_cols = ["open", "high", "low", "close", "volume"]
            expanded_inds: list[str] = []
            alias_minimal = [
                "logret",
                "logret5",
                "logret20",
                "vol10",
                "vol20",
                "atr14",
                "bb_width",
                "keltner_width",
                "vol_z20",
                "amihud",
            ]
            for ind in list(cfg.features.indicators):
                if ind in ("minimal", "minimal_core"):
                    expanded_inds.extend(alias_minimal)
                elif ind == "bbands":
                    expanded_inds.extend(["bb_upper", "bb_lower"])
                else:
                    expanded_inds.append(ind)
            required = base_cols + expanded_inds

        # Filter and align all frames on common index after dropna on required
        panel: Dict[str, pd.DataFrame] = {}
        for sym in self.symbols:
            df = frames[sym].reindex(idx)
            df = df.dropna(subset=required)
            panel[sym] = df

        common = None
        for df in panel.values():
            common = df.index if common is None else common.intersection(df.index)
        if common is None or len(common) == 0:
            raise RuntimeError("No overlapping timestamps across symbols after feature engineering.")

        for sym in self.symbols:
            panel[sym] = panel[sym].reindex(common)

        self.panel = panel
        self.index = common
        self._cols = required

        # ensure enough rows
        min_needed = int(cfg.episode.lookback) + 2
        if len(self.index) < min_needed:
            raise RuntimeError(
                f"Not enough cached data for lookback={cfg.episode.lookback}. "
                f"Have {len(self.index)} rows; need >= {min_needed}."
            )

    def slice(self, start_idx: int, end_idx: int) -> Dict[str, pd.DataFrame]:
        return {s: df.iloc[start_idx:end_idx] for s, df in self.panel.items()}

    def cols_required(self) -> Sequence[str]:
        return self._cols
