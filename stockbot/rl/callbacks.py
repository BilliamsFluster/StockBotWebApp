from __future__ import annotations
import torch as th
from torch.utils.tensorboard import SummaryWriter
from stable_baselines3.common.callbacks import BaseCallback

class RLDiagCallback(BaseCallback):
    """
    Logs:
      - action histogram (from rollout buffer)
      - gradient global-norm (hooked after optimizer.step)
    """
    def __init__(self, log_dir: str, every_n_updates: int = 1, verbose: int = 0):
        super().__init__(verbose)
        self.every = every_n_updates
        self.writer = SummaryWriter(log_dir)

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
        for p in self.model.policy.parameters():
            if p.grad is not None:
                g = p.grad.data
                total_sq += float(th.norm(g, p=2) ** 2)
        self.writer.add_scalar("grads/global_norm", (total_sq ** 0.5), self.num_timesteps)

    def _on_training_end(self) -> None:
        self.writer.flush()
        self.writer.close()

def wrap_optimizer_for_grad_logging(model, cb: RLDiagCallback) -> None:
    """Wrap optimizer.step() so we can log gradient norms every update."""
    opt = model.policy.optimizer
    orig_step = opt.step

    def step_with_log(*args, **kwargs):
        result = orig_step(*args, **kwargs)
        try:
            cb.log_grad_norm()
        finally:
            return result

    opt.step = step_with_log  # type: ignore
