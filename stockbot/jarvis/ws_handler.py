"""
WebSocket voice handler — interrupt-safe streaming TTS with barge‑in.
Key fixes:
- Duck mic input on client during TTS to prevent self-echo.
- Barge‑in grace period after TTS start; higher threshold early on.
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
import torchaudio.transforms as T
from starlette.websockets import WebSocket, WebSocketDisconnect

# --- NEW: Import the diarization module ---
from .diarization import SpeakerRegistry, SpeakerEmbedder

# Correctly load VAD model and utilities from torch.hub
VAD_MODEL, VAD_UTILS = torch.hub.load(
    repo_or_dir='snakers4/silero-vad', model='silero_vad', force_reload=False, onnx=False
)
(get_speech_timestamps, _, _, _, _) = VAD_UTILS

# ========================= Settings from your working file =========================
TARGET_SAMPLE_RATE = 16000
MIN_RMS_FOR_SPEECH = 0.008
MAX_SPEECH_DURATION_SEC = 6.0
MIN_PHRASE_SEC = 0.3
TRIGGER_WINDOW_SEC = 2.0
MAX_HISTORY_SEC = 5.0
MIN_SILENCE_SEC = 0.3
MAX_SILENCE_SEC = 1.2
BOUNDARY_RE = re.compile(r'([\.!\?…]["\')\]]?\s)$')
VAD_OPTS = dict(
    threshold=0.3,
    min_speech_duration_ms=150,
    min_silence_duration_ms=120,
)

# ========================= Helpers from your working file =========================
def calculate_rms(tensor: torch.Tensor) -> float:
    return math.sqrt(float(torch.mean(tensor ** 2)))


def compute_dynamic_silence_threshold(phrase_duration: float):
    base = MIN_SILENCE_SEC
    factor = min(1.0, phrase_duration / 3.0)
    timeout = base * (1.0 + factor)
    return max(MIN_SILENCE_SEC, min(timeout, MAX_SILENCE_SEC))


def should_flush(buf: str) -> bool:
    # --- MODIFIED: More aggressive flushing for lower latency ---
    if not buf.strip(): return False
    # Flush on sentence-ending punctuation
    if BOUNDARY_RE.search(buf): return True
    # Flush on commas or if the buffer is getting moderately long
    if ',' in buf or ':' in buf or ';' in buf or len(buf) > 45: return True
    return False


# --- MODIFIED: This function now accepts a speaker_id ---
async def process_and_send_results(
    websocket: WebSocket,
    phrase_tensor: torch.Tensor,
    jarvis_service,
    conn_history,
    tts_ctx: dict,
    speaker_id: int, # <-- MODIFIED: Accept speaker_id
):
    peak = float(phrase_tensor.abs().max()) + 1e-9
    rms = float(torch.sqrt(torch.mean(phrase_tensor ** 2)))
    dbfs = 20 * math.log10(max(rms, 1e-9))
    gain = 1.0
    if peak > 0.05:
        gain = min(1.0 / peak, 3.0)
    phrase_tensor = phrase_tensor * gain

    frames = phrase_tensor.shape[1]
    print(
        f"📝 Sending to STT: frames={frames} @ {TARGET_SAMPLE_RATE} Hz (~{frames/TARGET_SAMPLE_RATE:.2f}s), "
        f"peak={peak:.4f}, rms={rms:.4f} ({dbfs:.1f} dBFS), gain={gain:.2f}"
    )

    audio_np = phrase_tensor.squeeze(0).cpu().numpy()

    try:
        project_root = Path(__file__).resolve().parents[2]
        debug_dir = project_root / "debug_audio"
        debug_dir.mkdir(exist_ok=True)
        debug_audio_path = debug_dir / f"stt_input_{uuid.uuid4().hex}.wav"

        transcript = jarvis_service.stt.transcribe_from_array(
            audio_np,
            debug_save_path=str(debug_audio_path),
        )
    except Exception as e:
        await websocket.send_text(json.dumps({"event": "error", "message": str(e)}))
        return

    # --- MODIFIED: Prepend speaker ID for LLM context and UI ---
    contextual_transcript = f"[Speaker {speaker_id}]: {transcript}"
    conn_history.append({"role": "user", "content": contextual_transcript})
    await websocket.send_text(json.dumps({"event": "transcript", "data": transcript, "speaker": f"Speaker {speaker_id}"}))

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
            except asyncio.CancelledError: return
            except Exception as e:
                await websocket.send_text(json.dumps({"event": "error", "message": f"TTS error: {e}"}))

    full_text = ""
    buf = ""
    await websocket.send_text(json.dumps({"event": "response_start"}))
    try:
        # --- MODIFIED: Use the contextual transcript for the LLM ---
        async for delta in jarvis_service.agent.generate_stream(contextual_transcript, output_format="text"):
            if tts_ctx["cancel"].is_set(): raise asyncio.CancelledError()
            if not delta: continue
            full_text += delta
            buf += delta
            await websocket.send_text(json.dumps({"event": "partial_response", "data": delta}))
            if should_flush(buf):
                to_speak, buf = buf, ""
                asyncio.create_task(flush_tts_phrase(to_speak))
    except asyncio.CancelledError:
        await websocket.send_text(json.dumps({"event": "response_done"}))
        return
    except Exception as e:
        await websocket.send_text(json.dumps({"event": "error", "message": f"LLM error: {e}"}))
        return

    await websocket.send_text(json.dumps({"event": "response_text", "data": full_text}))
    await websocket.send_text(json.dumps({"event": "response_done"}))
    conn_history.append({"role": "assistant", "content": full_text})

    if buf.strip():
        await flush_tts_phrase(buf)


# ========================= WebSocket handler =========================
async def handle_voice_ws(websocket: WebSocket, jarvis_service):
    """Handle a single voice WebSocket connection."""
    await websocket.accept()
    conn_id = str(uuid.uuid4())[:8]
    print(f"[{conn_id}] 🎤 WS client connected")

    # --- NEW: Instantiate Diarization Services ---
    # This might take a few seconds on first run to download the model
    try:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        embedder = SpeakerEmbedder(device=device)
        registry = SpeakerRegistry()
    except Exception as e:
        print(f"[{conn_id}] ❌ FATAL: Could not initialize diarization models: {e}")
        await websocket.close(code=1011, reason="Diarization model failure")
        return

    # --- State variables from your working file ---
    phrase_waveform = torch.empty((1, 0))
    trigger_waveform = torch.empty((1, 0))
    conn_history = []
    speaking = False
    speech_started_at = 0.0
    silence_time = 0.0
    last_vad_check = 0.0
    # --- NEW: Add tts_active state tracking as per your plan ---
    tts_active = False
    gen_task: asyncio.Task | None = None
    def new_tts_ctx():
        return {"allow": True, "lock": asyncio.Lock(), "cancel": asyncio.Event()}
    tts_ctx = new_tts_ctx()

    try:
        print(f"[{conn_id}] Ready to process audio.")

        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            event = msg.get("event")

            # --- NEW: Handle TTS state from client as per your plan ---
            if event == "tts_start":
                tts_active = True
                continue
            if event == "tts_end":
                tts_active = False
                continue

            if event == "audio_chunk":
                # Audio is already 16kHz, so we just decode and process
                pcm_bytes = base64.b64decode(msg["data"])
                chunk = (torch.frombuffer(bytearray(pcm_bytes), dtype=torch.int16).to(torch.float32) / 32768.0).unsqueeze(0)

                volume = calculate_rms(chunk)

                # --- NEW: Server-side barge-in logic as a fallback ---
                if tts_active and volume > MIN_RMS_FOR_SPEECH:
                    print(f"[{conn_id}] 🛑 Server-side barge-in detected!")
                    tts_active = False
                    tts_ctx["allow"] = False
                    tts_ctx["cancel"].set()
                    if gen_task and not gen_task.done():
                        gen_task.cancel()
                    await websocket.send_text(json.dumps({"event": "interrupt"}))
                    # Don't reset phrase_waveform, let the user's speech continue
                    if not speaking:
                        speaking = True # Assume speech has started
                        silence_time = 0.0
                        speech_started_at = time.monotonic()
                        print(f"[{conn_id}] 🟢 Speech start (from server barge-in)")
                    continue

                # Maintain rolling buffers
                phrase_waveform = torch.cat((phrase_waveform, chunk), dim=1)
                trigger_waveform = torch.cat((trigger_waveform, chunk), dim=1)

                if phrase_waveform.shape[1] > int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):
                    phrase_waveform = phrase_waveform[:, -int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):]
                if trigger_waveform.shape[1] > int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):
                    trigger_waveform = trigger_waveform[:, -int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):]

                # --- VAD and speech segmentation logic from your working file ---
                phrase_duration = phrase_waveform.shape[1] / TARGET_SAMPLE_RATE

                # --- REMOVED: Faulty mid-speech chunking logic ---

                if volume < MIN_RMS_FOR_SPEECH:
                    silence_time += chunk.shape[1] / TARGET_SAMPLE_RATE
                else:
                    silence_time = 0.0

                dyn_timeout = compute_dynamic_silence_threshold(phrase_duration)

                now_vad = time.monotonic()
                if speaking and silence_time >= dyn_timeout:
                    speaking = False
                    print(f"[{conn_id}] 🔴 Speech end (silence)")
                    # --- Process the final, complete phrase ---
                    if phrase_duration >= MIN_PHRASE_SEC:
                        phrase_to_process = phrase_waveform.clone()
                        phrase_waveform = torch.empty((1, 0))
                        trigger_waveform = torch.empty((1, 0))
                        # --- MODIFIED: Create fresh tts_ctx for new generation ---
                        tts_ctx = new_tts_ctx()

                        # --- NEW: Perform diarization on the complete utterance ---
                        try:
                            embedding = embedder.embed(phrase_to_process.squeeze(0))
                            now = time.time()
                            speaker_id = registry.identify_or_enroll(embedding, now)
                            print(f"[{conn_id}] 🗣️  Utterance assigned to Speaker {speaker_id}")
                        except Exception as e:
                            print(f"[{conn_id}] ❌ Diarization error on final phrase: {e}")
                            speaker_id = registry.last_assigned_sid or 0 # Fallback

                        gen_task = asyncio.create_task(
                            process_and_send_results(websocket, phrase_to_process, jarvis_service, conn_history, tts_ctx, speaker_id)
                        )
                    continue

                if volume < MIN_RMS_FOR_SPEECH:
                    continue

                if now_vad - last_vad_check > 0.05:
                    last_vad_check = now_vad
                    try:
                        audio_np = trigger_waveform.squeeze(0).cpu().numpy()
                        segments = get_speech_timestamps(audio_np, VAD_MODEL, sampling_rate=TARGET_SAMPLE_RATE, **VAD_OPTS)
                    except Exception as e:
                        print(f"[{conn_id}] ❌ VAD error: {e}")
                        continue

                    # --- MODIFIED: Simplified speech start, diarization happens at the end ---
                    if segments and not speaking:
                        speaking = True
                        silence_time = 0.0
                        speech_started_at = time.monotonic()
                        print(f"[{conn_id}] 🟢 Speech start")

                    if speaking and speech_started_at and (time.monotonic() - speech_started_at) > MAX_SPEECH_DURATION_SEC:
                        speaking = False
                        print(f"[{conn_id}] 🔴 Speech end (max duration)")
                        # --- Process the final, complete phrase ---
                        if phrase_duration >= MIN_PHRASE_SEC:
                            phrase_to_process = phrase_waveform.clone()
                            phrase_waveform = torch.empty((1, 0))
                            trigger_waveform = torch.empty((1, 0))
                            # --- MODIFIED: Create fresh tts_ctx for new generation ---
                            tts_ctx = new_tts_ctx()
                            
                            # --- NEW: Perform diarization on the complete utterance (for max duration case) ---
                            try:
                                embedding = embedder.embed(phrase_to_process.squeeze(0))
                                now = time.time()
                                speaker_id = registry.identify_or_enroll(embedding, now)
                                print(f"[{conn_id}] 🗣️  Utterance assigned to Speaker {speaker_id}")
                            except Exception as e:
                                print(f"[{conn_id}] ❌ Diarization error on final phrase: {e}")
                                speaker_id = registry.last_assigned_sid or 0 # Fallback

                            gen_task = asyncio.create_task(
                                process_and_send_results(websocket, phrase_to_process, jarvis_service, conn_history, tts_ctx, speaker_id)
                            )
                continue

            elif event == "interrupt":
                print(f"[{conn_id}] ⛔️ Client-side barge-in confirmed.")
                tts_active = False
                tts_ctx["allow"] = False
                tts_ctx["cancel"].set()
                if gen_task and not gen_task.done():
                    gen_task.cancel()
                phrase_waveform = torch.empty((1, 0))
                trigger_waveform = torch.empty((1, 0))
                speaking = False
                # --- MODIFIED: Create fresh tts_ctx after interrupt ---
                tts_ctx = new_tts_ctx()
                continue

    except WebSocketDisconnect:
        print(f"[{conn_id}] ❌ Client disconnected")
    except Exception as e:
        print(f"[{conn_id}] Error in main loop: {e}")
        traceback.print_exc()
    finally:
        if gen_task and not gen_task.done():
            gen_task.cancel()
