"""Lightweight logging facility for the trading bot."""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Optional


class BotLogger:
    """Logger that writes messages to stdout and optionally to a file."""

    def __init__(self, log_dir: Optional[str] = None, enable_file_logging: bool = False) -> None:
        self.enable_file_logging = enable_file_logging
        self.log_path: Optional[Path] = None
        if enable_file_logging and log_dir:
            os.makedirs(log_dir, exist_ok=True)
            log_file = Path(log_dir) / f"stockboty_{datetime.utcnow().isoformat()}.log"
            self.log_path = log_file

    def log(self, msg: str) -> None:
        timestamp = datetime.utcnow().isoformat()
        line = f"[{timestamp}] {msg}"
        print(line)
        if self.enable_file_logging and self.log_path:
            with self.log_path.open("a", encoding="utf-8") as f:
                f.write(line + "\n")