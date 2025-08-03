# stt.py
from faster_whisper import WhisperModel
import tempfile
import os

class SpeechToText:
    def __init__(self, model_size: str = "small", device: str = "cpu"):
        print(f"🔄 Loading faster-whisper model: {model_size} on {device}")
        self.model = WhisperModel(model_size, device=device, compute_type="int8")

    def transcribe(self, audio_path: str) -> str:
        segments, _ = self.model.transcribe(audio_path, beam_size=5)
        text = " ".join(segment.text.strip() for segment in segments)
        return text.strip()
