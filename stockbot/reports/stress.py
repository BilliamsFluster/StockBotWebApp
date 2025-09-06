from typing import Dict, List

import json

from stockbot.pipeline import prepare_from_payload


def run_stress_windows(
    model_path: str,
    payload: Dict,
    windows: List[Dict],
    report_path: str | None = None,
) -> List[Dict]:
    """Return placeholder KPIs for a list of stress-test windows.

    Each window triggers the P2 data-preparation pipeline so that stress tests
    operate on the exact same feature construction code path as training.  The
    function returns the metrics and optionally writes them to ``report_path``.
    """
    report: List[Dict] = []
    for w in windows:
        # Reuse payload but swap in window bounds
        payload_window = {
            **payload,
            "dataset": {
                **payload.get("dataset", {}),
                "start_date": w.get("start"),
                "end_date": w.get("end"),
            },
        }
        prepare_from_payload(payload_window)
        report.append(
            {
                "label": w.get("label", ""),
                "sharpe_net": 0.0,
                "maxdd": 0.0,
                "hitrate": 0.0,
                "cost_bps": 0.0,
                "notes": "",
            }
        )

    if report_path is not None:
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

    return report
