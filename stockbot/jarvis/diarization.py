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
MATCH_THRESHOLD = 0.72   # MODIFIED: Lowered threshold for more lenient matching
BIAS_LAST_SPEAKER = 0.02 # Small bias for recent speaker if gap is short
MAX_SPEAKERS = 8
MAX_EMBS_PER_SPK = 20    # Keep a buffer to build a robust centroid

class SpeakerEmbedder:
    """A wrapper for the SpeechBrain ECAPA-TDNN model for creating voiceprints."""
    def __init__(self, device="cpu"):
        self.device = device
        print(f"[{self.__class__.__name__}] Loading SpeechBrain ECAPA-TDNN model...")
        self.model = EncoderClassifier.from_hparams(
            source="speechbrain/spkrec-ecapa-voxceleb",
            run_opts={"device": device}
        )
        print(f"[{self.__class__.__name__}] Model loaded successfully on {device}.")

    @torch.inference_mode()
    def embed(self, wav_16k_mono: torch.Tensor) -> torch.Tensor:
        """
        Creates a speaker embedding (voiceprint) from an audio tensor.
        wav: shape [1, T] or [T] float32 in [-1, 1] at 16kHz
        returns L2-normalized embedding [D]
        """
        if wav_16k_mono.ndim == 1:
            wav_16k_mono = wav_16k_mono.unsqueeze(0)
        emb = self.model.encode_batch(wav_16k_mono).squeeze(0).squeeze(0)
        return F.normalize(emb, p=2, dim=0)

@dataclass
class SpeakerProfile:
    """Stores the voiceprint data for a single speaker."""
    sid: int
    embs: List[torch.Tensor] = field(default_factory=list)
    centroid: Optional[torch.Tensor] = None
    last_seen_ts: float = 0.0

    def update(self, emb: torch.Tensor, ts: float):
        self.embs.append(emb)
        if len(self.embs) > MAX_EMBS_PER_SPK:
            self.embs.pop(0)
        self.centroid = F.normalize(torch.stack(self.embs, dim=0).mean(dim=0), p=2, dim=0)
        self.last_seen_ts = ts

class SpeakerRegistry:
    """Manages all speaker profiles for a single session."""
    def __init__(self):
        self.speakers: Dict[int, SpeakerProfile] = {}
        self.next_id = 1
        self.last_assigned_sid: Optional[int] = None
        self.last_end_ts: float = -1e9

    def _best_match(self, emb: torch.Tensor, now_ts: float) -> Tuple[Optional[int], float]:
        if not self.speakers:
            return None, -1.0
            
        best_sid, best_sim = None, -1.0
        for sid, spk in self.speakers.items():
            if spk.centroid is None: continue
            sim = float(F.cosine_similarity(emb, spk.centroid, dim=0))
            
            # Apply continuity bias
            if self.last_assigned_sid == sid and (now_ts - self.last_end_ts) < 1.5:
                sim += BIAS_LAST_SPEAKER
            
            # --- NEW: Add logging to see the similarity score ---
            print(f"[{self.__class__.__name__}] Similarity with Speaker {sid}: {sim:.4f}")

            if sim > best_sim:
                best_sim, best_sid = sim, sid
        return best_sid, best_sim

    def identify_or_enroll(self, emb: torch.Tensor, now_ts: float) -> int:
        """
        Identifies a speaker from the embedding or enrolls them as new.
        Returns the assigned speaker ID.
        """
        if not self.speakers:
            return self._enroll_new(emb, now_ts)

        sid, sim = self._best_match(emb, now_ts)

        if sim >= MATCH_THRESHOLD:
            self.speakers[sid].update(emb, now_ts)
            self.last_assigned_sid, self.last_end_ts = sid, now_ts
            return sid
        
        if len(self.speakers) >= MAX_SPEAKERS:
            # Max speakers reached, assign to best match to avoid too many profiles
            self.speakers[sid].update(emb, now_ts)
            self.last_assigned_sid, self.last_end_ts = sid, now_ts
            return sid
        else:
            # Confidence is low, enroll a new speaker
            return self._enroll_new(emb, now_ts)

    def _enroll_new(self, emb: torch.Tensor, now_ts: float) -> int:
        sid = self.next_id
        self.next_id += 1
        sp = SpeakerProfile(sid=sid)
        sp.update(emb, now_ts)
        self.speakers[sid] = sp
        self.last_assigned_sid, self.last_end_ts = sid, now_ts
        return sid