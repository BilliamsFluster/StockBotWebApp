"""
Speech-to-text (STT) module for Jarvis.
Improved to allow direct NumPy audio array input for lower latency.
"""

import os
import numpy as np
from faster_whisper import WhisperModel
from typing import Optional
# Add scipy for debugging
try:
    from scipy.io.wavfile import write as write_wav
except ImportError:
    write_wav = None


class SpeechToText:
    def __init__(
        self,
        model_size: str = None,
        device: str = None,
        compute_type: str = None,
        beam_size: int = 5,
        vad_filter: bool = True,  # Enabled by default
    ):
        # Default to 'small.en' for a good balance of speed and accuracy
        self.model_size = model_size or os.getenv("WHISPER_MODEL_SIZE", "small.en")
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
            temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0], # Multi-pass temperature
            patience=1.0,
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.2, # Relaxed from -1.0
            no_speech_threshold=0.7, # Relaxed from 0.6
            vad_filter=self.vad_filter,
        )

        text = " ".join(segment.text.strip() for segment in segments if segment.text)
        return text.strip()

    def transcribe_from_array(
        self,
        audio_array: np.ndarray,
        sample_rate: int = 16000,
        debug_save_path: Optional[str] = None
    ) -> str:
        """
        Transcribe directly from a NumPy float32 PCM array.
        audio_array: np.ndarray of shape (N,) in range [-1.0, 1.0]
        sample_rate: The sample rate of the audio_array (must be 16000 for Whisper).
        debug_save_path: If provided, saves the received audio to a .wav file.
        """
        if not isinstance(audio_array, np.ndarray):
            raise TypeError("audio_array must be a NumPy ndarray")
        if audio_array.ndim != 1:
            raise ValueError("audio_array must be 1-D mono audio")

        # --- Debugging: Save the audio file ---
        if debug_save_path and write_wav:
            try:
                # Ensure parent directory exists
                os.makedirs(os.path.dirname(debug_save_path), exist_ok=True)
                # Whisper expects float32, but for saving a standard WAV, we can convert to int16
                wav_data = (audio_array * 32767).astype(np.int16)
                write_wav(debug_save_path, sample_rate, wav_data)
                print(f"🎤 Audio saved for debugging at: {debug_save_path}")
            except Exception as e:
                print(f"⚠️ Could not save debug audio file: {e}")
        # --- End Debugging ---

        if audio_array.dtype != np.float32:
            # Whisper models require float32.
            audio_array = audio_array.astype(np.float32)

        segments, _ = self.model.transcribe(
            audio_array,
            beam_size=self.beam_size,
            temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0], # Multi-pass temperature
            patience=1.0,
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.2, # Relaxed from -1.0
            no_speech_threshold=0.7, # Relaxed from 0.6
            vad_filter=self.vad_filter,
        )

        text = " ".join(segment.text.strip() for segment in segments if segment.text)
        return text.strip()
