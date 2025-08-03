from fastapi import Request, UploadFile
import os
import tempfile
from api.models.jarvis_models import PromptRequest, StartVoiceRequest
import asyncio
from sse_starlette.sse import EventSourceResponse

from jarvis.jarvis_service import JarvisService
from jarvis.ollama_agent import OllamaAgent

# Create single instances
ollama_agent = OllamaAgent("qwen3:8b")
jarvis_service = JarvisService(llm_agent=ollama_agent)

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

async def get_portfolio_data():
    try:
        account_data = get_account_data_for_ai()
        return {"portfolio": account_data}
    except Exception as e:
        print("🔴 Failed to fetch portfolio data:", str(e))
        return {"error": "Failed to fetch portfolio data"}
    



async def process_jarvis_audio(file: UploadFile):
    # Save uploaded file to temp
    temp_path = os.path.join(tempfile.gettempdir(), file.filename)
    with open(temp_path, "wb") as f:
        f.write(await file.read())

    result = jarvis_service.process_audio(temp_path)

    return {
        "transcript": result["transcript"],
        "response_text": result["response_text"],
        "audio_file_url": "/jarvis/audio/play"
    }

def get_jarvis_audio_file():
    audio_path = os.path.join(tempfile.gettempdir(), "jarvis_reply.mp3")
    return audio_path