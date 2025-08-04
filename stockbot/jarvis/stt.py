"""
Speech-to-text (STT) module for Jarvis.
Improved to allow direct NumPy audio array input for lower latency.
"""

import os
import numpy as np
from faster_whisper import WhisperModel


class SpeechToText:
    def __init__(
        self,
        model_size: str = None,
        device: str = None,
        compute_type: str = None,
        beam_size: int = 5,  # greedy decoding
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
        """Standard transcription from file path."""
        segments, _ = self.model.transcribe(
            audio_path,
            beam_size=self.beam_size,
            best_of=1,
            patience=1.0,
            temperature=0.0,
            compression_ratio_threshold=3.0,
            log_prob_threshold=-1.0,
            no_speech_threshold=0.9,
            vad_filter=self.vad_filter,
        )

        text = " ".join(segment.text.strip() for segment in segments if segment.text)
        return text.strip()

    def transcribe_from_array(self, audio_array: np.ndarray) -> str:
        """
        Transcribe directly from a NumPy float32 PCM array.
        audio_array: np.ndarray of shape (N,) in range [-1.0, 1.0]
        """
        if not isinstance(audio_array, np.ndarray):
            raise TypeError("audio_array must be a NumPy ndarray")
        if audio_array.ndim != 1:
            raise ValueError("audio_array must be 1-D mono audio")
        if audio_array.dtype != np.float32:
            audio_array = audio_array.astype(np.float32)

        segments, _ = self.model.transcribe(
            audio_array,
            beam_size=self.beam_size,
            best_of=1,
            patience=1.0,
            temperature=0.0,
            compression_ratio_threshold=3.0,
            log_prob_threshold=-1.0,
            no_speech_threshold=0.9,
            vad_filter=self.vad_filter,
        )

        text = " ".join(segment.text.strip() for segment in segments if segment.text)
        return text.strip()
