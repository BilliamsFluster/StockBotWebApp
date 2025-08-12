"""
WebSocket voice handler — interrupt-safe streaming TTS with barge-in.
Key fixes:
- Duck mic input on client during TTS to prevent self-echo.
- Barge-in grace period after TTS start; higher threshold early on.
- Correct speech max-duration tracking.
- Run LLM+TTS in background Task and make it cancel-aware.
"""
import os
import math
import base64
import json
import uuid
import asyncio
import time
import re
import traceback
from pathlib import Path

import torch
import numpy as np
import torchaudio.transforms as T  # (imported for potential DSP; not used below)
from starlette.websockets import WebSocket, WebSocketDisconnect

# --- NEW: Import the diarization module ---
from .diarization import SpeakerRegistry, SpeakerEmbedder

# Load Silero VAD (PyTorch impl) and utilities from torch.hub
VAD_MODEL, VAD_UTILS = torch.hub.load(
    repo_or_dir='snakers4/silero-vad', model='silero_vad', force_reload=False, onnx=False
)
(get_speech_timestamps, _, _, _, _) = VAD_UTILS

# ========================= Settings from your working file =========================
TARGET_SAMPLE_RATE = 16000          # All audio expected/handled at 16 kHz mono
MIN_RMS_FOR_SPEECH = 0.008          # ~ -42 dBFS: server-side barge-in threshold
MAX_SPEECH_DURATION_SEC = 6.0       # Hard cap per utterance
MIN_PHRASE_SEC = 0.3                # Ignore ultra-short blips
TRIGGER_WINDOW_SEC = 2.0            # Buffer used for VAD trigger checks
MAX_HISTORY_SEC = 5.0               # Rolling phrase buffer length cap
MIN_SILENCE_SEC = 0.3               # Base silence needed to close a phrase
MAX_SILENCE_SEC = 1.2               # Upper bound on silence timeout
BOUNDARY_RE = re.compile(r'([\.!\?…]["\')\]]?\s)$')  # Sentence boundary heuristic
VAD_OPTS = dict(
    threshold=0.3,
    min_speech_duration_ms=150,
    min_silence_duration_ms=120,
)

# ========================= Helpers from your working file =========================
def calculate_rms(tensor: torch.Tensor) -> float:
    """Root-mean-square amplitude for quick loudness / barge-in checks."""
    return math.sqrt(float(torch.mean(tensor ** 2)))


def compute_dynamic_silence_threshold(phrase_duration: float):
    """
    Grow the silence timeout a bit as phrases get longer,
    so longer sentences aren’t chopped prematurely.
    """
    base = MIN_SILENCE_SEC
    factor = min(1.0, phrase_duration / 3.0)
    timeout = base * (1.0 + factor)
    return max(MIN_SILENCE_SEC, min(timeout, MAX_SILENCE_SEC))


def should_flush(buf: str) -> bool:
    """
    Decide when to flush partial LLM text to TTS.
    Flushes primarily at sentence boundaries (., !, ?).
    Also flushes if the buffer gets long as a fallback to keep latency low.
    """
    if not buf.strip():
        return False
    # Prioritize flushing at natural sentence endings.
    if BOUNDARY_RE.search(buf):
        return True
    # As a fallback for long sentences without punctuation, flush after a longer threshold.
    if len(buf) > 120:
        return True
    return False


# --- MODIFIED: This function now accepts a speaker_id ---
async def process_and_send_results(
    websocket: WebSocket,
    phrase_tensor: torch.Tensor,
    jarvis_service,
    conn_history,
    tts_ctx: dict,
    speaker_id: int,  # <-- MODIFIED: Accept speaker_id
):
    """
    STT -> LLM -> streaming TTS pipeline for a single completed phrase.
    - Applies simple gain to avoid clipping,
    - Runs STT (optionally dumping .wav for debug),
    - Prefixes transcript with speaker id for multi-speaker context,
    - Streams LLM deltas to client while micro-batching TTS with barge-in awareness.
    """
    # --- Leveling: compute peak/RMS; apply conservative auto-gain if needed ---
    peak = float(phrase_tensor.abs().max()) + 1e-9
    rms = float(torch.sqrt(torch.mean(phrase_tensor ** 2)))
    dbfs = 20 * math.log10(max(rms, 1e-9))
    gain = 1.0
    if peak > 0.05:
        gain = min(1.0 / peak, 3.0)  # cap gain to avoid noisy boosts
    phrase_tensor = phrase_tensor * gain

    # Log approximate duration for diagnostics
    frames = phrase_tensor.shape[1]
    print(
        f"📝 Sending to STT: frames={frames} @ {TARGET_SAMPLE_RATE} Hz (~{frames/TARGET_SAMPLE_RATE:.2f}s), "
        f"peak={peak:.4f}, rms={rms:.4f} ({dbfs:.1f} dBFS), gain={gain:.2f}"
    )

    # Convert to NumPy for faster-whisper
    audio_np = phrase_tensor.squeeze(0).cpu().numpy()

    # --- STT (with optional debug audio dump) ---
    try:
        #project_root = Path(__file__).resolve().parents[2] --------- outputs to audio dir if you need to debug audio quality
        #debug_dir = project_root / "debug_audio"
        #debug_dir.mkdir(exist_ok=True)
       # debug_audio_path = debug_dir / f"stt_input_{uuid.uuid4().hex}.wav"

        transcript = jarvis_service.stt.transcribe_from_array(
            audio_np,
            #debug_save_path=str(debug_audio_path),
        )
    except Exception as e:
        await websocket.send_text(json.dumps({"event": "error", "message": str(e)}))
        return

    # Prefix transcript for diarization-aware context + UI
    contextual_transcript = f"[Speaker {speaker_id}]: {transcript}"
    conn_history.append({"role": "user", "content": contextual_transcript})
    await websocket.send_text(json.dumps({"event": "transcript", "data": transcript, "speaker": f"Speaker {speaker_id}"}))

    # Local helper to synthesize and send TTS audio in a cancel-aware way
    async def flush_tts_phrase(text: str):
        t = (text or "").strip()
        if not t: return
        if tts_ctx["cancel"].is_set() or not tts_ctx["allow"]: return
        async with tts_ctx["lock"]:
            if tts_ctx["cancel"].is_set() or not tts_ctx["allow"]: return
            try:
                audio_bytes = await jarvis_service.tts.synthesize_to_bytes(t, cancel=tts_ctx["cancel"])
                if tts_ctx["cancel"].is_set() or not tts_ctx["allow"]: return
                b64_audio = base64.b64encode(audio_bytes).decode("ascii")
                await websocket.send_text(json.dumps({"event": "tts_audio", "data": b64_audio}))
            except asyncio.CancelledError:
                return  # swallow cancellation during barge-in
            except Exception as e:
                await websocket.send_text(json.dumps({"event": "error", "message": f"TTS error: {e}"}))

    # --- Stream LLM deltas; micro-batch into TTS chunks based on should_flush() ---
    full_text = ""
    buf = ""
    await websocket.send_text(json.dumps({"event": "response_start"}))
    try:
        # Use contextual transcript so the LLM can attribute speakers
        async for delta in jarvis_service.agent.generate_stream(contextual_transcript, output_format="text"):
            if tts_ctx["cancel"].is_set(): raise asyncio.CancelledError()
            if not delta: continue
            full_text += delta
            buf += delta
            await websocket.send_text(json.dumps({"event": "partial_response", "data": delta}))
            if should_flush(buf):
                to_speak, buf = buf, ""
                # Fire-and-forget TTS so LLM streaming keeps flowing
                asyncio.create_task(flush_tts_phrase(to_speak))
    except asyncio.CancelledError:
        # Interrupted mid-generation (barge-in) — tell client the response stopped
        await websocket.send_text(json.dumps({"event": "response_done"}))
        return
    except Exception as e:
        await websocket.send_text(json.dumps({"event": "error", "message": f"LLM error: {e}"}))
        return

    # Finalize response + any tail TTS that didn’t meet flush criteria
    await websocket.send_text(json.dumps({"event": "response_text", "data": full_text}))
    await websocket.send_text(json.dumps({"event": "response_done"}))
    conn_history.append({"role": "assistant", "content": full_text})

    if buf.strip():
        await flush_tts_phrase(buf)


# ========================= WebSocket handler =========================
async def handle_voice_ws(websocket: WebSocket, jarvis_service):
    """Handle a single voice WebSocket connection end-to-end."""
    await websocket.accept()
    conn_id = str(uuid.uuid4())[:8]
    print(f"[{conn_id}] 🎤 WS client connected")

    # --- NEW: Instantiate diarization backend (embedder + per-WS registry) ---
    # First-run may download weights; choose CUDA if available.
    try:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        embedder = SpeakerEmbedder(device=device)
        registry = SpeakerRegistry()
    except Exception as e:
        print(f"[{conn_id}] ❌ FATAL: Could not initialize diarization models: {e}")
        await websocket.close(code=1011, reason="Diarization model failure")
        return

    # --- Stream state across the connection ---
    phrase_waveform = torch.empty((1, 0))         # Rolling phrase buffer (for STT)
    trigger_waveform = torch.empty((1, 0))        # Shorter buffer for VAD triggering
    conn_history = []                              # Minimal chat log for context
    speaking = False                               # Are we mid-utterance?
    speech_started_at = 0.0                        # Start time (monotonic) of current utterance
    silence_time = 0.0                             # Accumulated silence within utterance
    last_vad_check = 0.0                           # Throttle VAD calls
    # Track TTS state and current LLM gen task for cancellation (barge-in)
    tts_active = False
    gen_task: asyncio.Task | None = None

    # Factory for a fresh, cancel-aware TTS context per utterance
    def new_tts_ctx():
        return {"allow": True, "lock": asyncio.Lock(), "cancel": asyncio.Event()}
    tts_ctx = new_tts_ctx()

    try:
        print(f"[{conn_id}] Ready to process audio.")

        while True:
            # Receive JSON messages: audio chunks, control events, etc.
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            event = msg.get("event")

            # --- Client tells us when TTS starts/ends (for mic-ducking/barge-in logic) ---
            if event == "tts_start":
                tts_active = True
                continue
            if event == "tts_end":
                tts_active = False
                continue

            if event == "audio_chunk":
                # Input is 16 kHz mono PCM16 -> convert to float32 [-1,1]
                pcm_bytes = base64.b64decode(msg["data"])
                chunk = (torch.frombuffer(bytearray(pcm_bytes), dtype=torch.int16).to(torch.float32) / 32768.0).unsqueeze(0)

                # Quick server-side barge-in detector using RMS
                volume = calculate_rms(chunk)
                if tts_active and volume > MIN_RMS_FOR_SPEECH:
                    print(f"[{conn_id}] 🛑 Server-side barge-in detected!")
                    tts_active = False
                    tts_ctx["allow"] = False
                    tts_ctx["cancel"].set()              # signal TTS to stop ASAP
                    if gen_task and not gen_task.done():
                        gen_task.cancel()                 # cancel LLM generation task
                    await websocket.send_text(json.dumps({"event": "interrupt"}))
                    # Let user speech continue into buffers; mark speaking if not already
                    if not speaking:
                        speaking = True
                        silence_time = 0.0
                        speech_started_at = time.monotonic()
                        print(f"[{conn_id}] 🟢 Speech start (from server barge-in)")
                    continue

                # --- Append chunk to rolling buffers (prune to caps) ---
                phrase_waveform = torch.cat((phrase_waveform, chunk), dim=1)
                trigger_waveform = torch.cat((trigger_waveform, chunk), dim=1)

                if phrase_waveform.shape[1] > int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):
                    phrase_waveform = phrase_waveform[:, -int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):]
                if trigger_waveform.shape[1] > int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):
                    trigger_waveform = trigger_waveform[:, -int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):]

                # Derived values for segmentation decisions
                phrase_duration = phrase_waveform.shape[1] / TARGET_SAMPLE_RATE

                # Silence tracking (independent of VAD) to close phrases
                if volume < MIN_RMS_FOR_SPEECH:
                    silence_time += chunk.shape[1] / TARGET_SAMPLE_RATE
                else:
                    silence_time = 0.0

                dyn_timeout = compute_dynamic_silence_threshold(phrase_duration)

                now_vad = time.monotonic()
                # If we were speaking and silence crossed dynamic threshold → end utterance
                if speaking and silence_time >= dyn_timeout:
                    speaking = False
                    print(f"[{conn_id}] 🔴 Speech end (silence)")
                    if phrase_duration >= MIN_PHRASE_SEC:
                        # Snapshot and clear phrase buffers
                        phrase_to_process = phrase_waveform.clone()
                        phrase_waveform = torch.empty((1, 0))
                        trigger_waveform = torch.empty((1, 0))
                        tts_ctx = new_tts_ctx()  # fresh TTS ctx for this generation

                        # Diarize the complete utterance and get a speaker id
                        try:
                            embedding = embedder.embed(phrase_to_process.squeeze(0))
                            now = time.time()
                            speaker_id = registry.identify_or_enroll(embedding, now)
                            print(f"[{conn_id}] 🗣️  Utterance assigned to Speaker {speaker_id}")
                        except Exception as e:
                            print(f"[{conn_id}] ❌ Diarization error on final phrase: {e}")
                            speaker_id = registry.last_assigned_sid or 0  # fallback speaker id

                        # Kick off STT→LLM→TTS in the background (cancel-aware)
                        gen_task = asyncio.create_task(
                            process_and_send_results(websocket, phrase_to_process, jarvis_service, conn_history, tts_ctx, speaker_id)
                        )
                    continue

                # Skip VAD if super quiet
                if volume < MIN_RMS_FOR_SPEECH:
                    continue

                # Throttle VAD checks (~20 Hz)
                if now_vad - last_vad_check > 0.05:
                    last_vad_check = now_vad
                    try:
                        audio_np = trigger_waveform.squeeze(0).cpu().numpy()
                        segments = get_speech_timestamps(audio_np, VAD_MODEL, sampling_rate=TARGET_SAMPLE_RATE, **VAD_OPTS)
                    except Exception as e:
                        print(f"[{conn_id}] ❌ VAD error: {e}")
                        continue

                    # Speech onset: start tracking an utterance (diarize at end)
                    if segments and not speaking:
                        speaking = True
                        silence_time = 0.0
                        speech_started_at = time.monotonic()
                        print(f"[{conn_id}] 🟢 Speech start")

                    # Max-duration cutoff to avoid runaway utterances
                    if speaking and speech_started_at and (time.monotonic() - speech_started_at) > MAX_SPEECH_DURATION_SEC:
                        speaking = False
                        print(f"[{conn_id}] 🔴 Speech end (max duration)")
                        if phrase_duration >= MIN_PHRASE_SEC:
                            phrase_to_process = phrase_waveform.clone()
                            phrase_waveform = torch.empty((1, 0))
                            trigger_waveform = torch.empty((1, 0))
                            tts_ctx = new_tts_ctx()

                            # Diarize this capped utterance as well
                            try:
                                embedding = embedder.embed(phrase_to_process.squeeze(0))
                                now = time.time()
                                speaker_id = registry.identify_or_enroll(embedding, now)
                                print(f"[{conn_id}] 🗣️  Utterance assigned to Speaker {speaker_id}")
                            except Exception as e:
                                print(f"[{conn_id}] ❌ Diarization error on final phrase: {e}")
                                speaker_id = registry.last_assigned_sid or 0

                            gen_task = asyncio.create_task(
                                process_and_send_results(websocket, phrase_to_process, jarvis_service, conn_history, tts_ctx, speaker_id)
                            )
                continue

            elif event == "interrupt":
                # Client explicitly requested interruption (barge-in confirmed)
                print(f"[{conn_id}] ⛔️ Client-side barge-in confirmed.")
                tts_active = False
                tts_ctx["allow"] = False
                tts_ctx["cancel"].set()
                if gen_task and not gen_task.done():
                    gen_task.cancel()
                # Reset phrase buffers so next speech starts cleanly
                phrase_waveform = torch.empty((1, 0))
                trigger_waveform = torch.empty((1, 0))
                speaking = False
                tts_ctx = new_tts_ctx()  # fresh ctx for next turn
                continue

    except WebSocketDisconnect:
        print(f"[{conn_id}] ❌ Client disconnected")
    except Exception as e:
        print(f"[{conn_id}] Error in main loop: {e}")
        traceback.print_exc()
    finally:
        # Ensure any running generation is cancelled when the WS ends
        if gen_task and not gen_task.done():
            gen_task.cancel()
