# jarvis_service.py
import tempfile
import os
from .stt import SpeechToText
from .tts import TextToSpeech
from .agent import BaseAgent

class JarvisService:
    def __init__(self, llm_agent: BaseAgent):
        self.stt = SpeechToText(model_size="small", device="cpu")  # or "cuda" if GPU
        self.tts = TextToSpeech()
        self.agent = llm_agent  # e.g., OllamaAgent("deepseek-r1:14b")

    def process_audio(self, audio_path: str):
        # 1. Speech-to-Text
        transcript = self.stt.transcribe(audio_path)
        print(f"📝 Transcript: {transcript}")

        # 2. LLM Response
        llm_response = self.agent.generate(transcript, output_format="text")
        print(f"🤖 LLM Response: {llm_response}")

        # 3. Text-to-Speech
        temp_audio_file = os.path.join(tempfile.gettempdir(), "jarvis_reply.mp3")
        self.tts.synthesize_sync(llm_response, temp_audio_file)

        return {
            "transcript": transcript,
            "response_text": llm_response,
            "tts_audio_path": temp_audio_file
        }
