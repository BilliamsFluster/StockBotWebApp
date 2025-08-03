# stockbot/api/services/jarvis_service.py

import os
import tempfile
from .stt import SpeechToText
from .tts import TextToSpeech
from .agent import BaseAgent

class JarvisService:
    def __init__(self, llm_agent: BaseAgent):
        self.stt   = SpeechToText(model_size="small", device="cpu")
        self.tts   = TextToSpeech()
        self.agent = llm_agent

    async def process_audio(self, audio_path: str) -> dict:
        # 1) STT (sync)
        transcript = self.stt.transcribe(audio_path)
        print(f"📝 Transcript: {transcript}")

        # 2) LLM (sync)
        try:
            response_text = self.agent.generate(transcript, output_format="text")
            print(f"🤖 LLM Response: {response_text}")
        except Exception as e:
            print("❌ Error in LLM step:", repr(e))
            raise

        # 3) TTS (async)
        out_path = os.path.join(tempfile.gettempdir(), "jarvis_reply.mp3")
        try:
            await self.tts.synthesize(response_text, out_path)
            print(f"🔊 TTS saved to: {out_path}")
        except Exception as e:
            print("❌ Error in TTS step:", repr(e))
            raise

        return {
            "transcript":      transcript,
            "response_text":   response_text,
            "tts_audio_path":  out_path,
        }
