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
from pathlib import Path

import torch
import numpy as np
import torchaudio.transforms as T
from starlette.websockets import WebSocket, WebSocketDisconnect
from silero_vad import get_speech_timestamps

# ========================= Settings =========================
TARGET_SAMPLE_RATE = 16000
MIN_RMS_FOR_SPEECH = 0.008  # ~ -42 dBFS

MAX_SPEECH_DURATION_SEC = 6.0
MIN_PHRASE_SEC = 0.3
TRIGGER_WINDOW_SEC = 2
MAX_HISTORY_SEC = 5

INTERRUPT_THRESHOLD = float(os.getenv("JARVIS_INTERRUPT_THRESHOLD", 0.018))
EARLY_TTS_MULTIPLIER = 2.0  # stricter right after TTS start
SUPPRESSION_RELEASE_SEC = float(os.getenv("JARVIS_RELEASE_SEC", 0.25))

MIN_SILENCE_SEC = 0.3
MAX_SILENCE_SEC = 1.2

BOUNDARY_RE = re.compile(r'([\.!\?…]["\')\]]?\s)$')

SR_MIN, SR_MAX = 8000, 192000
LOG_SR_DELTA = 250
LOG_SR_MIN_INTERVAL = 1.0

RESAMPLE_LOG_EVERY = 100

PENDING_MAX_CHUNKS = 200
METRICS_FALLBACK_SEC = 0.8

VAD_OPTS = dict(
    sampling_rate=TARGET_SAMPLE_RATE,
    threshold=0.5,
    min_speech_duration_ms=150,
    min_silence_duration_ms=120,
    window_size_samples=int(0.25 * TARGET_SAMPLE_RATE),
)

# ========================= Helpers =========================
def calculate_rms(tensor: torch.Tensor) -> float:
    return math.sqrt(float(torch.mean(tensor ** 2)))


def decode_pcm_chunk_to_tensor(b64_data: str) -> torch.Tensor:
    pcm_bytes = base64.b64decode(b64_data)
    raw = torch.frombuffer(bytearray(pcm_bytes), dtype=torch.int16)
    tensor = raw.to(torch.float32) / 32768.0
    return tensor.unsqueeze(0)


def compute_dynamic_silence_threshold(phrase_duration: float):
    base = MIN_SILENCE_SEC
    factor = min(1.0, phrase_duration / 3.0)
    timeout = base * (1.0 + factor)
    return max(MIN_SILENCE_SEC, min(timeout, MAX_SILENCE_SEC))


def should_flush(buf: str) -> bool:
    if BOUNDARY_RE.search(buf):
        return True
    if len(buf) > 180 and any(p in buf for p in ".!?;:"):
        return True
    return False


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
        if not t:
            return
        if tts_ctx["cancel"].is_set() or not tts_ctx["allow"]:
            return
        async with tts_ctx["lock"]:
            if tts_ctx["cancel"].is_set() or not tts_ctx["allow"]:
                return
            try:
                audio_bytes = await jarvis_service.tts.synthesize_to_bytes(t, cancel=tts_ctx["cancel"])
                if tts_ctx["cancel"].is_set() or not tts_ctx["allow"]:
                    return
                b64_audio = base64.b64encode(audio_bytes).decode("ascii")
                await websocket.send_text(json.dumps({"event": "tts_audio", "data": b64_audio}))
            except asyncio.CancelledError:
                return
            except Exception as e:
                await websocket.send_text(json.dumps({"event": "error", "message": f"TTS error: {e}"}))

    full_text = ""
    buf = ""
    await websocket.send_text(json.dumps({"event": "response_start"}))
    try:
        async for delta in jarvis_service.agent.generate_stream(transcript, output_format="text"):
            if tts_ctx["cancel"].is_set():
                raise asyncio.CancelledError()
            if not delta:
                continue
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
    await websocket.accept()
    conn_id = str(uuid.uuid4())[:8]
    print(f"[{conn_id}] 🎤 WS client connected")

    client_sample_rate = None
    resolved_input_sr = None
    resampler = None
    pending_chunks = []

    last_metric = {"frame": None, "time": None, "ctx_sr": None}
    last_est_sr_logged = None
    last_sr_log_ts = 0.0
    sr_fallback_deadline = time.monotonic() + METRICS_FALLBACK_SEC

    phrase_waveform = torch.empty((1, 0))
    trigger_waveform = torch.empty((1, 0))
    conn_history = []

    speaking = False
    speech_started_at = 0.0
    silence_time = 0.0
    last_vad_check = time.time()

    tts_playing = False
    tts_started_ts = 0.0
    suppression_release_ts = 0.0

    # cancellation-aware TTS/LLM context
    def new_tts_ctx():
        return {"allow": True, "lock": asyncio.Lock(), "cancel": asyncio.Event()}

    tts_ctx = new_tts_ctx()
    resample_log_ctr = 0

    # current generation task (LLM+TTS streaming)
    gen_task: asyncio.Task | None = None

    try:
        while True:
            # SR resolve fallback
            if resolved_input_sr is None and client_sample_rate and time.monotonic() > sr_fallback_deadline:
                resolved_input_sr = int(client_sample_rate)
                if not (SR_MIN <= resolved_input_sr <= SR_MAX):
                    resolved_input_sr = 48000
                if resolved_input_sr != TARGET_SAMPLE_RATE:
                    resampler = T.Resample(orig_freq=resolved_input_sr, new_freq=TARGET_SAMPLE_RATE)
                    print(f"[{conn_id}] ⚠️ Metrics missing; fallback SR {resolved_input_sr}→{TARGET_SAMPLE_RATE}")
                if pending_chunks:
                    print(f"[{conn_id}] 📦 Flushing {len(pending_chunks)} queued chunks after fallback SR resolve")
                    for c in pending_chunks:
                        cc = resampler(c) if resampler else c
                        phrase_waveform = torch.cat((phrase_waveform, cc), dim=1)
                        trigger_waveform = torch.cat((trigger_waveform, cc), dim=1)
                    pending_chunks.clear()

            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            event = msg.get("event")

            if event == "config":
                client_sample_rate = int(msg.get("sample_rate", TARGET_SAMPLE_RATE))
                print(f"[{conn_id}] 🎤 Reported AudioContext rate: {client_sample_rate} Hz")
                continue

            if event == "metrics":
                fr = int(msg.get("frame", 0))
                t_client = float(msg.get("client_time", 0.0))
                ctx_sr = int(msg.get("ctx_sample_rate", 0))

                prev_frame = last_metric["frame"]
                prev_time = last_metric["time"]

                if prev_frame is not None and prev_time is not None:
                    dframes = fr - prev_frame
                    dtime = t_client - prev_time
                    if dframes > 0 and 0.005 <= dtime <= 5.0:
                        est_sr = dframes / dtime
                        if SR_MIN <= est_sr <= SR_MAX:
                            now = time.monotonic()
                            if (
                                last_est_sr_logged is None
                                or abs(est_sr - last_est_sr_logged) > LOG_SR_DELTA
                            ) and (now - last_sr_log_ts) >= LOG_SR_MIN_INTERVAL:
                                print(f"[{conn_id}] 🎯 Worklet clock rate ≈ {est_sr:.1f} Hz (ctx={ctx_sr} Hz)")
                                last_est_sr_logged = est_sr
                                last_sr_log_ts = now

                            if resolved_input_sr is None:
                                resolved_input_sr = ctx_sr or int(round(est_sr))
                                if not (SR_MIN <= resolved_input_sr <= SR_MAX):
                                    resolved_input_sr = None
                                else:
                                    if resolved_input_sr != TARGET_SAMPLE_RATE:
                                        resampler = T.Resample(orig_freq=resolved_input_sr, new_freq=TARGET_SAMPLE_RATE)
                                        print(f"[{conn_id}] 🎧 Resampler set {resolved_input_sr}→{TARGET_SAMPLE_RATE}")
                                    if pending_chunks:
                                        print(f"[{conn_id}] 📦 Flushing {len(pending_chunks)} queued chunks after SR resolve")
                                        for c in pending_chunks:
                                            cc = resampler(c) if resampler else c
                                            phrase_waveform = torch.cat((phrase_waveform, cc), dim=1)
                                            trigger_waveform = torch.cat((trigger_waveform, cc), dim=1)
                                        pending_chunks.clear()
                last_metric.update({"frame": fr, "time": t_client, "ctx_sr": ctx_sr})
                continue

            if event == "pcm_chunk":
                chunk = decode_pcm_chunk_to_tensor(msg["data"])

                if resolved_input_sr is None:
                    if len(pending_chunks) >= PENDING_MAX_CHUNKS:
                        pending_chunks.pop(0)
                    pending_chunks.append(chunk)
                    continue

                if resampler:
                    chunk = resampler(chunk)
                    resample_log_ctr += 1
                    if resample_log_ctr % RESAMPLE_LOG_EVERY == 0:
                        print(f"[{conn_id}] 🎚 Resampled {resolved_input_sr}→{TARGET_SAMPLE_RATE} (frames: {chunk.shape[1]})")
                else:
                    resample_log_ctr += 1
                    if resample_log_ctr % RESAMPLE_LOG_EVERY == 0:
                        print(f"[{conn_id}] ⏺ Using native {TARGET_SAMPLE_RATE} Hz, frames={chunk.shape[1]}")

                volume = calculate_rms(chunk)

                # Maintain rolling buffers
                phrase_waveform = torch.cat((phrase_waveform, chunk), dim=1)
                trigger_waveform = torch.cat((trigger_waveform, chunk), dim=1)

                if phrase_waveform.shape[1] > int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):
                    phrase_waveform = phrase_waveform[:, -int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):]
                if trigger_waveform.shape[1] > int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):
                    trigger_waveform = trigger_waveform[:, -int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):]

                # -------- Barge‑in detection while TTS is playing --------
                if tts_playing:
                    multiplier = EARLY_TTS_MULTIPLIER if time.monotonic() < suppression_release_ts else 1.0
                    eff_threshold = INTERRUPT_THRESHOLD * multiplier
                    if volume >= eff_threshold:
                        print(f"[{conn_id}] ⛔️ Barge‑in (RMS={volume:.4f} ≥ {eff_threshold:.4f})")
                        await websocket.send_text(json.dumps({"event": "interrupt"}))

                        # cancel any ongoing generation/TTS
                        tts_ctx["allow"] = False
                        tts_ctx["cancel"].set()
                        if gen_task and not gen_task.done():
                            gen_task.cancel()
                            try:
                                await gen_task
                            except asyncio.CancelledError:
                                pass
                        gen_task = None

                        # clear buffers; start fresh
                        phrase_waveform = torch.empty((1, 0))
                        trigger_waveform = torch.empty((1, 0))
                        speaking = False
                        silence_time = 0.0
                        speech_started_at = 0.0

                        # New TTS context for the next turn
                        tts_ctx = new_tts_ctx()
                        continue

                # -------- Speech segmentation / VAD --------
                phrase_duration = phrase_waveform.shape[1] / TARGET_SAMPLE_RATE

                if volume < MIN_RMS_FOR_SPEECH:
                    silence_time += chunk.shape[1] / TARGET_SAMPLE_RATE
                else:
                    silence_time = 0.0

                dyn_timeout = compute_dynamic_silence_threshold(phrase_duration)

                now_vad = time.time()
                if speaking and silence_time >= dyn_timeout:
                    speaking = False
                    await websocket.send_text(json.dumps({"event": "speech_end"}))
                    if phrase_duration >= MIN_PHRASE_SEC:
                        phrase_to_process = phrase_waveform.clone()
                        phrase_waveform = torch.empty((1, 0))
                        trigger_waveform = torch.empty((1, 0))
                        # allow TTS for this turn
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
                        segments = get_speech_timestamps(
                            trigger_waveform.squeeze(),
                            jarvis_service.vad_model,
                            **VAD_OPTS,
                        )
                    except Exception as e:
                        print(f"[{conn_id}] ❌ VAD error: {e}")
                        continue

                    if segments and not speaking:
                        speaking = True
                        silence_time = 0.0
                        speech_started_at = time.monotonic()
                        print(f"[{conn_id}] 🟢 Speech start")
                        await websocket.send_text(json.dumps({"event": "speech_start"}))

                    if speaking and speech_started_at and (time.monotonic() - speech_started_at) > MAX_SPEECH_DURATION_SEC:
                        speaking = False
                        await websocket.send_text(json.dumps({"event": "speech_end"}))
                        if phrase_duration >= MIN_PHRASE_SEC:
                            phrase_to_process = phrase_waveform.clone()
                            phrase_waveform = torch.empty((1, 0))
                            trigger_waveform = torch.empty((1, 0))
                            tts_ctx["allow"] = True
                            gen_task = asyncio.create_task(
                                process_and_send_results(websocket, phrase_to_process, jarvis_service, conn_history, tts_ctx)
                            )
                continue

            if event == "tts_start":
                tts_playing = True
                tts_started_ts = time.monotonic()
                suppression_release_ts = tts_started_ts + SUPPRESSION_RELEASE_SEC
                continue

            if event == "tts_end":
                tts_playing = False
                continue

            if event == "start_audio":
                continue

            if event == "end_audio":
                continue

            if event == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))
                continue

    except WebSocketDisconnect:
        print(f"[{conn_id}] ❌ Client disconnected")
    finally:
        if gen_task and not gen_task.done():
            gen_task.cancel()
            try:
                await gen_task
            except asyncio.CancelledError:
                pass
