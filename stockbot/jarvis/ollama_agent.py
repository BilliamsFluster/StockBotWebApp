import json
import logging
import httpx
import requests
import re
import asyncio
import os
from typing import Any, Dict, Optional, AsyncGenerator

from .agent import BaseAgent
from .memory_manager import MemoryManager
from ingestion.provider_manager import ProviderManager
from utils.web_search import fetch_financial_snippets

logging.basicConfig(level=logging.DEBUG)
log = logging.getLogger("OllamaAgent")


class OllamaAgent(BaseAgent):
    """
    LLM agent backed by a local Ollama server. Wraps prompts with:
      - per-user memory/context
      - optional brokerage/tool context (via ProviderManager)
    Supports both non-streaming (`generate`) and streaming (`generate_stream`) replies.
    """
    API_URL = "http://localhost:11434/api/generate"
    _system_prompt_cache: Optional[str] = None

    def __init__(
        self,
        model_name: str,
        memory_manager: MemoryManager,
        provider_name: str = "schwab",
        provider_kwargs: Optional[Dict[str, Any]] = None,
    ):
        """
        Args:
            model_name: Ollama model id, e.g., "qwen2.5:7b".
            memory_manager: memory orchestrator for history + summaries.
            provider_name: tool/provider key for fetching account data.
            provider_kwargs: init args for the provider (e.g., tokens).
        """
        super().__init__(model=model_name, memory_manager=memory_manager)
        self.model = model_name
        self.provider_name = provider_name
        self.provider_kwargs = provider_kwargs or {}
        self._user_id: str = "default"  # default memory bucket if unset

    def _get_system_prompt(self) -> str:
        """Loads the system prompt from a file, caching it for reuse."""
        if OllamaAgent._system_prompt_cache is None:
            try:
                # Construct path relative to this file's location
                current_dir = os.path.dirname(__file__)
                prompt_path = os.path.join(current_dir, "prompts", "system_prompt.txt")
                with open(prompt_path, "r", encoding="utf-8") as f:
                    OllamaAgent._system_prompt_cache = f.read().strip()
                log.debug("System prompt loaded from file.")
            except Exception as e:
                log.error(f"Failed to load system prompt from file: {e}")
                # Fallback prompt in case the file is missing
                OllamaAgent._system_prompt_cache = "You are Jarvis, a precise but friendly finance assistant."
        return OllamaAgent._system_prompt_cache

    # ---- optional: set once per session/WS ----
    def set_user(self, user_id: str) -> "OllamaAgent":
        """Pin a user id for subsequent calls."""
        self._user_id = user_id
        return self

    # Allow an inline tag at the start of a prompt: [[user: alice]]
    _USER_TAG_RE = re.compile(r"^\s*\[\[\s*user\s*:\s*([^\]]+?)\s*\]\]\s*", re.IGNORECASE)

    def _pick_user_id(self, prompt: str) -> str:
        """Extract user id from a [[user: ...]] tag if present; else use current."""
        m = self._USER_TAG_RE.match(prompt or "")
        return m.group(1).strip() if m else self._user_id

    def _strip_user_tag(self, prompt: str) -> str:
        """Remove a leading [[user: ...]] tag from the prompt."""
        return self._USER_TAG_RE.sub("", prompt, count=1)

    # ---- provider context ----
    def _resolve_flag_context(self, flags: Dict[str, bool]) -> Dict[str, Any]:
        """
        Fetch provider/tool data based on detected flags.
        Fails soft (returns partial/empty ctx) if a tool isn't available.
        """
        ctx: Dict[str, Any] = {}

        # --- Provider Context (for account-specific data) ---
        try:
            # Lazily obtain a provider (e.g., Schwab) using cached instance if available.
            provider = ProviderManager.get_provider(self.provider_name, self.provider_kwargs)
            log.debug(f"[Jarvis] Got provider from cache: {provider}")

            # Conditionally pull data; each call is isolated so a failure doesn't kill everything.
            if flags.get("needs_summary"):
                ctx["summary"] = provider.get_account_summary()
            if flags.get("needs_positions"):
                ctx["positions"] = provider.get_positions()
            if flags.get("needs_transactions"):
                ctx["transactions"] = provider.get_transactions()
            if flags.get("needs_orders"):
                ctx["orders"] = provider.get_orders()

        except Exception as e:
            # Graceful degradation when provider can't be constructed (e.g., missing token).
            logging.debug(
                f"[Jarvis] Could not get provider '{self.provider_name}': {e}. "
                "Proceeding without provider context."
            )
        
        # --- Web Search Context ---
        if flags.get("needs_web_search"):
            try:
                log.debug("[Jarvis] Fetching web search results.")
                ctx["web_search_results"] = fetch_financial_snippets()
            except Exception as e:
                log.error(f"[Jarvis] Web search failed: {e}")
                ctx["web_search_results"] = {"error": f"Web search failed: {e}"}

        return ctx

    # ---- memory+tools prompt wrapper ----
    def _wrap_with_memory(
        self,
        user_id: str,
        user_msg: str,
        tool_context: Dict[str, Any],
        output_format: str
    ) -> str:
        """
        Compose the final prompt sent to the model:
          1) auto-promote preferences from the latest user message,
          2) include relevant memory context,
          3) include optional tool/provider context,
          4) set meta formatting hints (markdown/json/text).
        """
        # 1) Update long-term prefs if the message suggests any.
        self.memory_manager.auto_promote_preferences(user_id, user_msg)

        # 2) Retrieve memory context (long + short-term; filtered by similarity to `user_msg`).
        mem_ctx = self.memory_manager.format_context(user_id, query=user_msg, k_long=5, as_json=False)

        # 3) Combine memory and tool context into a single block.
        context_str = ""
        if tool_context:
            tool_info = json.dumps(tool_context, indent=2)
            context_str += f"## Market Data\n{tool_info}\n\n"
        
        if mem_ctx.strip():
            # Frame the history as a log, not a script to follow.
            context_str += f"## Log of Past Conversation\n{mem_ctx}\n\n"

        # 4) Formatting hint to the model.
        meta_prompt = {
            "markdown": "Respond in markdown format.",
            "json": "Respond using valid JSON.",
            "text": "Respond in plain text format, no markdown or JSON.",
        }

        # Get the system prompt from our new file-based method
        system_prompt = self._get_system_prompt()

        # Present all context under a single, neutral heading.
        return (
            f"{system_prompt}\n\n"
            f"{context_str}"
            f"## Your Turn\nUser: {user_msg}\nAssistant:\n\n{meta_prompt.get(output_format, '')}"
        )

    # =========================
    # KEEP YOUR PIPELINE: memory baked in
    # =========================
    def generate(self, prompt: str, output_format: str = "text") -> str:
        """
        Non-streaming generation:
          - derive user id
          - detect flags -> fetch tool context
          - wrap with memory + tools
          - call Ollama
          - commit turn to memory (+ optional summarization)
        """
        log.debug("[Jarvis] generate() called")

        # Determine user for this call; allow inline override via [[user: ...]] tag.
        uid = self._pick_user_id(prompt)
        user_msg = self._strip_user_tag(prompt)

        # Provider flags -> fetch only what we need.
        flags = self.detect_flags(user_msg)
        tool_ctx = self._resolve_flag_context(flags)

        # Build the final prompt to the model.
        final_prompt = self._wrap_with_memory(uid, user_msg, tool_ctx, output_format)

        # Fire a blocking Ollama call and get the full reply.
        reply = self._generate_raw(final_prompt, output_format)

        # Persist conversation turn.
        self.memory_manager.add_turn(uid, user_msg, reply)

        # Periodically summarize to keep token budgets reasonable.
        if self.memory_manager.should_summarize(uid):
            self.memory_manager.summarize_short_term(
                uid,
                llm_summarize_fn=lambda p: self._generate_raw(p, "text")
            )

        return reply

    async def generate_stream(self, prompt: str, output_format: str = "text"):
        """
        Streaming generation:
          - same as `generate`, but yields text deltas as they arrive
          - commits memory at the end
          - triggers summarization in the background to avoid blocking
        """
        log.debug("[Jarvis] generate_stream() called")

        # Inline user override if present.
        uid = self._pick_user_id(prompt)
        user_msg = self._strip_user_tag(prompt)

        # Collect provider data only as requested.
        flags = self.detect_flags(user_msg)
        tool_ctx = self._resolve_flag_context(flags)

        # Final prompt with memory + tools.
        final_prompt = self._wrap_with_memory(uid, user_msg, tool_ctx, output_format)

        # Stream from Ollama, accumulating for final memory write.
        full: list[str] = []
        async for delta in self._generate_stream_raw(final_prompt, output_format):
            full.append(delta)
            yield delta  # push incremental tokens to the caller (e.g., WebSocket)

        # Let the event loop breathe (helps fairness/cancellation).
        await asyncio.sleep(0)

        # Persist the stitched reply.
        reply = "".join(full).strip()
        self.memory_manager.add_turn(uid, user_msg, reply)
        
        # Run summarization without blocking the stream caller.
        if self.memory_manager.should_summarize(uid):
            print("[Jarvis] Triggering non-blocking background summarization.")
            asyncio.create_task(self.memory_manager.summarize_short_term(uid, self))
        
        log.debug("[Jarvis] generate_stream() finished.")

    # =========================
    # Low-level raw calls (unchanged)
    # =========================
    def _generate_raw(self, prompt: str, output_format: str) -> str:
        """
        Synchronous POST to Ollama's /generate (non-streaming).
        Strips <think> blocks if present.
        """
        log.debug("[Jarvis] Sending raw prompt to Ollama")
        res = requests.post(self.API_URL, json={"model": self.model, "prompt": prompt, "stream": False})
        if res.status_code != 200:
            raise RuntimeError(f"Ollama call failed: {res.status_code} {res.text}")

        # Ollama returns a JSON object with a 'response' field.
        raw = res.json().get("response", "")

        # Remove speculative reasoning tags if your models emit them.
        cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        log.debug(f"[Jarvis] Cleaned Ollama response: {cleaned[:200]!r}")
        return cleaned

    async def _generate_stream_raw(
        self, prompt: str, output_format: str
    ) -> AsyncGenerator[str, None]:
        """
        Streaming POST to Ollama:
          - Sends 'stream': True and reads newline-delimited JSON chunks.
          - Yields 'response' deltas until 'done' is True.
        """
        log.debug("[Jarvis] Streaming generation started")

        # Minimal, broadly-compatible payload for Ollama streaming.
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": True,
            "options": {"temperature": 0.7}  # Keep it simple; add knobs if you need them.
        }

        buffer = ""
        try:
            # httpx stream yields bytes; we reassemble lines and parse as NDJSON.
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream("POST", self.API_URL, json=payload) as r:
                    r.raise_for_status()
                    async for chunk in r.aiter_bytes():
                        if not chunk:
                            continue
                        buffer += chunk.decode("utf-8", errors="ignore")

                        # Read complete lines from the buffer (NDJSON protocol).
                        while True:
                            nl = buffer.find("\n")
                            if nl == -1:
                                break
                            line = buffer[:nl].strip()
                            buffer = buffer[nl + 1:]

                            if not line:
                                continue
                            try:
                                obj = json.loads(line)
                            except Exception:
                                # Incomplete/garbled line; skip and continue aggregating.
                                continue

                            # Emit incremental token/string deltas if present.
                            delta = obj.get("response", "")
                            if delta:
                                yield delta

                            # Ollama sets 'done' when the stream ends.
                            if obj.get("done"):
                                return
        except Exception as e:
            log.error(f"[Jarvis] Error in streaming generation: {e}")
            raise
