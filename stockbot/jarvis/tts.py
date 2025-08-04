"""
Text-to-speech (TTS) module for Jarvis.
Generates unique filenames to avoid concurrency issues.
"""

import os
import tempfile
import asyncio
import uuid
import edge_tts


class TextToSpeech:
    def __init__(
        self,
        voice: str = None,
        rate: str = None,
        pitch: str = None,
    ):
        self.voice = voice or os.getenv("EDGE_TTS_VOICE", "en-US-AriaNeural")
        self.rate = rate or os.getenv("EDGE_TTS_RATE", "+0%")
        self.pitch = pitch or os.getenv("EDGE_TTS_PITCH", "+0Hz")

    async def synthesize(self, text: str, output_path: str = None) -> str:
        if not output_path:
            output_path = os.path.join(
                tempfile.gettempdir(), f"tts_{uuid.uuid4().hex}.mp3"
            )

        communicate = edge_tts.Communicate(
            text, self.voice, rate=self.rate, pitch=self.pitch
        )
        await communicate.save(output_path)
        return output_path

    def synthesize_sync(self, text: str, output_path: str = None) -> str:
        asyncio.run(self.synthesize(text, output_path))
        return output_path
