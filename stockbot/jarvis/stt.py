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
        beam_size: int = 5,
        vad_filter: bool = True,
        
    ):
        self.model_size = model_size or os.getenv("WHISPER_MODEL_SIZE", "small")
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
            beam_size=self.beam_size,
            vad_filter=self.vad_filter,
            
        )
        text = " ".join(segment.text.strip() for segment in segments)
        return text.strip()
