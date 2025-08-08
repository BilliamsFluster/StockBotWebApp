"""
Improved WebSocket voice handler for Jarvis
- Dynamic silence detection with local EOU transformer
- Raw audio direct to Whisper (no file I/O)
- True streaming of LLM output via partial_response events
"""
import os
import math
import base64
import json
import uuid
import asyncio
import time
import torch
import numpy as np
from pathlib import Path
from starlette.websockets import WebSocket, WebSocketDisconnect
from silero_vad import get_speech_timestamps
import onnxruntime as ort
from transformers import AutoTokenizer
from huggingface_hub import hf_hub_download

# === Settings ===
TARGET_SAMPLE_RATE = 16000
MIN_RMS_FOR_SPEECH = 0.02
MAX_SPEECH_DURATION_SEC = 6.0
MIN_PHRASE_SEC = 0.3
TRIGGER_WINDOW_SEC = 2
MAX_HISTORY_SEC = 5
INTERRUPT_THRESHOLD = float(os.getenv("JARVIS_INTERRUPT_THRESHOLD", 0.015))
SUPPRESSION_RELEASE_SEC = float(os.getenv("JARVIS_RELEASE_SEC", 0.2))

# Dynamic silence range
MIN_SILENCE_SEC = 0.3
MAX_SILENCE_SEC = 1.2

# Silero-VAD config
VAD_OPTS = dict(
    sampling_rate=TARGET_SAMPLE_RATE,
    threshold=0.5,
    min_speech_duration_ms=150,
    min_silence_duration_ms=120,
    window_size_samples=int(0.25 * TARGET_SAMPLE_RATE),
)

# === Auto-download EOU model ===
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


# === Helpers ==================================================================

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
    """Predict probability that user turn is over."""
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


# === Process results ===
async def process_and_send_results(websocket: WebSocket, phrase_tensor: torch.Tensor, jarvis_service, conn_history):
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

    # --- LLM STREAMING ---
    full_text = ""
    await websocket.send_text(json.dumps({"event": "response_start"}))
    try:
        async for delta in jarvis_service.agent.generate_stream(transcript, output_format="text"):
            full_text += delta
            await websocket.send_text(json.dumps({"event": "partial_response", "data": delta}))
    except Exception as e:
        await websocket.send_text(json.dumps({"event": "error", "message": f"LLM error: {e}"}))
        return

    # finalize
    await websocket.send_text(json.dumps({"event": "response_text", "data": full_text}))
    await websocket.send_text(json.dumps({"event": "response_done"}))
    conn_history.append({"role": "assistant", "content": full_text})

    # --- TTS after we have the full text ---
    import tempfile, uuid as _uuid
    out_path = os.path.join(tempfile.gettempdir(), f"jarvis_reply_{uuid.uuid4().hex}.mp3")
    try:
        await jarvis_service.tts.synthesize(full_text, out_path)  # <-- OK now
        with open(out_path, "rb") as f:
            audio_bytes = f.read()
        b64_audio = base64.b64encode(audio_bytes).decode("ascii")
        await websocket.send_text(json.dumps({"event": "tts_audio", "data": b64_audio}))
    except Exception as e:
        print(f"❌ Failed to send TTS audio: {e}")

    # optional: return eou prob for next-turn timeout
    return predict_eou_prob(conn_history)


# === WebSocket handler ===
async def handle_voice_ws(websocket: WebSocket, jarvis_service):
    await websocket.accept()
    conn_id = str(uuid.uuid4())[:8]
    print(f"[{conn_id}] 🎤 WS client connected")

    phrase_waveform = torch.empty((1, 0))
    trigger_waveform = torch.empty((1, 0))
    conn_history = []

    speaking = False
    silence_time = 0.0
    tts_playing = False
    suppression_active = False
    suppression_release_ts = 0.0
    last_vad_check = time.time()
    phrase_rms_values = []
    phrase_peak = 0.0
    speech_start_time = None
    last_log_time = 0
    last_eou_prob = None

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

                # append FIRST, so duration reflects current chunk
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
                        last_eou_prob = await process_and_send_results(
                            websocket, phrase_to_process, jarvis_service, conn_history
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
                        last_log_time = now
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
                            last_eou_prob = await process_and_send_results(
                                websocket, phrase_to_process, jarvis_service, conn_history
                            )

            elif msg.get("event") == "tts_start":
                tts_playing = True
                suppression_active = False

            elif msg.get("event") == "tts_end":
                tts_playing = False
                suppression_active = False

            elif msg.get("event") == "start_audio":
                # no-op (placeholder if you want to ack)
                pass

            elif msg.get("event") == "end_audio":
                # client stopped recording; you might want to flush here
                pass

            elif msg.get("event") == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))

    except WebSocketDisconnect:
        print(f"[{conn_id}] ❌ Client disconnected")
