import speech_recognition as sr
import asyncio
import edge_tts
import Core.config.shared_state as shared_state
from Core.config.shared_state import access_token
from requests.exceptions import HTTPError
import threading, time, re
from queue import Queue, Empty
from Core.web.web_search import fetch_financial_snippets
from Core.API.data_fetcher import get_account_data_for_ai
from datetime import datetime
from Core.jarvis.core import call_jarvis_stream

# State flags
cancel_event = threading.Event()
is_processing = threading.Event()


# Playback tracking
speaking_lock = threading.Lock()
current_playback_process = None

# Speech recognition queue
listening_queue = Queue()

# Voice config
VOICE_NAME = "en-US-AriaNeural"
# Adjust this percent for faster/slower speech
SPEAKING_RATE = "+10%"

snippets_cache = ""
snippets_lock  = threading.Lock()

def calibrate_recognizer(r: sr.Recognizer, src, duration: float = 2.0):
    print("🎧 Calibrating ambient noise…")
    r.adjust_for_ambient_noise(src, duration=duration)
    print(f"    → energy_threshold set to {r.energy_threshold}")


# Updated snippet_refresher with HTTPError retry/backoff
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
        time.sleep(300)  # normal refresh interval

# Start the snippet refresher on import
threading.Thread(target=snippet_refresher, daemon=True).start()

# Interrupt playback
def interrupt_current_speech():
    global current_playback_process
    print("🛑 Interrupt requested.")
    with speaking_lock:
        if current_playback_process:
            try:
                current_playback_process.kill()
                print("🧨 Playback killed.")
            except Exception as e:
                print(f"Error killing playback: {e}")
            current_playback_process = None
    cancel_event.set()

# Clean text: strip markup, headings, bullets & tags
def clean_text_for_speech(text: str) -> str:
    # 1) Remove any leftover GPT “think” tags
    text = re.sub(r"<think>|</think>", "", text)
    # 2) Strip out Markdown headings (e.g. ### Foo)
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    # 3) Remove list bullets (-, *, +) at start of lines
    text = re.sub(r"^[-*+]\s+", "", text, flags=re.MULTILINE)
    # 4) Remove bold/italic markers and backticks
    text = re.sub(r"\*\*|__|\*|_|`|~", "", text)
    # 5) Remove any parenthetical asides
    text = re.sub(r"\([^)]*\)", "", text)
    # 6) Drop non-ASCII junk
    text = re.sub(r"[^\x00-\x7F]+", "", text)
    # 7) Collapse multiple spaces/newlines
    text = re.sub(r"\s+", " ", text)
    return text.strip()

# Stream TTS audio
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
            shared_state.is_speaking.set()  # ✅ Use shared flag
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
            shared_state.is_speaking.clear()  # ✅ Clear shared flag


# Generate and speak response, flush on sentence boundaries
# Dynamic flush TTS helper

async def stream_response_and_speak(
    token_stream, voice_output_queue
):
    """
    Buffers tokens and only speaks when a full sentence is available.
    Skips <think>...</think>, splits only on [.?!] + space + uppercase.
    Final flush at the end.
    """
    buffer = ""
    inside_think = False

    def smart_split(txt: str) -> list[str]:
        # split on true sentence boundaries
        pattern = r"(?<=[\.\?\!])\s+(?=[A-Z])"
        parts = re.split(pattern, txt)
        return [p.strip() for p in parts if p.strip()]

    for token in token_stream:
        if cancel_event.is_set():
            return

        # skip internal monologue
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

        # if there's more than one part, we have at least one full sentence
        if len(parts) > 1:
            # speak all complete sentences
            for sent in parts[:-1]:
                voice_output_queue.put({"role": "jarvis", "text": sent})
                await speak_stream(sent)
            # keep the last (incomplete) fragment in buffer
            buffer = parts[-1]

    # final flush of anything left
    if buffer and not cancel_event.is_set():
        voice_output_queue.put({"role": "jarvis", "text": buffer})
        await speak_stream(buffer)
# Continuously listen in background

def background_listener():
    r = sr.Recognizer()
    r.dynamic_energy_threshold = True
    # Calibrate once…
    with sr.Microphone() as src:
        r.adjust_for_ambient_noise(src, duration=2.0)
    # Tweak thresholds 
    r.pause_threshold   = 0.8
    r.phrase_threshold  = 0.3
    r.phrase_time_limit = 10  # up to 10s continuous speech

    while True:
        with sr.Microphone() as src:
            try:
                audio = r.listen(src, timeout=None, phrase_time_limit=10)
                phrase = r.recognize_google(audio).lower()
                print(f"🎙️ Heard: {phrase}")
            except sr.UnknownValueError:
                # nothing understood, just restart the loop
                continue
            except sr.RequestError as e:
                # network/API issue—log it, then back off a bit
                print(f"[Recognizer] API request failed: {e}")
                time.sleep(1)
                continue

            # Got a phrase—check for interrupt keywords
            if any(k in phrase for k in ("jarvis","stop")):
                interrupt_current_speech()
                time.sleep(0.5)
                continue

            # If we’re already in the middle of speaking or processing, drop it
            if shared_state.is_speaking.is_set() or is_processing.is_set():
                continue

            # Otherwise enqueue the phrase for your main loop
            listening_queue.put(phrase)



# Main voice loop

def voice_loop(voice_event, voice_output_queue, model_name, format_type, token, is_speaking_flag):
    shared_state.access_token = token
    shared_state.is_speaking = is_speaking_flag
    threading.Thread(target=background_listener, daemon=True).start()

    async def main():
        cancel_event.clear()
        await speak_stream("Jarvis Activated")

        while voice_event.is_set():
            # (1) GUI messages
            try:
                msg = voice_output_queue.get_nowait()
                if msg == "__INTERRUPT__":
                    interrupt_current_speech()
                    continue
                if isinstance(msg, str):
                    await speak_stream(msg)
            except Empty:
                pass

            # (2) Wait for speech
            if listening_queue.empty():
                await asyncio.sleep(0.1)
                continue

            query = listening_queue.get().lower().strip()
            voice_output_queue.put({"role": "user", "text": query})
            cancel_event.clear()
            is_processing.set()

            try:
                # (3) Market context
                is_market = any(k in query for k in
                                ("market","stock","finance","portfolio","account","trading"))
                if is_market:
                    with snippets_lock:
                        snippets = snippets_cache
                    account = await asyncio.to_thread(get_account_data_for_ai)
                    market_ctx = (f"Recent Headlines:\n{snippets}\n"
                                  f"Account:\n{account}\n\n")
                else:
                    market_ctx = ""

                # (4) Kick off RAG+LLM
                t0 = time.perf_counter()
                token_stream = call_jarvis_stream(
                    user_prompt=market_ctx + query,
                    model=model_name,
                    output_format=format_type
                )
                
                print(f"[Timing] RAG+LLM kickoff: {time.perf_counter() - t0:.2f}s")

                # (5) Stream TTS in chunks of ~flush_length
                await stream_response_and_speak(token_stream, voice_output_queue)

            except Exception as e:
                await speak_stream(f"Error: {e}")
            finally:
                is_processing.clear()

    asyncio.run(main())