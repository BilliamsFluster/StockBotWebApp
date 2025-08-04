"""
Improved WebSocket voice handler for Jarvis
"""

import os
import math
import base64
import json
import uuid
import asyncio
import tempfile
import time

import torch
import torchaudio
from starlette.websockets import WebSocket, WebSocketDisconnect
from silero_vad import get_speech_timestamps

# === Settings ===
TARGET_SAMPLE_RATE      = 16000
SILENCE_DURATION_SEC    = float(os.getenv("JARVIS_SILENCE_SEC",      0.8))
TRIGGER_WINDOW_SEC      = 2                       # ← more context for VAD
MAX_HISTORY_SEC         = 5
INTERRUPT_THRESHOLD     = float(os.getenv("JARVIS_INTERRUPT_THRESHOLD", 0.015))
SUPPRESSION_RELEASE_SEC = float(os.getenv("JARVIS_RELEASE_SEC",      0.2))
MIN_PHRASE_SEC          = float(os.getenv("JARVIS_MIN_PHRASE_SEC",   0.3))

# Silero-VAD tuning for typical laptop / headset mics
VAD_OPTS = dict(
    sampling_rate            = TARGET_SAMPLE_RATE,
    threshold                = 0.35,   # default 0.50 → more sensitive
    min_speech_duration_ms   = 150,
    min_silence_duration_ms  = 120,
    window_size_samples      = int(0.25 * TARGET_SAMPLE_RATE),  # ≈-250 ms
)


# === Helpers ==================================================================

def calculate_rms(tensor: torch.Tensor) -> float:
    """Root-mean-square energy of an audio tensor."""
    return math.sqrt(float(torch.mean(tensor ** 2)))


def decode_pcm_chunk_to_tensor(b64_data: str) -> torch.Tensor:
    """Convert base64-encoded 16-bit PCM chunk → 1×N float32 tensor in [-1,1]."""
    pcm_bytes       = base64.b64decode(b64_data)
    writable_bytes  = bytearray(pcm_bytes)               # make buffer writable
    raw             = torch.frombuffer(writable_bytes, dtype=torch.int16)
    tensor          = raw.clone().float() / 32768.0
    return tensor.unsqueeze(0)                           # shape 1×N


async def process_and_send_results(
    websocket: WebSocket,
    phrase_tensor: torch.Tensor,
    jarvis_service
):
    """Save phrase, hand to STT+LLM+TTS pipeline, then send results to client."""
    phrase_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}_final.wav")
    torchaudio.save(phrase_path, phrase_tensor, TARGET_SAMPLE_RATE)

    try:
        result = await jarvis_service.process_audio(phrase_path)
    except Exception as e:
        await websocket.send_text(json.dumps({"event": "error", "message": str(e)}))
        return

    # STT transcript
    await websocket.send_text(
        json.dumps({"event": "transcript", "data": result["transcript"]})
    )
    # LLM text response
    await websocket.send_text(
        json.dumps({"event": "response_text", "data": result["response_text"]})
    )

    # TTS audio
    try:
        with open(result["tts_audio_path"], "rb") as f:
            audio_bytes = f.read()
        b64_audio = base64.b64encode(audio_bytes).decode("ascii")
        await websocket.send_text(json.dumps({"event": "tts_audio", "data": b64_audio}))
    except Exception as e:
        print(f"❌ Failed to send TTS audio: {e}")


# === WebSocket handler ========================================================

async def handle_voice_ws(websocket: WebSocket, jarvis_service):
    await websocket.accept()
    conn_id = str(uuid.uuid4())[:8]
    print(f"[{conn_id}] 🎤 WS client connected")

    phrase_waveform   = torch.empty((1, 0))
    trigger_waveform  = torch.empty((1, 0))

    speaking               = False
    silence_time           = 0.0
    tts_playing            = False
    suppression_active     = False
    suppression_release_ts = 0.0
    last_vad_check         = time.time()

    try:
        while True:
            raw = await websocket.receive_text()

            # ---- Parse JSON --------------------------------------------------
            try:
                msg = json.loads(raw)
            except Exception as e:
                print(f"[{conn_id}] ⚠️  Invalid JSON: {e}")
                continue

            # ---- Audio chunk -------------------------------------------------
            if msg.get("event") == "pcm_chunk":
                chunk  = decode_pcm_chunk_to_tensor(msg["data"])
                volume = calculate_rms(chunk)
                print(f"[{conn_id}] 🎙️  chunk len={chunk.shape[1]} rms={volume:.4f}")

                # --- Self-voice suppression during TTS playback ---------------
                if tts_playing:
                    if volume < INTERRUPT_THRESHOLD:
                        # Too quiet → ignore
                        continue
                    else:
                        if not suppression_active:
                            suppression_active     = True
                            suppression_release_ts = asyncio.get_event_loop().time()
                            print(f"[{conn_id}] ⏳ loud input during TTS …")
                        elif (asyncio.get_event_loop().time() - suppression_release_ts
                              >= SUPPRESSION_RELEASE_SEC):
                            # Interrupt TTS
                            tts_playing        = False
                            suppression_active = False
                            await websocket.send_text(json.dumps({"event": "interrupt"}))
                            print(f"[{conn_id}] 🔻 TTS interrupted by user")
                            # fall through to process chunk normally

                # --- Append to buffers ---------------------------------------
                phrase_waveform  = torch.cat((phrase_waveform,  chunk), dim=1)
                trigger_waveform = torch.cat((trigger_waveform, chunk), dim=1)

                # Trim buffers
                if phrase_waveform.shape[1] > int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):
                    phrase_waveform = phrase_waveform[:, -int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):]
                if trigger_waveform.shape[1] > int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):
                    trigger_waveform = trigger_waveform[:, -int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):]

                # --- Periodic VAD ---------------------------------------------
                now = time.time()
                if now - last_vad_check > 0.05:          # every ~50 ms
                    last_vad_check = now
                    try:
                        segments = get_speech_timestamps(
                            trigger_waveform.squeeze(),
                            jarvis_service.vad_model,
                            **VAD_OPTS
                        )
                    except Exception as e:
                        print(f"[{conn_id}] ❌ VAD error: {e}")
                        continue

                    if segments:
                        if not speaking:
                            speaking     = True
                            silence_time = 0.0
                            await websocket.send_text(json.dumps({"event": "speech_start"}))
                    else:
                        if speaking:
                            silence_time += chunk.shape[1] / TARGET_SAMPLE_RATE
                            if silence_time >= SILENCE_DURATION_SEC:
                                speaking = False
                                await websocket.send_text(json.dumps({"event": "speech_end"}))

                                # Only send if long enough to be meaningful
                                if (phrase_waveform.shape[1] / TARGET_SAMPLE_RATE
                                        >= MIN_PHRASE_SEC):
                                    phrase_to_process = phrase_waveform.clone()
                                    # reset buffers
                                    phrase_waveform  = torch.empty((1, 0))
                                    trigger_waveform = torch.empty((1, 0))

                                    asyncio.create_task(
                                        process_and_send_results(
                                            websocket,
                                            phrase_to_process,
                                            jarvis_service
                                        )
                                    )
                                else:
                                    print(f"[{conn_id}] ⚠️  phrase too short, ignored")

            # ---- Playback events --------------------------------------------
            elif msg.get("event") == "tts_start":
                tts_playing        = True
                suppression_active = False

            elif msg.get("event") == "tts_end":
                tts_playing        = False
                suppression_active = False

            # ---- Keep-alive --------------------------------------------------
            elif msg.get("event") == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))

    except WebSocketDisconnect:
        print(f"[{conn_id}] ❌ Client disconnected")
