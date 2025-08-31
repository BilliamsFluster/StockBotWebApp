import numpy as np

from stockbot.rl.hybrid_policy import HybridPolicy


class DummyPPO:
    def predict(self, obs, state=None, episode_start=None, deterministic=True):
        return np.array([0.3], dtype=np.float32), state


def test_hybrid_policy_switch():
    ppo = DummyPPO()
    policy = HybridPolicy(ppo_policy=ppo, prob_threshold=0.55)

    strong = {"prob": np.array([0.6, 0.4, 0.8, 1.0, 0.2], dtype=np.float32)}
    act, _ = policy.predict(strong)
    assert act[0] > 0.3  # probability core takes control

    weak = {"prob": np.array([0.5, 0.5, 0.5, 0.0, 0.2], dtype=np.float32)}
    act2, _ = policy.predict(weak)
    assert np.allclose(act2[0], 0.3)
