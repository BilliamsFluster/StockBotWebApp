# D:\Websites\StockBot\stockbot\jarvis\ws_handler.py
"""
Improved WebSocket voice handler for Jarvis
With aggregated logging for useful debugging.
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
TARGET_SAMPLE_RATE = 16000
SILENCE_DURATION_SEC = float(os.getenv("JARVIS_SILENCE_SEC", 0.4))
TRIGGER_WINDOW_SEC = 2
MAX_HISTORY_SEC = 5
INTERRUPT_THRESHOLD = float(os.getenv("JARVIS_INTERRUPT_THRESHOLD", 0.015))
SUPPRESSION_RELEASE_SEC = float(os.getenv("JARVIS_RELEASE_SEC", 0.2))
MIN_PHRASE_SEC = float(os.getenv("JARVIS_MIN_PHRASE_SEC", 0.3))

# Prevent noise-triggered STT
MIN_RMS_FOR_SPEECH = 0.02  # Adjust for your mic

# Silero-VAD tuning
VAD_OPTS = dict(
    sampling_rate=TARGET_SAMPLE_RATE,
    threshold=0.5,
    min_speech_duration_ms=150,
    min_silence_duration_ms=120,
    window_size_samples=int(0.25 * TARGET_SAMPLE_RATE),
)

# === Helpers ==================================================================

def calculate_rms(tensor: torch.Tensor) -> float:
    return math.sqrt(float(torch.mean(tensor ** 2)))


def decode_pcm_chunk_to_tensor(b64_data: str) -> torch.Tensor:
    """Decode PCM16 → 1×N float32 in [-1, 1]"""
    pcm_bytes = base64.b64decode(b64_data)
    raw = torch.frombuffer(bytearray(pcm_bytes), dtype=torch.int16)
    tensor = raw.to(torch.float32) / 32768.0
    return tensor.unsqueeze(0)


# === Constants ===
MAX_SPEECH_DURATION_SEC = 6.0  # End after 6 sec max
MIN_RMS_FOR_SPEECH = 0.02      # Skip low-RMS noise

# === Process results ===
async def process_and_send_results(websocket: WebSocket, phrase_tensor: torch.Tensor, jarvis_service):
    """Save phrase → STT → LLM → TTS with useful logs"""
    phrase_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}_final.wav")

    # Normalize and boost
    max_amp = phrase_tensor.abs().max() + 1e-6
    phrase_tensor = phrase_tensor / max_amp
    phrase_tensor = torch.clamp(phrase_tensor * 2.5, -1.0, 1.0)

    torchaudio.save(
        phrase_path,
        phrase_tensor.to(torch.float32),
        TARGET_SAMPLE_RATE,
        encoding="PCM_S",
        bits_per_sample=16,
    )

    duration_sec = phrase_tensor.shape[1] / TARGET_SAMPLE_RATE
    print(f"💾 Saved phrase for STT: {phrase_path} ({duration_sec:.2f}s, {os.path.getsize(phrase_path)} bytes)")

    try:
        result = await jarvis_service.process_audio(phrase_path)
    except Exception as e:
        await websocket.send_text(json.dumps({"event": "error", "message": str(e)}))
        return

    await websocket.send_text(json.dumps({"event": "transcript", "data": result["transcript"]}))
    await websocket.send_text(json.dumps({"event": "response_text", "data": result["response_text"]}))

    try:
        with open(result["tts_audio_path"], "rb") as f:
            audio_bytes = f.read()
        b64_audio = base64.b64encode(audio_bytes).decode("ascii")
        await websocket.send_text(json.dumps({"event": "tts_audio", "data": b64_audio}))
    except Exception as e:
        print(f"❌ Failed to send TTS audio: {e}")


# === WebSocket handler ===
async def handle_voice_ws(websocket: WebSocket, jarvis_service):
    await websocket.accept()
    conn_id = str(uuid.uuid4())[:8]
    print(f"[{conn_id}] 🎤 WS client connected")

    phrase_waveform = torch.empty((1, 0))
    trigger_waveform = torch.empty((1, 0))

    speaking = False
    silence_time = 0.0
    tts_playing = False
    suppression_active = False
    suppression_release_ts = 0.0
    last_vad_check = time.time()

    # Logging stats
    phrase_rms_values = []
    phrase_peak = 0.0
    speech_start_time = None
    last_log_time = 0

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            if msg.get("event") == "pcm_chunk":
                chunk = decode_pcm_chunk_to_tensor(msg["data"])
                volume = calculate_rms(chunk)

                # Ignore low-RMS noise
                if volume < MIN_RMS_FOR_SPEECH:
                    continue

                # Track stats
                phrase_rms_values.append(volume)
                phrase_peak = max(phrase_peak, volume)

                # TTS suppression
                if tts_playing:
                    if volume < INTERRUPT_THRESHOLD:
                        continue
                    elif not suppression_active:
                        suppression_active = True
                        suppression_release_ts = asyncio.get_event_loop().time()
                    elif (asyncio.get_event_loop().time() - suppression_release_ts) >= SUPPRESSION_RELEASE_SEC:
                        tts_playing = False
                        suppression_active = False
                        await websocket.send_text(json.dumps({"event": "interrupt"}))

                # Append buffers
                phrase_waveform = torch.cat((phrase_waveform, chunk), dim=1)
                trigger_waveform = torch.cat((trigger_waveform, chunk), dim=1)

                # Trim buffers
                if phrase_waveform.shape[1] > int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):
                    phrase_waveform = phrase_waveform[:, -int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):]
                if trigger_waveform.shape[1] > int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):
                    trigger_waveform = trigger_waveform[:, -int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):]

                # Run VAD periodically
                now = time.time()
                if now - last_vad_check > 0.05:
                    last_vad_check = now
                    try:
                        segments = get_speech_timestamps(trigger_waveform.squeeze(), jarvis_service.vad_model, **VAD_OPTS)
                    except Exception as e:
                        print(f"[{conn_id}] ❌ VAD error: {e}")
                        continue

                    if segments:  # speech detected
                        if not speaking:
                            speaking = True
                            silence_time = 0.0
                            phrase_rms_values.clear()
                            phrase_peak = 0.0
                            speech_start_time = now
                            last_log_time = now
                            print(f"[{conn_id}] 🟢 Speech start — segments={len(segments)}, buffer={trigger_waveform.shape[1]} samples")
                            await websocket.send_text(json.dumps({"event": "speech_start"}))

                        # Log every ~1s
                        if now - last_log_time >= 1.0:
                            avg_rms_so_far = sum(phrase_rms_values) / max(1, len(phrase_rms_values))
                            print(f"[{conn_id}] 🎙️ Avg RMS so far: {avg_rms_so_far:.4f}, Peak so far: {phrase_peak:.4f}")
                            last_log_time = now

                        # Force end if too long
                        if (now - speech_start_time) > MAX_SPEECH_DURATION_SEC:
                            print(f"[{conn_id}] ⏹ Forced speech end — too long")
                            speaking = False
                            await websocket.send_text(json.dumps({"event": "speech_end"}))
                            if (phrase_waveform.shape[1] / TARGET_SAMPLE_RATE) >= MIN_PHRASE_SEC:
                                phrase_to_process = phrase_waveform.clone()
                                phrase_waveform = torch.empty((1, 0))
                                trigger_waveform = torch.empty((1, 0))
                                asyncio.create_task(process_and_send_results(websocket, phrase_to_process, jarvis_service))

                    else:  # no speech detected
                        if speaking:
                            silence_time += chunk.shape[1] / TARGET_SAMPLE_RATE
                            if silence_time >= SILENCE_DURATION_SEC:
                                speaking = False
                                avg_rms = sum(phrase_rms_values) / max(1, len(phrase_rms_values))
                                print(f"[{conn_id}] 🔴 Speech end — duration={now - speech_start_time:.2f}s, avg RMS={avg_rms:.4f}, peak={phrase_peak:.4f}")
                                await websocket.send_text(json.dumps({"event": "speech_end"}))

                                if (phrase_waveform.shape[1] / TARGET_SAMPLE_RATE) >= MIN_PHRASE_SEC:
                                    phrase_to_process = phrase_waveform.clone()
                                    phrase_waveform = torch.empty((1, 0))
                                    trigger_waveform = torch.empty((1, 0))
                                    asyncio.create_task(process_and_send_results(websocket, phrase_to_process, jarvis_service))

            elif msg.get("event") == "tts_start":
                tts_playing = True
                suppression_active = False

            elif msg.get("event") == "tts_end":
                tts_playing = False
                suppression_active = False

            elif msg.get("event") == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))

    except WebSocketDisconnect:
        print(f"[{conn_id}] ❌ Client disconnected")
