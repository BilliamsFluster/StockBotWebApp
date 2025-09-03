from __future__ import annotations

import numpy as np
import torch as th
from torch.utils.tensorboard import SummaryWriter
from stable_baselines3.common.callbacks import BaseCallback


class RLDiagCallback(BaseCallback):
    """TensorBoard diagnostics for actions and gradients."""

    def __init__(self, log_dir: str, every_n_updates: int = 1, verbose: int = 0):
        super().__init__(verbose)
        self.every = every_n_updates
        self.writer = SummaryWriter(log_dir)

    def _on_step(self) -> bool:
        # required abstract method
        return True

    def _on_rollout_end(self) -> None:
        buf = getattr(self.model, "rollout_buffer", None)
        if buf is not None and getattr(buf, "actions", None) is not None:
            try:
                acts = buf.actions.reshape(-1).detach().cpu().numpy()
                self.writer.add_histogram("actions/hist", acts, global_step=self.num_timesteps)
            except Exception:
                pass

    def log_grad_norm(self):
        total_sq = 0.0
        per_layer: list[tuple[str, float]] = []
        try:
            named = list(self.model.policy.named_parameters())
        except Exception:
            named = [("param", p) for p in self.model.policy.parameters()]
        for name, p in named:
            if p.grad is not None:
                g = p.grad.data
                n = float(th.norm(g, p=2))
                total_sq += float(n ** 2)
                per_layer.append((name, n))
        self.writer.add_scalar("grads/global_norm", (total_sq ** 0.5), self.num_timesteps)
        max_layers = 64
        for name, n in per_layer[:max_layers]:
            try:
                self.writer.add_scalar(f"grads/by_layer/{name}", n, self.num_timesteps)
            except Exception:
                pass
        try:
            vals = []
            for _, p in named:
                if p.grad is not None:
                    v = p.grad.detach().flatten().cpu().numpy()
                    if v.size == 0:
                        continue
                    if v.size > 50000:
                        idx = np.random.choice(v.size, 50000, replace=False)
                        v = v[idx]
                    vals.append(v)
            if vals:
                allv = np.concatenate(vals)
                self.writer.add_histogram("grads/values", allv, self.num_timesteps)
        except Exception:
            pass

    def _on_training_end(self) -> None:
        self.writer.flush()
        self.writer.close()


def wrap_optimizer_for_grad_logging(model, cb: RLDiagCallback) -> None:
    """Wrap optimizer.step() so gradient norms are logged every update."""
    opt = model.policy.optimizer
    orig_step = opt.step

    def step_with_log(*args, **kwargs):
        result = orig_step(*args, **kwargs)
        try:
            cb.log_grad_norm()
        finally:
            return result

    opt.step = step_with_log  # type: ignore
