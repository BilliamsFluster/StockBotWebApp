"""
Async Text-to-Speech using Microsoft Edge TTS.
pip install edge-tts
"""
import os
import edge_tts
import asyncio
from typing import Optional

class TextToSpeech:
    """Thin wrapper around edge-tts that supports cancellation.

    Parameters roughly mirror edge-tts options. MP3 is produced by default
    when streaming; the client expects `audio/mpeg`.
    """

    def __init__(
        self,
        voice: str = "en-US-JennyNeural",
        rate: str = "+0%",
        pitch: str = "+0Hz",
        volume: str = "+0%",
    ) -> None:
        self.voice = voice
        self.rate = rate
        self.pitch = pitch
        self.volume = volume

    async def synthesize(self, text: str, out_path: str) -> str:
        """Generate speech and write to `out_path` (e.g., .../reply.mp3)."""
        communicate = edge_tts.Communicate(
            text,
            voice=self.voice,
            rate=self.rate,
            pitch=self.pitch,
            volume=self.volume,
        )
        await communicate.save(out_path)
        return out_path

    async def synthesize_to_bytes(
        self,
        text: str,
        cancel: Optional[asyncio.Event] = None,
        max_bytes: Optional[int] = None,
    ) -> bytes:
        """
        Stream TTS into memory and return MP3 bytes.

        Args:
            text: Text/SSML to synthesize.
            cancel: If set during streaming, stop early and return what we have.
            max_bytes: Optional hard cap to avoid runaway memory usage.
        """
        communicate = edge_tts.Communicate(
            text,
            voice=self.voice,
            rate=self.rate,
            pitch=self.pitch,
            volume=self.volume,
        )
        buf = bytearray()
        try:
            async for chunk in communicate.stream():  # yields dicts {type, data}
                if cancel is not None and cancel.is_set():
                    break  # stop streaming promptly on barge‑in
                if chunk["type"] == "audio":
                    data = chunk["data"]
                    buf.extend(data)
                    if max_bytes is not None and len(buf) >= max_bytes:
                        break
        except asyncio.CancelledError:
            # propagate if the caller truly cancels the task
            raise
        except Exception:
            # Return what we have on partial failure to keep pipeline resilient
            pass
        return bytes(buf)
