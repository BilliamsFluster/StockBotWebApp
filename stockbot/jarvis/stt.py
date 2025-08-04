"""
Speech-to-text (STT) module for Jarvis.
Improved to use better precision and configurable parameters.
"""

import os
from faster_whisper import WhisperModel


class SpeechToText:
    def __init__(
        self,
        model_size: str = None,
        device: str = None,
        compute_type: str = None,
        beam_size: int = 1,  # greedy decoding
        vad_filter: bool = False,
    ):
        self.model_size = model_size or os.getenv("WHISPER_MODEL_SIZE", "base.en")
        self.device = device or os.getenv("WHISPER_DEVICE", "cpu")
        self.compute_type = compute_type or os.getenv("WHISPER_COMPUTE_TYPE", "float32")

        print(f"🔄 Loading faster-whisper model: {self.model_size} on {self.device}")
        self.model = WhisperModel(
            self.model_size, device=self.device, compute_type=self.compute_type
        )
        self.beam_size = beam_size
        self.vad_filter = vad_filter

    def transcribe(self, audio_path: str) -> str:
        segments, _ = self.model.transcribe(
            audio_path,
            beam_size=self.beam_size,       # greedy search
            best_of=1,                      # no multiple beams
            patience=1.0,                     # don't wait for better beams
            temperature=0.0,                 # single pass
            compression_ratio_threshold=3.0, # skip retry loop
            log_prob_threshold=-1.0,         # avoid early cutoff
            no_speech_threshold=0.9,         # faster silence skip
            vad_filter=self.vad_filter,      # still off
        )

        text = " ".join(segment.text.strip() for segment in segments if segment.text)
        return text.strip()
