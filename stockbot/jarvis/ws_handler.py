"""
WebSocket voice handler with:
- VAD-based turn taking
- Dynamic silence timeout + optional EOU model
- LLM token streaming
- TTS micro-batching (speak while thinking)
- Barge-in (interrupt) support

Requires:
  - JarvisService (with .stt, .tts, .agent, .vad_model)
  - TextToSpeech.synthesize_to_bytes(str) -> bytes
  - OllamaAgent.generate_stream(...) async generator yielding text deltas
"""
import os
import math
import base64
import json
import uuid
import asyncio
import time
import re
import torch
import numpy as np
from pathlib import Path
from starlette.websockets import WebSocket, WebSocketDisconnect
from silero_vad import get_speech_timestamps
import onnxruntime as ort
from transformers import AutoTokenizer
from huggingface_hub import hf_hub_download

# ========================= Settings =========================
TARGET_SAMPLE_RATE = 16000
MIN_RMS_FOR_SPEECH = 0.02

MAX_SPEECH_DURATION_SEC = 6.0   # hard cap for a single user turn
MIN_PHRASE_SEC = 0.3
TRIGGER_WINDOW_SEC = 2
MAX_HISTORY_SEC = 5

INTERRUPT_THRESHOLD = float(os.getenv("JARVIS_INTERRUPT_THRESHOLD", 0.015))
SUPPRESSION_RELEASE_SEC = float(os.getenv("JARVIS_RELEASE_SEC", 0.2))

# Dynamic silence range
MIN_SILENCE_SEC = 0.3
MAX_SILENCE_SEC = 1.2

# Sentence boundary for TTS micro-batching
BOUNDARY_RE = re.compile(r'([\.!\?…]["\')\]]?\s)$')

# Silero-VAD config
VAD_OPTS = dict(
    sampling_rate=TARGET_SAMPLE_RATE,
    threshold=0.5,
    min_speech_duration_ms=150,
    min_silence_duration_ms=120,
    window_size_samples=int(0.25 * TARGET_SAMPLE_RATE),
)

# ========================= Optional EOU model =========================
EOU_MODEL_DIR = Path("./models/turn_detector")
EOU_MODEL_DIR.mkdir(parents=True, exist_ok=True)
EOU_ONNX_PATH = EOU_MODEL_DIR / "model_quantized.onnx"
EOU_MODEL_REPO = "livekit/turn-detector"
EOU_MODEL_FILENAME = "model_quantized.onnx"

try:
    if not EOU_ONNX_PATH.exists():
        print("⬇️  Downloading EOU turn-detector ONNX model...")
        downloaded_path = hf_hub_download(
            repo_id=EOU_MODEL_REPO,
            filename=EOU_MODEL_FILENAME,
            cache_dir=str(EOU_MODEL_DIR),
        )
        Path(downloaded_path).rename(EOU_ONNX_PATH)
        print(f"✅ Model downloaded to {EOU_ONNX_PATH}")

    print("🔄 Loading tokenizer and EOU model...")
    tokenizer = AutoTokenizer.from_pretrained(EOU_MODEL_REPO)
    eou_session = ort.InferenceSession(str(EOU_ONNX_PATH), providers=["CPUExecutionProvider"])
    eou_token_id = tokenizer.encode("<|im_end|>")[0]
    print("✅ EOU model ready")
except Exception as e:
    print(f"⚠️ Could not load EOU model: {e}")
    tokenizer = None
    eou_session = None
    eou_token_id = None

# ========================= Helpers =========================
def calculate_rms(tensor: torch.Tensor) -> float:
    return math.sqrt(float(torch.mean(tensor ** 2)))

def decode_pcm_chunk_to_tensor(b64_data: str) -> torch.Tensor:
    """Decode PCM16 → 1×N float32 in [-1, 1]"""
    pcm_bytes = base64.b64decode(b64_data)
    raw = torch.frombuffer(bytearray(pcm_bytes), dtype=torch.int16)
    tensor = raw.to(torch.float32) / 32768.0
    return tensor.unsqueeze(0)

def compute_dynamic_silence_threshold(phrase_duration: float, eou_prob: float = None):
    base = MIN_SILENCE_SEC
    factor = min(1.0, phrase_duration / 3.0)
    timeout = base * (1.0 + factor)
    if eou_prob is not None and eou_prob > 0.5:
        timeout *= 0.6  # shorten if model confident user is done
    return max(MIN_SILENCE_SEC, min(timeout, MAX_SILENCE_SEC))

def predict_eou_prob(chat_history):
    """Predict probability that user turn is over based on chat history."""
    try:
        if tokenizer is None or eou_session is None:
            return None
        joined_text = "\n".join(f"{m['role']}: {m['content']}" for m in chat_history)
        toks = tokenizer(joined_text, return_tensors="np", add_special_tokens=False)
        logits = eou_session.run(["logits"], {"input_ids": toks["input_ids"]})[0]
        last_logits = logits[0, -1]
        probs = torch.nn.functional.softmax(torch.tensor(last_logits), dim=-1).numpy()
        return float(probs[eou_token_id])
    except Exception:
        return None

def should_flush(buf: str) -> bool:
    # Flush at clear sentence boundary, or if buffer got long and contains punctuation
    if BOUNDARY_RE.search(buf):
        return True
    if len(buf) > 180 and any(p in buf for p in ".!?;:"):
        return True
    return False

# ========================= Core pipeline =========================
async def process_and_send_results(
    websocket: WebSocket,
    phrase_tensor: torch.Tensor,
    jarvis_service,
    conn_history,
    tts_ctx: dict,  # {"allow": bool, "lock": asyncio.Lock()}
):
    # --- STT ---
    max_amp = phrase_tensor.abs().max() + 1e-6
    phrase_tensor = torch.clamp((phrase_tensor / max_amp) * 2.5, -1.0, 1.0)
    audio_np = phrase_tensor.squeeze(0).cpu().numpy()

    try:
        transcript = jarvis_service.stt.transcribe_from_array(audio_np)
    except Exception as e:
        await websocket.send_text(json.dumps({"event": "error", "message": str(e)}))
        return

    conn_history.append({"role": "user", "content": transcript})
    await websocket.send_text(json.dumps({"event": "transcript", "data": transcript}))

    # --- LLM STREAM + TTS micro-batching ---
    async def flush_tts_phrase(phrase: str):
        text = phrase.strip()
        if not text or not tts_ctx["allow"]:
            return
        async with tts_ctx["lock"]:
            if not tts_ctx["allow"]:
                return
            try:
                audio_bytes = await jarvis_service.tts.synthesize_to_bytes(text)
                b64_audio = base64.b64encode(audio_bytes).decode("ascii")
                await websocket.send_text(json.dumps({"event": "tts_audio", "data": b64_audio}))
            except Exception as e:
                await websocket.send_text(json.dumps({"event": "error", "message": f"TTS error: {e}"}))

    full_text = ""
    phrase_buf = ""
    await websocket.send_text(json.dumps({"event": "response_start"}))
    try:
        async for delta in jarvis_service.agent.generate_stream(transcript, output_format="text"):
            if not delta:
                continue
            full_text += delta
            phrase_buf += delta

            # UI: live text
            await websocket.send_text(json.dumps({"event": "partial_response", "data": delta}))

            # Audio: speak by sentence
            if should_flush(phrase_buf):
                to_speak, phrase_buf = phrase_buf, ""
                # fire & forget; lock keeps chunks serialized
                asyncio.create_task(flush_tts_phrase(to_speak))

    except Exception as e:
        await websocket.send_text(json.dumps({"event": "error", "message": f"LLM error: {e}"}))
        return

    # finalize UI text
    await websocket.send_text(json.dumps({"event": "response_text", "data": full_text}))
    await websocket.send_text(json.dumps({"event": "response_done"}))
    conn_history.append({"role": "assistant", "content": full_text})

    # speak any trailing fragment (no punctuation)
    if phrase_buf.strip():
        await flush_tts_phrase(phrase_buf)

    # optional: return eou prob for next-turn timeout
    return predict_eou_prob(conn_history)

# ========================= WebSocket handler =========================
async def handle_voice_ws(websocket: WebSocket, jarvis_service):
    await websocket.accept()
    conn_id = str(uuid.uuid4())[:8]
    print(f"[{conn_id}] 🎤 WS client connected")

    phrase_waveform = torch.empty((1, 0))
    trigger_waveform = torch.empty((1, 0))
    conn_history = []

    speaking = False
    silence_time = 0.0

    # For barge-in: gate interrupts while TTS is playing
    tts_playing = False
    suppression_active = False
    suppression_release_ts = 0.0

    last_vad_check = time.time()
    phrase_rms_values = []
    phrase_peak = 0.0
    speech_start_time = None
    last_eou_prob = None

    # TTS control shared with process_and_send_results
    tts_ctx = {"allow": True, "lock": asyncio.Lock()}

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            event = msg.get("event")

            if event == "pcm_chunk":
                chunk = decode_pcm_chunk_to_tensor(msg["data"])
                volume = calculate_rms(chunk)

                # append FIRST
                phrase_waveform = torch.cat((phrase_waveform, chunk), dim=1)
                trigger_waveform = torch.cat((trigger_waveform, chunk), dim=1)

                # clamp ring buffers
                if phrase_waveform.shape[1] > int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):
                    phrase_waveform = phrase_waveform[:, -int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):]
                if trigger_waveform.shape[1] > int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):
                    trigger_waveform = trigger_waveform[:, -int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):]

                phrase_duration = phrase_waveform.shape[1] / TARGET_SAMPLE_RATE

                if volume < MIN_RMS_FOR_SPEECH:
                    silence_time += chunk.shape[1] / TARGET_SAMPLE_RATE
                else:
                    silence_time = 0.0

                dyn_timeout = compute_dynamic_silence_threshold(phrase_duration, last_eou_prob)

                # speech end due to silence
                if speaking and silence_time >= dyn_timeout:
                    speaking = False
                    await websocket.send_text(json.dumps({"event": "speech_end"}))
                    if phrase_duration >= MIN_PHRASE_SEC:
                        phrase_to_process = phrase_waveform.clone()
                        phrase_waveform = torch.empty((1, 0))
                        trigger_waveform = torch.empty((1, 0))

                        # enable TTS for this response
                        tts_ctx["allow"] = True
                        last_eou_prob = await process_and_send_results(
                            websocket, phrase_to_process, jarvis_service, conn_history, tts_ctx
                        )
                    continue

                # ignore ultra-quiet chunks for triggering
                if volume < MIN_RMS_FOR_SPEECH:
                    continue

                phrase_rms_values.append(volume)
                phrase_peak = max(phrase_peak, volume)

                # user interrupt over TTS
                if tts_playing:
                    if volume < INTERRUPT_THRESHOLD:
                        pass
                    elif not suppression_active:
                        suppression_active = True
                        suppression_release_ts = asyncio.get_event_loop().time()
                    elif (asyncio.get_event_loop().time() - suppression_release_ts) >= SUPPRESSION_RELEASE_SEC:
                        tts_playing = False
                        suppression_active = False
                        # Stop future queued TTS on server side
                        tts_ctx["allow"] = False
                        await websocket.send_text(json.dumps({"event": "interrupt"}))

                # VAD polling
                now = time.time()
                if now - last_vad_check > 0.05:
                    last_vad_check = now
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
                        phrase_rms_values.clear()
                        phrase_peak = 0.0
                        speech_start_time = now
                        print(f"[{conn_id}] 🟢 Speech start")
                        await websocket.send_text(json.dumps({"event": "speech_start"}))

                    # hard cap turn length
                    if speaking and (now - speech_start_time) > MAX_SPEECH_DURATION_SEC:
                        speaking = False
                        await websocket.send_text(json.dumps({"event": "speech_end"}))
                        if phrase_duration >= MIN_PHRASE_SEC:
                            phrase_to_process = phrase_waveform.clone()
                            phrase_waveform = torch.empty((1, 0))
                            trigger_waveform = torch.empty((1, 0))

                            # enable TTS for this response
                            tts_ctx["allow"] = True
                            last_eou_prob = await process_and_send_results(
                                websocket, phrase_to_process, jarvis_service, conn_history, tts_ctx
                            )

            elif event == "tts_start":
                tts_playing = True
                suppression_active = False

            elif event == "tts_end":
                # Client signaled queue drained OR user interrupted.
                tts_playing = False
                suppression_active = False
                # Prevent any further queued TTS from being sent for this turn
                tts_ctx["allow"] = False

            elif event == "start_audio":
                # no-op placeholder
                pass

            elif event == "end_audio":
                # client stopped recording; optional flush point
                pass

            elif event == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))

    except WebSocketDisconnect:
        print(f"[{conn_id}] ❌ Client disconnected")
