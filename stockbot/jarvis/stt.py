"""
Speech-to-text (STT) module for Jarvis.
Improved to allow direct NumPy audio array input for lower latency.
"""

import os
import numpy as np
import torch
from faster_whisper import WhisperModel
from typing import Optional

# Optional: enable .wav dumps for debugging captured audio
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
        vad_filter: bool = True,  # run built-in VAD to drop non-speech chunks
    ):
        """
        Initialize faster-whisper.

        Env overrides (used if args are None):
          - WHISPER_MODEL_SIZE (e.g., "tiny.en", "small.en", "base", ...)
          - WHISPER_DEVICE ("cpu", "cuda")
          - WHISPER_COMPUTE_TYPE ("float32", "float16", "int8", ...)

        Note:
          - "tiny.en"/"small.en" are English-only but faster.
          - On CUDA, consider compute_type="float16" for speed.
        """
        # Defaults with env fallbacks
        self.model_size = model_size or os.getenv("WHISPER_MODEL_SIZE", "tiny.en")
        self.device = device or os.getenv("WHISPER_DEVICE", "cpu")
        self.compute_type = compute_type or os.getenv("WHISPER_COMPUTE_TYPE", "float32")

        print(f"🔄 Loading faster-whisper model: {self.model_size} on {self.device}")
        # Create the model once; reused for all transcriptions
        self.model = WhisperModel(
            self.model_size, device=self.device, compute_type=self.compute_type
        )
        self.beam_size = beam_size
        self.vad_filter = vad_filter

    def transcribe(self, audio_path: str) -> str:
        """
        Transcribe from an audio file path.

        faster-whisper handles many formats via ffmpeg. The decoding
        parameters below trade a bit of latency for higher reliability:
          - temperature sweep: escape local optima
          - patience: beam search stopping tolerance
          - compression/log_prob/no_speech thresholds: reject junk/empty output
          - vad_filter: pre-trim non-speech regions
        """
        segments, _ = self.model.transcribe(
            audio_path,
            beam_size=self.beam_size,
            temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],  # multi-pass sampling
            patience=1.0,
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.2,  # slightly relaxed to avoid over-pruning
            no_speech_threshold=0.7,  # slightly relaxed for responsiveness
            vad_filter=self.vad_filter,
        )

        # Join segment texts into a single string
        text = " ".join(segment.text.strip() for segment in segments if segment.text)
        return text.strip()

    def transcribe_from_array(
        self,
        audio_array: np.ndarray,
        sample_rate: int = 16000,
        debug_save_path: Optional[str] = None
    ) -> str:
        """
        Transcribe directly from a NumPy mono PCM float array.

        Args:
          audio_array: shape (N,), float32/-1..1 preferred (will cast if needed).
          sample_rate: nominal rate of `audio_array`. Whisper standard is 16 kHz.
                       (faster-whisper can resample if needed, but 16k avoids overhead.)
          debug_save_path: if provided and SciPy is installed, write a WAV for inspection.
        """
        if not isinstance(audio_array, np.ndarray):
            raise TypeError("audio_array must be a NumPy ndarray")
        if audio_array.ndim != 1:
            raise ValueError("audio_array must be 1-D mono audio")

        # Optional: dump incoming audio to disk for debugging
        if debug_save_path and write_wav:
            try:
                os.makedirs(os.path.dirname(debug_save_path), exist_ok=True)
                # Save as int16 for standard WAV viewers; keep runtime path using float32 for model
                wav_data = (audio_array * 32767).astype(np.int16)
                write_wav(debug_save_path, sample_rate, wav_data)
                print(f"🎤 Audio saved for debugging at: {debug_save_path}")
            except Exception as e:
                print(f"⚠️ Could not save debug audio file: {e}")
        # If SciPy isn't available, write_wav is None and we silently skip saving.

        # Ensure dtype matches model expectation
        if audio_array.dtype != np.float32:
            audio_array = audio_array.astype(np.float32)

        # Direct array transcription avoids file I/O and can reduce latency
        segments, _ = self.model.transcribe(
            audio_array,
            beam_size=self.beam_size,
            temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
            patience=1.0,
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.2,
            no_speech_threshold=0.7,
            vad_filter=self.vad_filter,
        )

        text = " ".join(segment.text.strip() for segment in segments if segment.text)
        return text.strip()

    @torch.inference_mode()
    async def transcribe(self, audio_tensor: torch.Tensor, sampling_rate: int) -> str:
        """
        Async transcription from a 1-D PyTorch float32 tensor.

        WARNING:
          This method name duplicates `transcribe(self, audio_path: str)` above.
          In Python, the later definition overrides the earlier one, so calls to
          `SpeechToText().transcribe(...)` will hit THIS async version, not the
          file-path version. Consider renaming (e.g., `transcribe_file`,
          `transcribe_tensor_async`) to avoid accidental overrides.

        Args:
          audio_tensor: shape (N,), expected float32 (will cast if needed).
          sampling_rate: nominal sample rate of the tensor.
        """
        if audio_tensor.ndim != 1:
            raise ValueError("audio_tensor must be 1-D mono audio")
        if audio_tensor.dtype != torch.float32:
            audio_tensor = audio_tensor.to(torch.float32)

        # Convert to NumPy for faster-whisper API (runs no-grad via @inference_mode)
        segments, _ = self.model.transcribe(
            audio_tensor.numpy(),
            beam_size=self.beam_size,
            temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
            patience=1.0,
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.2,
            no_speech_threshold=0.7,
            vad_filter=self.vad_filter,
        )

        text = " ".join(segment.text.strip() for segment in segments if segment.text)
        return text.strip()
