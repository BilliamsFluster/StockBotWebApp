"""
Real-time speaker diarization module using SpeechBrain's ECAPA-TDNN model.
Contains the SpeakerEmbedder and SpeakerRegistry classes for on-the-fly
speaker identification and enrollment.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
import torch
import torch.nn.functional as F
from speechbrain.pretrained import EncoderClassifier

# --- Tunables ---
MATCH_THRESHOLD = 0.72    # Cosine-similarity cutoff to accept a match; lower = more lenient (more false matches)
BIAS_LAST_SPEAKER = 0.02  # Small continuity bias toward the most recent speaker if time gap is short
MAX_SPEAKERS = 8          # Hard cap on number of simultaneously tracked speakers in a session
MAX_EMBS_PER_SPK = 20     # Per-speaker rolling buffer size used to compute a robust centroid


class SpeakerEmbedder:
    """Wrapper around SpeechBrain ECAPA-TDNN to produce L2-normalized speaker embeddings (voiceprints)."""
    def __init__(self, device="cpu"):
        self.device = device
        print(f"[{self.__class__.__name__}] Loading SpeechBrain ECAPA-TDNN model...")
        # Downloads weights on first run and moves model to the specified device
        self.model = EncoderClassifier.from_hparams(
            source="speechbrain/spkrec-ecapa-voxceleb",
            run_opts={"device": device}
        )
        print(f"[{self.__class__.__name__}] Model loaded successfully on {device}.")

    @torch.inference_mode()
    def embed(self, wav_16k_mono: torch.Tensor) -> torch.Tensor:
        """
        Create a speaker embedding from a 16kHz mono waveform.
        Args:
            wav_16k_mono: shape [T] or [1, T], dtype float32 in range [-1, 1]
        Returns:
            torch.Tensor: L2-normalized embedding vector [D]
        """
        # Ensure batch dimension: [1, T]
        if wav_16k_mono.ndim == 1:
            wav_16k_mono = wav_16k_mono.unsqueeze(0)
        # SpeechBrain returns shape [B, 1, D]; squeeze to [D]
        emb = self.model.encode_batch(wav_16k_mono).squeeze(0).squeeze(0)
        # Normalize so cosine similarity ≡ dot product
        return F.normalize(emb, p=2, dim=0)


@dataclass
class SpeakerProfile:
    """Holds enrollment data for a single speaker."""
    sid: int
    embs: List[torch.Tensor] = field(default_factory=list)  # FIFO buffer of recent embeddings
    centroid: Optional[torch.Tensor] = None                 # L2-normalized mean embedding
    last_seen_ts: float = 0.0                               # Wall/mono time when last updated

    def update(self, emb: torch.Tensor, ts: float):
        """Append embedding, maintain rolling buffer, refresh centroid and timestamp."""
        self.embs.append(emb)
        if len(self.embs) > MAX_EMBS_PER_SPK:
            self.embs.pop(0)  # Drop oldest to bound memory
        # Recompute centroid and normalize; averaging reduces variance/noise
        self.centroid = F.normalize(torch.stack(self.embs, dim=0).mean(dim=0), p=2, dim=0)
        self.last_seen_ts = ts


class SpeakerRegistry:
    """Session-scoped registry managing enrollment and identification of multiple speakers."""
    def __init__(self):
        self.speakers: Dict[int, SpeakerProfile] = {}  # sid -> profile
        self.next_id = 1                               # next speaker id to assign
        self.last_assigned_sid: Optional[int] = None   # last speaker we labeled
        self.last_end_ts: float = -1e9                 # time of last assignment (for continuity bias)

    def _best_match(self, emb: torch.Tensor, now_ts: float) -> Tuple[Optional[int], float]:
        """
        Find the enrolled speaker with highest cosine similarity to `emb`.
        Applies a small continuity bias if the last speaker was recent.
        Returns (sid, sim). If none enrolled, returns (None, -1.0).
        """
        if not self.speakers:
            return None, -1.0

        best_sid, best_sim = None, -1.0
        for sid, spk in self.speakers.items():
            if spk.centroid is None:
                continue
            sim = float(F.cosine_similarity(emb, spk.centroid, dim=0))

            # Encourage continuity when the same person speaks again shortly after
            if self.last_assigned_sid == sid and (now_ts - self.last_end_ts) < 1.5:
                sim += BIAS_LAST_SPEAKER

            # Debug logging for inspection/tuning; consider gating with a verbosity flag
            print(f"[{self.__class__.__name__}] Similarity with Speaker {sid}: {sim:.4f}")

            if sim > best_sim:
                best_sim, best_sid = sim, sid
        return best_sid, best_sim

    def identify_or_enroll(self, emb: torch.Tensor, now_ts: float) -> int:
        """
        Identify the speaker for `emb`, or enroll a new one if confidence is low.
        Logic:
          - If no speakers enrolled: enroll as Speaker 1.
          - Else, pick best match; if sim >= MATCH_THRESHOLD → update and return that sid.
          - If at capacity (MAX_SPEAKERS), force-assign to best match to avoid churn.
          - Otherwise, enroll a new speaker with a fresh sid.
        """
        if not self.speakers:
            return self._enroll_new(emb, now_ts)

        sid, sim = self._best_match(emb, now_ts)

        if sim >= MATCH_THRESHOLD:
            # Confident match → refine that profile with the new embedding
            self.speakers[sid].update(emb, now_ts)
            self.last_assigned_sid, self.last_end_ts = sid, now_ts
            return sid

        if len(self.speakers) >= MAX_SPEAKERS:
            # At capacity: avoid creating a new identity; stick to the best available
            self.speakers[sid].update(emb, now_ts)
            self.last_assigned_sid, self.last_end_ts = sid, now_ts
            return sid
        else:
            # Low confidence and room to grow → create a new speaker profile
            return self._enroll_new(emb, now_ts)

    def _enroll_new(self, emb: torch.Tensor, now_ts: float) -> int:
        """Create a new speaker profile and return its assigned sid."""
        sid = self.next_id
        self.next_id += 1
        sp = SpeakerProfile(sid=sid)
        sp.update(emb, now_ts)  # seeds centroid with first embedding
        self.speakers[sid] = sp
        self.last_assigned_sid, self.last_end_ts = sid, now_ts
        return sid
