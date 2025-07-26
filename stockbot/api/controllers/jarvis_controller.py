from fastapi import Request
from api.models.jarvis_models import PromptRequest, StartVoiceRequest
import subprocess, os, json, asyncio
from sse_starlette.sse import EventSourceResponse

# Local modules
from Core.config import shared_state
from Core.web.web_search import fetch_financial_snippets
from Core.API.data_fetcher import get_account_data_for_ai
from Core.ollama.ollama_llm import generate_analysis
from Core.jarvis.core import call_jarvis
from Core.jarvis.memory_manager import MemoryManager

listeners: set[asyncio.Queue] = set()
voice_process = None

memory = MemoryManager()

async def ask_jarvis(request):
    try:
        print("🟡 Received prompt:", request.prompt)
        print("🟡 Requested model:", request.model)

        user_id = getattr(request, "user_id", "default")

        # Step 1: Detect what data is needed
        prompt = request.prompt.lower()
        flags = detect_prompt_type(prompt)

        # Step 2: Pull short-term memory
        chat_history = memory.format_memory(user_id)

        # Step 3: Build enrichment blocks
        enrichment_blocks = []

        if flags["needs_market_data"]:
            try:
                headlines = fetch_financial_snippets()
                enrichment_blocks.append(f"---\nRecent Market Headlines:\n{headlines}")
            except Exception as e:
                print("⚠️ Market fetch failed:", str(e))

        if flags["needs_account_data"]:
            try:
                account_data = get_account_data_for_ai()
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



async def start_voice(request: StartVoiceRequest):
    
    config = {
        "model": request.model,
        "format": request.format,
        "access_token": request.access_token,
    }

    # Store in shared state (for future logging/LLM context/debug)
    shared_state.model = request.model
    shared_state.format_type = request.format
    shared_state.access_token = request.access_token

    # Save to shared_state.json for persistence or auditing
    try:
        json_path = os.path.abspath("Core/config/shared_state.json")
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        with open(json_path, "w") as f:
            json.dump(config, f)

        print("✅ Voice assistant initialized (client-driven).")
        return {"message": "Voice assistant initialized on client."}

    except Exception as e:
        print("❌ Failed to save voice config:", str(e))
        return {"error": "Failed to initialize voice assistant config."}

async def stop_voice():
    global voice_process
    if voice_process and voice_process.poll() is None:
        voice_process.terminate()
        voice_process.wait()
        voice_process = None
        return {"message": "Voice assistant stopped."}
    return {"error": "Voice assistant not running."}

async def voice_event(request: Request):
    payload = await request.json()
    text = payload.get("text")
    for q in listeners:
        await q.put(text)
    return {"ok": True}

async def voice_stream():
    queue: asyncio.Queue = asyncio.Queue()
    listeners.add(queue)

    async def event_generator():
        try:
            while True:
                text = await queue.get()
                yield {"event": "message", "data": text}
        except asyncio.CancelledError:
            pass
        finally:
            listeners.remove(queue)

    return EventSourceResponse(event_generator())


def store_schwab_tokens(req):
    # Store to shared_state Python module
    shared_state.access_token = req.access_token
    shared_state.refresh_token = req.refresh_token
    shared_state.expires_at = req.expires_at

    # Optional: update model + format if desired
    shared_state.model = getattr(shared_state, "model", "qwen3")
    shared_state.format_type = getattr(shared_state, "format_type", "markdown")

    print("✅ Schwab tokens set in shared_state:")
    print("access_token:", shared_state.access_token)
    print("refresh_token:", shared_state.refresh_token)
    print("expires_at:", shared_state.expires_at)

    return {"message": "Schwab tokens stored in shared_state."}