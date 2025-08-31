import argparse
import json
from pathlib import Path
from typing import List

from .model import infer_sequence


def _load_series(path: str) -> List[float]:
    p = Path(path)
    if p.suffix.lower() == ".json":
        return json.loads(p.read_text())
    elif p.suffix.lower() in {".txt", ".csv"}:
        return [float(x) for x in p.read_text().replace(",", " ").split() if x]
    else:
        raise ValueError("Unsupported file format")


def main() -> None:
    parser = argparse.ArgumentParser(description="Infer regime probabilities")
    parser.add_argument("model_dir", help="Directory with saved model")
    parser.add_argument("data", help="Path to return series (json/csv)")
    parser.add_argument("--out", help="Optional path to save inference results")
    args = parser.parse_args()
    series = _load_series(args.data)
    result = infer_sequence(args.model_dir, series)
    if args.out:
        Path(args.out).write_text(json.dumps(result, indent=2))
    else:
        print(json.dumps(result, indent=2))


if __name__ == "__main__":  # pragma: no cover
    main()
