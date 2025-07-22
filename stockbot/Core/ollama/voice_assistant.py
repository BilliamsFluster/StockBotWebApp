import speech_recognition as sr
import asyncio
import edge_tts
import os
from requests.exceptions import HTTPError
import threading, time, re
import requests
from Core.config import shared_state

from queue import Queue, Empty
from Core.web.web_search import fetch_financial_snippets
from Core.API.data_fetcher import get_account_data_for_ai
from datetime import datetime
from Core.jarvis.core import call_jarvis_stream

# Pull from environment or fallback to defaults
model_name = os.getenv("MODEL", "llama3")
format_type = os.getenv("FORMAT", "markdown")
access_token = os.getenv("ACCESS_TOKEN", "dummy-token")

# State flags
cancel_event = threading.Event()
is_processing = threading.Event()

# Playback tracking
speaking_lock = threading.Lock()
current_playback_process = None

# Queues
listening_queue = Queue()

# Voice settings
VOICE_NAME = "en-US-AriaNeural"
SPEAKING_RATE = "+10%"

snippets_cache = ""
snippets_lock = threading.Lock()

# Calibrate for ambient noise
def calibrate_recognizer(r: sr.Recognizer, src, duration: float = 2.0):
    print("🎧 Calibrating ambient noise…")
    r.adjust_for_ambient_noise(src, duration=duration)
    print(f"    → energy_threshold set to {r.energy_threshold}")

# Refresh snippet headlines in background
def snippet_refresher():
    global snippets_cache
    backoff = 1
    while True:
        try:
            new_snips = fetch_financial_snippets()
            with snippets_lock:
                snippets_cache = new_snips
            backoff = 1
            print("[RAG] Headlines cache updated.")
        except HTTPError as e:
            print(f"[RAG] HTTP error (rate limit?): {e}. Backing off {backoff}s")
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)
            continue
        except Exception as e:
            print(f"[RAG] snippet refresher error: {e}")
        time.sleep(300)

threading.Thread(target=snippet_refresher, daemon=True).start()

# Interrupt speech playback
def interrupt_current_speech():
    global current_playback_process
    print("🚩 Interrupt requested.")
    with speaking_lock:
        if current_playback_process:
            try:
                current_playback_process.kill()
                print("🧨 Playback killed.")
            except Exception as e:
                print(f"Error killing playback: {e}")
            current_playback_process = None
    cancel_event.set()

# Clean raw LLM text for audio
def clean_text_for_speech(text: str) -> str:
    text = re.sub(r"<think>|</think>", "", text)
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[-*+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*|__|\*|_|`|~", "", text)
    text = re.sub(r"\([^)]*\)", "", text)
    text = re.sub(r"[^\x00-\x7F]+", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

# Text-to-Speech streaming
def smart_split(txt: str) -> list[str]:
    return [p.strip() for p in re.split(r"(?<=[\.\?!])\s+(?=[A-Z])", txt) if p.strip()]

async def speak_stream(text: str):
    global current_playback_process
    if cancel_event.is_set() or not text.strip():
        return
    cleaned = clean_text_for_speech(text)
    if not cleaned:
        return
    try:
        communicate = edge_tts.Communicate(cleaned, VOICE_NAME, rate=SPEAKING_RATE)
        process = await asyncio.create_subprocess_exec(
            "ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet", "-i", "pipe:0",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL
        )
        with speaking_lock:
            current_playback_process = process
        async for chunk in communicate.stream():
            if cancel_event.is_set():
                break
            if chunk.get("type") == "audio":
                data = chunk.get("data") or chunk.get("audio")
                if data:
                    process.stdin.write(data)
                    await process.stdin.drain()
        process.stdin.close()
        await process.wait()
    except Exception as e:
        print(f"TTS error: {e}")
    finally:
        with speaking_lock:
            current_playback_process = None

async def stream_response_and_speak(token_stream, voice_output_queue):
    buffer = ""
    inside_think = False

    for token in token_stream:
        if cancel_event.is_set():
            return
        if "<think>" in token:
            inside_think = True
            continue
        if "</think>" in token:
            inside_think = False
            continue
        if inside_think:
            continue

        buffer += token
        parts = smart_split(buffer)
        if len(parts) > 1:
            for sent in parts[:-1]:
                voice_output_queue.put({"role": "jarvis", "text": sent})
                try:
                    requests.post("http://localhost:5001/api/jarvis/voice/event", json={"text": sent})
                except Exception as e:
                    print("[WARN] SSE publish failed:", e)
                await speak_stream(sent)
            buffer = parts[-1]

    if buffer and not cancel_event.is_set():
        voice_output_queue.put({"role": "jarvis", "text": buffer})
        try:
            requests.post("http://localhost:5001/api/jarvis/voice/event", json={"text": buffer})
        except Exception as e:
            print("[WARN] Final SSE publish failed:", e)
        await speak_stream(buffer)

# Listens in background for commands like "jarvis" or "stop"
def background_listener():
    
    r = sr.Recognizer()
    r.dynamic_energy_threshold = True
    with sr.Microphone() as src:
        r.adjust_for_ambient_noise(src, duration=2.0)
    r.pause_threshold = 0.8
    r.phrase_threshold = 0.3
    r.phrase_time_limit = 10

    while True:
        with sr.Microphone() as src:
            try:
                audio = r.listen(src, timeout=None, phrase_time_limit=10)
                phrase = r.recognize_google(audio).lower()
                print(f"🎤 Heard: {phrase}")
            except sr.UnknownValueError:
                continue
            except sr.RequestError as e:
                print(f"[Recognizer] API request failed: {e}")
                time.sleep(1)
                continue

            if any(k in phrase for k in ("jarvis", "stop")):
                interrupt_current_speech()
                time.sleep(0.5)
                continue

            if shared_state.is_speaking.is_set() or is_processing.is_set():

                continue

            listening_queue.put(phrase)

# Main voice assistant loop
def voice_loop(voice_event, voice_output_queue, model_name, format_type, token, is_speaking_flag):
    threading.Thread(target=background_listener, daemon=True).start()

    async def main():
        cancel_event.clear()
        await speak_stream("Jarvis Activated")

        while voice_event.is_set():
            try:
                msg = voice_output_queue.get_nowait()
                if msg == "__INTERRUPT__":
                    interrupt_current_speech()
                    continue
                if isinstance(msg, str):
                    await speak_stream(msg)
            except Empty:
                pass

            if listening_queue.empty():
                await asyncio.sleep(0.1)
                continue

            query = listening_queue.get().lower().strip()
            voice_output_queue.put({"role": "user", "text": query})
            cancel_event.clear()
            is_processing.set()

            try:
                is_market = any(k in query for k in ("market", "stock", "finance", "portfolio", "account", "trading"))
                if is_market:
                    with snippets_lock:
                        snippets = snippets_cache
                    account = await asyncio.to_thread(get_account_data_for_ai, token)

                    market_ctx = f"Recent Headlines:\n{snippets}\nAccount:\n{account}\n\n"
                else:
                    market_ctx = ""

                token_stream = call_jarvis_stream(
                    user_prompt=market_ctx + query,
                    model=model_name,
                    output_format=format_type
                )

                await stream_response_and_speak(token_stream, voice_output_queue)

            except Exception as e:
                await speak_stream(f"Error: {e}")
            finally:
                is_processing.clear()

    asyncio.run(main())

