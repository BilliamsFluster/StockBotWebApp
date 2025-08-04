"""
Core JarvisService – orchestrates STT → LLM → TTS
"""

import os
import tempfile
import uuid
from .stt import SpeechToText
from .tts import TextToSpeech
from .agent import BaseAgent
from silero_vad import load_silero_vad


class JarvisService:
    def __init__(self, llm_agent: BaseAgent):
        self.stt = SpeechToText()
        self.tts = TextToSpeech()
        self.agent = llm_agent
        self.vad_model = load_silero_vad(onnx=False)

    async def process_audio(self, audio_path: str) -> dict:
        # 1) STT
        transcript = self.stt.transcribe(audio_path)
        print(f"📝 Transcript: {transcript}")

        # 2) LLM
        try:
            response_text = self.agent.generate(transcript, output_format="text")
            print(f"🤖 LLM Response: {response_text}")
        except Exception as e:
            print("❌ Error in LLM step:", repr(e))
            raise

        # 3) TTS
        out_path = os.path.join(
            tempfile.gettempdir(), f"jarvis_reply_{uuid.uuid4().hex}.mp3"
        )
        try:
            await self.tts.synthesize(response_text, out_path)
            print(f"🔊 TTS saved to: {out_path}")
        except Exception as e:
            print("❌ Error in TTS step:", repr(e))
            raise

        return {
            "transcript": transcript,
            "response_text": response_text,
            "tts_audio_path": out_path,
        }
