# tts.py
import edge_tts
import asyncio
import tempfile

class TextToSpeech:
    def __init__(self, voice: str = "en-US-AriaNeural", rate: str = "+0%", pitch: str = "+0Hz"):
        self.voice = voice
        self.rate = rate
        self.pitch = pitch

    async def synthesize(self, text: str, output_path: str) -> str:
        communicate = edge_tts.Communicate(text, self.voice, rate=self.rate, pitch=self.pitch)
        await communicate.save(output_path)
        return output_path

    def synthesize_sync(self, text: str, output_path: str) -> str:
        asyncio.run(self.synthesize(text, output_path))
        return output_path
