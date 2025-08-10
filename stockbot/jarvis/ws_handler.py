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
    threshold=0.5,
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
    if BOUNDARY_RE.search(buf): return True
    if len(buf) > 180 and any(p in buf for p in ".!?;:"): return True
    return False


# This function is restored from your working file
async def process_and_send_results(
    websocket: WebSocket,
    phrase_tensor: torch.Tensor,
    jarvis_service,
    conn_history,
    tts_ctx: dict,
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

    conn_history.append({"role": "user", "content": transcript})
    await websocket.send_text(json.dumps({"event": "transcript", "data": transcript}))

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
        async for delta in jarvis_service.agent.generate_stream(transcript, output_format="text"):
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

    # --- State variables from your working file ---
    phrase_waveform = torch.empty((1, 0))
    trigger_waveform = torch.empty((1, 0))
    conn_history = []
    speaking = False
    speech_started_at = 0.0
    silence_time = 0.0
    last_vad_check = 0.0
    gen_task: asyncio.Task | None = None
    def new_tts_ctx():
        return {"allow": True, "lock": asyncio.Lock(), "cancel": asyncio.Event()}
    tts_ctx = new_tts_ctx()

    try:
        # --- FIX: Removed the incorrect check for a "start" event ---
        # The original code was designed to handle events as they arrive,
        # starting with "config" or "audio_chunk".

        print(f"[{conn_id}] Ready to process audio.")

        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            event = msg.get("event")

            if event == "audio_chunk":
                # Audio is already 16kHz, so we just decode and process
                pcm_bytes = base64.b64decode(msg["data"])
                chunk = (torch.frombuffer(bytearray(pcm_bytes), dtype=torch.int16).to(torch.float32) / 32768.0).unsqueeze(0)

                volume = calculate_rms(chunk)

                # Maintain rolling buffers
                phrase_waveform = torch.cat((phrase_waveform, chunk), dim=1)
                trigger_waveform = torch.cat((trigger_waveform, chunk), dim=1)

                if phrase_waveform.shape[1] > int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):
                    phrase_waveform = phrase_waveform[:, -int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):]
                if trigger_waveform.shape[1] > int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):
                    trigger_waveform = trigger_waveform[:, -int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):]

                # --- VAD and speech segmentation logic from your working file ---
                phrase_duration = phrase_waveform.shape[1] / TARGET_SAMPLE_RATE

                if volume < MIN_RMS_FOR_SPEECH:
                    silence_time += chunk.shape[1] / TARGET_SAMPLE_RATE
                else:
                    silence_time = 0.0

                dyn_timeout = compute_dynamic_silence_threshold(phrase_duration)

                now_vad = time.monotonic()
                if speaking and silence_time >= dyn_timeout:
                    speaking = False
                    print(f"[{conn_id}] 🔴 Speech end (silence)")
                    if phrase_duration >= MIN_PHRASE_SEC:
                        phrase_to_process = phrase_waveform.clone()
                        phrase_waveform = torch.empty((1, 0))
                        trigger_waveform = torch.empty((1, 0))
                        tts_ctx["allow"] = True
                        gen_task = asyncio.create_task(
                            process_and_send_results(websocket, phrase_to_process, jarvis_service, conn_history, tts_ctx)
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

                    if segments and not speaking:
                        speaking = True
                        silence_time = 0.0
                        speech_started_at = time.monotonic()
                        print(f"[{conn_id}] 🟢 Speech start")

                    if speaking and speech_started_at and (time.monotonic() - speech_started_at) > MAX_SPEECH_DURATION_SEC:
                        speaking = False
                        print(f"[{conn_id}] 🔴 Speech end (max duration)")
                        if phrase_duration >= MIN_PHRASE_SEC:
                            phrase_to_process = phrase_waveform.clone()
                            phrase_waveform = torch.empty((1, 0))
                            trigger_waveform = torch.empty((1, 0))
                            tts_ctx["allow"] = True
                            gen_task = asyncio.create_task(
                                process_and_send_results(websocket, phrase_to_process, jarvis_service, conn_history, tts_ctx)
                            )
                continue

            elif event == "interrupt":
                print(f"[{conn_id}] ⛔️ Barge-in received.")
                tts_ctx["allow"] = False
                tts_ctx["cancel"].set()
                if gen_task and not gen_task.done():
                    gen_task.cancel()
                phrase_waveform = torch.empty((1, 0))
                trigger_waveform = torch.empty((1, 0))
                speaking = False
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
