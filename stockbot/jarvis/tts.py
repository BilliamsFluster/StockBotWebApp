"""
Async Text-to-Speech using Microsoft Edge TTS.
pip install edge-tts
"""
import os
import edge_tts

class TextToSpeech:
    def __init__(
        self,
        voice: str = "en-US-JennyNeural",
        rate: str = "+0%",
        pitch: str = "+0Hz",
        volume: str = "+0%",
        # NOTE: edge-tts chooses the right format based on file extension in .save()
        # MP3 is fine for your frontend, so we save to .mp3.
    ):
        self.voice = voice
        self.rate = rate
        self.pitch = pitch
        self.volume = volume

    async def synthesize(self, text: str, out_path: str) -> str:
        """
        Generate speech and write to `out_path` (e.g., .../reply.mp3).
        Returns the same `out_path` when done.
        """
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        communicate = edge_tts.Communicate(
            text,
            voice=self.voice,
            rate=self.rate,
            pitch=self.pitch,
            volume=self.volume,
        )
        # Easiest/cleanest: just save to file (non-blocking, async)
        await communicate.save(out_path)
        return out_path

    async def synthesize_to_bytes(self, text: str) -> bytes:
        """
        If you ever want raw bytes instead of saving to disk.
        """
        communicate = edge_tts.Communicate(
            text,
            voice=self.voice,
            rate=self.rate,
            pitch=self.pitch,
            volume=self.volume,
        )
        buf = bytearray()
        async for chunk in communicate.stream():  # <-- no args
            if chunk["type"] == "audio":
                buf.extend(chunk["data"])
        return bytes(buf)
