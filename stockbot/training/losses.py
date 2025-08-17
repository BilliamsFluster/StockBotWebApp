from __future__ import annotations
import torch
import torch.nn as nn
import torch.nn.functional as F

class FocalLoss(nn.Module):
    def __init__(self, gamma: float = 2.0, alpha=None, reduction: str = "mean"):
        super().__init__()
        self.gamma = gamma
        self.reduction = reduction
        if alpha is None:
            self.register_buffer("alpha", None)  # keeps device alignment
        elif isinstance(alpha, (float, int)):
            t = torch.tensor([float(alpha)], dtype=torch.float32)
            self.register_buffer("alpha", t)
        elif isinstance(alpha, torch.Tensor):
            self.register_buffer("alpha", alpha.detach().clone().float())
        else:
            # list/ndarray -> tensor
            t = torch.as_tensor(alpha, dtype=torch.float32)
            self.register_buffer("alpha", t)

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        # logits: [N, C], targets: [N]
        ce = F.cross_entropy(logits, targets, reduction="none")
        pt = torch.exp(-ce)
        loss = (1 - pt) ** self.gamma * ce
        if self.alpha is not None:
            # gather alpha by class
            if self.alpha.numel() == 1:
                loss = self.alpha.to(loss.device) * loss
            else:
                at = self.alpha.to(loss.device).gather(0, targets)
                loss = at * loss
        if self.reduction == "mean":
            return loss.mean()
        if self.reduction == "sum":
            return loss.sum()
        return loss
