from __future__ import annotations

"""Utilities to export risk guard events."""

from typing import Iterable, Dict
import json


def dump_events(events: Iterable[Dict], path: str) -> None:
    """Write events to a JSONL file."""

    with open(path, "w", encoding="utf-8") as fh:
        for ev in events:
            fh.write(json.dumps(ev) + "\n")
