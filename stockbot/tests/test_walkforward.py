import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
from stockbot.prob.walkforward import evaluate_walkforward


def test_walkforward_eval():
    series = [0.1, -0.2, 0.05, 0.03, -0.1, 0.2, 0.1, -0.05]
    res = evaluate_walkforward(series, train_size=4, test_size=2, n_states=2)
    assert "folds" in res and len(res["folds"]) == 2
    assert res["avg_log_loss"] > 0
    for fold in res["folds"]:
        assert "log_likelihood" in fold
        assert "log_loss" in fold
