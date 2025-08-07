from fastapi import Request, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
import os
import tempfile
from api.models.jarvis_models import PromptRequest, StartVoiceRequest
import asyncio
from sse_starlette.sse import EventSourceResponse
import json
import base64
import uuid
import torch
import soundfile as sf
import torchaudio
from silero_vad import load_silero_vad, read_audio, get_speech_timestamps

from pydub import AudioSegment
# Local modules
from Core.config import shared_state
from Core.web.web_search import fetch_financial_snippets
from Core.API.data_fetcher import get_account_data_for_ai
from Core.ollama.ollama_llm import generate_analysis
from Core.jarvis.core import call_jarvis
from Core.jarvis.memory_manager import MemoryManager
import math

# Create single instances

memory = MemoryManager()

TARGET_SAMPLE_RATE = 16000
SILENCE_DURATION_SEC = 0.8
TRIGGER_WINDOW_SEC = 1
MAX_HISTORY_SEC = 5

# Load Silero VAD
torch.set_num_threads(1)
VAD_MODEL = load_silero_vad(onnx=False)

# Threshold for ignoring low-volume TTS mic pickup
# RMS suppression for Jarvis self-voice detection
INTERRUPT_THRESHOLD = 0.05  # Adjust after testing
SUPPRESSION_RELEASE_SEC = 0.15  # How long user must speak to disable suppression


# === Helpers ===
def calculate_rms(tensor: torch.Tensor) -> float:
    return math.sqrt(float(torch.mean(tensor ** 2)))

def decode_pcm_chunk_to_tensor(b64_data: str) -> torch.Tensor:
    pcm_bytes = base64.b64decode(b64_data)

    # bytearray is writable, so no warning
    writable_bytes = bytearray(pcm_bytes)
    raw = torch.frombuffer(writable_bytes, dtype=torch.int16)

    tensor = raw.clone().float() / 32768.0
    return tensor.unsqueeze(0)

async def process_and_send_results(websocket: WebSocket, phrase_tensor: torch.Tensor):
    # Save utterance to WAV
    phrase_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}_final.wav")
    torchaudio.save(phrase_path, phrase_tensor, TARGET_SAMPLE_RATE)
    print(f"💾 Saved utterance to {phrase_path}")

    try:
        result = await jarvis_service.process_audio(phrase_path)
    except Exception as e:
        print(f"❌ process_audio failed: {e}")
        await websocket.send_text(json.dumps({"event": "error", "message": str(e)}))
        return

    # Send transcript
    await websocket.send_text(json.dumps({"event": "transcript", "data": result["transcript"]}))
    print(f"📝 Sent transcript: {result['transcript']}")

    # Send LLM response
    await websocket.send_text(json.dumps({"event": "response_text", "data": result["response_text"]}))
    print(f"🤖 Sent response_text: {result['response_text']}")

    # Send TTS audio
    try:
        with open(result["tts_audio_path"], "rb") as f:
            audio_bytes = f.read()
        b64_audio = base64.b64encode(audio_bytes).decode("ascii")
        await websocket.send_text(json.dumps({"event": "tts_audio", "data": b64_audio}))
        print(f"📤 Sent TTS audio to client ({len(b64_audio)} base64 chars)")
    except Exception as e:
        print(f"❌ Failed to send TTS audio: {e}")

# === Main WS handler ===
async def handle_voice_ws(websocket: WebSocket):
    await websocket.accept()
    conn_id = str(uuid.uuid4())[:8]
    print(f"🎤 WS client connected: {conn_id}")

    phrase_waveform = torch.empty((1, 0))
    trigger_waveform = torch.empty((1, 0))

    speaking = False
    silence_time = 0.0
    tts_playing = False
    suppression_active = False
    suppression_release_time = 0.0

    try:
        while True:
            msg_raw = await websocket.receive_text()
            try:
                msg = json.loads(msg_raw)
            except:
                print("⚠️ Invalid JSON from WS client")
                continue

            if msg.get("event") == "pcm_chunk":
                chunk = decode_pcm_chunk_to_tensor(msg["data"])
                volume = calculate_rms(chunk)

                # Self-voice suppression
                if tts_playing:
                    if volume < INTERRUPT_THRESHOLD:
                        print(f"🔇 Ignoring low-volume mic input during TTS (RMS={volume:.4f})")
                        continue
                    else:
                        # User is loud enough → start release timer
                        if not suppression_active:
                            suppression_active = True
                            suppression_release_time = asyncio.get_event_loop().time()
                        elif asyncio.get_event_loop().time() - suppression_release_time >= SUPPRESSION_RELEASE_SEC:
                            print("🎤 Suppression released — user interrupting TTS")
                            tts_playing = False
                            suppression_active = False
                            await websocket.send_text(json.dumps({"event": "interrupt"}))

                n = chunk.shape[1]

                # Append to buffers
                phrase_waveform = torch.cat((phrase_waveform, chunk), dim=1)
                trigger_waveform = torch.cat((trigger_waveform, chunk), dim=1)

                # Limit buffer sizes
                if phrase_waveform.shape[1] > int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):
                    phrase_waveform = phrase_waveform[:, -int(TARGET_SAMPLE_RATE * MAX_HISTORY_SEC):]
                if trigger_waveform.shape[1] > int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):
                    trigger_waveform = trigger_waveform[:, -int(TARGET_SAMPLE_RATE * TRIGGER_WINDOW_SEC):]

                # Run VAD
                try:
                    segments = get_speech_timestamps(trigger_waveform.squeeze(), VAD_MODEL, sampling_rate=TARGET_SAMPLE_RATE)
                except Exception as e:
                    print(f"❌ VAD error: {e}")
                    continue

                if segments:
                    if not speaking:
                        print("   🔔 Speech started")
                        speaking = True
                        silence_time = 0.0
                        await websocket.send_text(json.dumps({"event": "speech_start"}))
                else:
                    if speaking:
                        silence_time += n / TARGET_SAMPLE_RATE
                        if silence_time >= SILENCE_DURATION_SEC:
                            print("   🔚 Speech ended — sending phrase for processing")
                            speaking = False
                            await websocket.send_text(json.dumps({"event": "speech_end"}))

                            # Double-buffer: clone current phrase & clear immediately
                            phrase_to_process = phrase_waveform.clone()
                            phrase_waveform = torch.empty((1, 0))
                            trigger_waveform = torch.empty((1, 0))

                            asyncio.create_task(process_and_send_results(websocket, phrase_to_process))

            elif msg.get("event") == "tts_start":
                tts_playing = True
                suppression_active = False
                suppression_release_time = 0.0

            elif msg.get("event") == "tts_end":
                tts_playing = False
                suppression_active = False

            elif msg.get("event") == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))

    except WebSocketDisconnect:
        print(f"❌ Client disconnected: {conn_id}")

async def ask_jarvis(request):
    try:
        print("🟡 Received prompt:", request.prompt)
        print("🟡 Requested model:", request.model)

        user_id = getattr(request, "user_id", "default")
        prompt = request.prompt.lower()

        # Step 1: Detect flags based on prompt keywords
        flags = {
            "needs_market_data": any(k in prompt for k in [
                "stock", "stocks", "market", "nasdaq", "s&p", "dow", "headline", "finance", "economic", "inflation", "fed"
            ]),
            "needs_summary": any(k in prompt for k in [
                "portfolio", "summary", "account value", "total balance"
            ]),
            "needs_positions": any(k in prompt for k in [
                "holdings", "positions", "assets", "what do i own"
            ]),
            "needs_orders": any(k in prompt for k in [
                "orders", "pending orders", "placed orders"
            ]),
            "needs_transactions": any(k in prompt for k in [
                "transactions", "history", "activity", "recent activity"
            ])
        }

        # Step 2: Load memory
        chat_history = memory.format_memory(user_id)

        # Step 3: Build enrichment blocks
        enrichment_blocks = []

        if flags["needs_market_data"]:
            try:
                headlines = fetch_financial_snippets()
                enrichment_blocks.append(f"---\nRecent Market Headlines:\n{headlines}")
            except Exception as e:
                print("⚠️ Market fetch failed:", str(e))

        if any([flags["needs_summary"], flags["needs_positions"], flags["needs_orders"], flags["needs_transactions"]]):
            try:
                account_data = get_account_data_for_ai(
                    include_summary=flags["needs_summary"],
                    include_positions=flags["needs_positions"],
                    include_orders=flags["needs_orders"],
                    include_transactions=flags["needs_transactions"]
                )
                enrichment_blocks.append(f"---\nAccount Summary:\n{account_data}")
            except Exception as e:
                print("⚠️ Account fetch failed:", str(e))

        # Step 4: Compose the final prompt
        combined_prompt = f"{chat_history}\nUser: {request.prompt}"
        if enrichment_blocks:
            combined_prompt += "\n\n" + "\n\n".join(enrichment_blocks)

        print("🟡 Final prompt to LLM:")
        print(combined_prompt)

        # Step 5: Call the model
        result = call_jarvis(
            user_prompt=combined_prompt,
            model=request.model,
        )

        # Step 6: Store turn in memory
        memory.add_turn(user_id, request.prompt, result)

        return {"response": result}

    except Exception as e:
        print("🔴 Jarvis failed:", str(e))
        return {"error": "Failed to generate response"}

def detect_prompt_type(prompt: str) -> dict:
    prompt = prompt.lower()
    return {
        "needs_market_data": any(k in prompt for k in [
            "stock", "stocks", "market", "nasdaq", "s&p", "dow", "headline", "finance", "economic", "inflation", "fed"
        ]),
        "needs_account_data": any(k in prompt for k in [
            "my account", "my portfolio", "balance", "how much", "invested", "holdings", "profit", "loss"
        ])
    }


