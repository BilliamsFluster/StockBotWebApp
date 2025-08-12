"""
Core JarvisService – orchestrates STT → LLM → TTS and exposes helpers
used by the websocket handler.
"""
import os
import tempfile
import uuid
import asyncio
from .stt import SpeechToText
from .tts import TextToSpeech
from .agent import BaseAgent
from silero_vad import load_silero_vad


class JarvisService:
    def __init__(self, llm_agent: BaseAgent, config=None):
        # Speech
        self.stt = SpeechToText()            # must expose transcribe() and transcribe_from_array()
        self.tts = TextToSpeech()            # async synthesize(text, out_path)

        # LLM
        # The llm_agent is now passed in directly, simplifying initialization
        self.agent = llm_agent               # must expose generate() and async generate_stream()

        # VAD (used by WS handler)
        self.vad_model = load_silero_vad(onnx=False)

    async def process_audio(self, audio_path: str) -> dict:
        """
        Non-streaming pipeline – useful for testing.
        """
        # 1) STT
        transcript = self.stt.transcribe(audio_path)
        print(f"📝 Transcript: {transcript}")

        # 2) LLM (blocking)
        response_text = self.agent.generate(transcript, output_format="text")
        print(f"🤖 LLM Response: {response_text}")

        # 3) TTS
        out_path = os.path.join(
            tempfile.gettempdir(), f"jarvis_reply_{uuid.uuid4().hex}.mp3"
        )
        await self.tts.synthesize(response_text, out_path)
        print(f"🔊 TTS saved to: {out_path}")

        return {
            "transcript": transcript,
            "response_text": response_text,
            "tts_audio_path": out_path,
        }

    async def process_audio_streaming(self, audio_path: str):
        """
        Optional convenience if you want to stream outside of the WS handler.
        (We typically stream directly in the websocket code.)
        """
        transcript = self.stt.transcribe(audio_path)
        yield {"event": "transcript", "data": transcript}

        async for delta in self.agent.generate_stream(transcript, output_format="text"):
            yield {"event": "partial_response", "data": delta}

    async def tts_to_file(self, text: str) -> str:
        """
        Helper used by the websocket handler after it collects the full response.
        """
        out_path = os.path.join(
            tempfile.gettempdir(), f"jarvis_reply_{uuid.uuid4().hex}.mp3"
        )
        await self.tts.synthesize(text, out_path)
        return out_path

    async def process_message(self, message: str):
        # This should now call the agent's generate method
        return self.agent.generate(message, output_format="text")
