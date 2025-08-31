import argparse
import json
from pathlib import Path
from typing import List

from .model import train_model


def _load_series(path: str) -> List[float]:
    p = Path(path)
    if p.suffix.lower() == ".json":
        return json.loads(p.read_text())
    elif p.suffix.lower() in {".txt", ".csv"}:
        return [float(x) for x in p.read_text().replace(",", " ").split() if x]
    else:
        raise ValueError("Unsupported file format")


def main() -> None:
    parser = argparse.ArgumentParser(description="Train regime HMM")
    parser.add_argument("data", help="Path to return series (json/csv)")
    parser.add_argument("out", help="Output directory for artifacts")
    parser.add_argument("--states", type=int, default=2, help="Number of regimes")
    args = parser.parse_args()
    series = _load_series(args.data)
    train_model(series, args.states, args.out)


if __name__ == "__main__":  # pragma: no cover
    main()
