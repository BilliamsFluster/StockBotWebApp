import json
import logging
import httpx
import requests
import re
from typing import Any, Dict, Optional, AsyncGenerator

from .agent import BaseAgent
from .memory_manager import MemoryManager
from ingestion.provider_manager import ProviderManager

logging.basicConfig(level=logging.DEBUG)
log = logging.getLogger("OllamaAgent")

class OllamaAgent(BaseAgent):
    API_URL = "http://localhost:11434/api/generate"

    def __init__(
        self,
        model_name: str,
        memory_manager: MemoryManager,
        provider_name: str = "schwab",
        provider_kwargs: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(model=model_name, memory_manager=memory_manager)
        self.model = model_name
        self.provider_name = provider_name
        self.provider_kwargs = provider_kwargs or {}
        self._user_id: str = "default"  # default bucket if you don't set one

    # ---- optional: set once per session/WS ----
    def set_user(self, user_id: str) -> "OllamaAgent":
        self._user_id = user_id
        return self

    # allow per-call inline tag: [[user: alice]]
    _USER_TAG_RE = re.compile(r"^\s*\[\[\s*user\s*:\s*([^\]]+?)\s*\]\]\s*", re.IGNORECASE)

    def _pick_user_id(self, prompt: str) -> str:
        m = self._USER_TAG_RE.match(prompt or "")
        return m.group(1).strip() if m else self._user_id

    def _strip_user_tag(self, prompt: str) -> str:
        return self._USER_TAG_RE.sub("", prompt, count=1)

    # ---- provider context ----
    def _resolve_flag_context(self, flags: Dict[str, bool]) -> Dict[str, Any]:
        ctx: Dict[str, Any] = {}
        try:
            provider = ProviderManager.get_provider(self.provider_name, self.provider_kwargs)
            log.debug(f"[Jarvis] Got provider from cache: {provider}")
        except Exception as e:
            logging.warning(f"[Jarvis] No provider found in cache: {e}")
            return ctx

        try:
            if flags.get("needs_summary"):
                ctx["summary"] = provider.get_account_summary()
            if flags.get("needs_positions"):
                ctx["positions"] = provider.get_positions()
            if flags.get("needs_transactions"):
                ctx["transactions"] = provider.get_transactions()
            if flags.get("needs_orders"):
                ctx["orders"] = provider.get_orders()
        except Exception as e:
            logging.error(f"[Jarvis] Error fetching account data: {e}")
        return ctx

    # ---- memory+tools prompt wrapper ----
    def _wrap_with_memory(self, user_id: str, user_msg: str, tool_context: Dict[str, Any], output_format: str) -> str:
        # 1) auto-promote prefs/facts
        self.memory_manager.auto_promote_preferences(user_id, user_msg)

        # 2) build memory context
        mem_ctx = self.memory_manager.format_context(user_id, query=user_msg, k_long=5, as_json=False)

        # 3) tool context string
        tc = f"Tool context:\n{tool_context}\n\n" if tool_context else ""

        # 4) meta formatting
        meta_prompt = {
            "markdown": "Respond in markdown format.",
            "json": "Respond using valid JSON.",
            "text": "Respond in plain text format, no markdown or JSON.",
        }

        return (
            "You are Jarvis, a precise but friendly finance assistant. "
            "Use the memory context and tool context if relevant.\n\n"
            f"{tc}{mem_ctx}\n\n"
            f"User: {user_msg}\nAssistant:\n\n{meta_prompt.get(output_format, '')}"
        )

    # =========================
    # KEEP YOUR PIPELINE: memory baked in
    # =========================
    def generate(self, prompt: str, output_format: str = "text") -> str:
        log.debug("[Jarvis] generate() called")

        # Which user?
        uid = self._pick_user_id(prompt)
        user_msg = self._strip_user_tag(prompt)

        # flags -> provider data
        flags = self.detect_flags(user_msg)
        tool_ctx = self._resolve_flag_context(flags)

        # wrap prompt with memory + tools
        final_prompt = self._wrap_with_memory(uid, user_msg, tool_ctx, output_format)

        # call Ollama (raw)
        reply = self._generate_raw(final_prompt, output_format)

        # persist memory
        self.memory_manager.add_turn(uid, user_msg, reply)
        if self.memory_manager.should_summarize(uid):
            self.memory_manager.summarize_short_term(uid, llm_summarize_fn=lambda p: self._generate_raw(p, "text"))

        return reply

    async def generate_stream(self, prompt: str, output_format: str = "text"):
        """
        Streaming path, same signature, now memory-aware.
        """
        log.debug("[Jarvis] generate_stream() called")

        uid = self._pick_user_id(prompt)
        user_msg = self._strip_user_tag(prompt)

        flags = self.detect_flags(user_msg)
        tool_ctx = self._resolve_flag_context(flags)

        final_prompt = self._wrap_with_memory(uid, user_msg, tool_ctx, output_format)

        # stream & accumulate to commit memory at the end
        full: list[str] = []
        async for delta in self._generate_stream_raw(final_prompt, output_format):
            full.append(delta)
            yield delta

        reply = "".join(full).strip()
        self.memory_manager.add_turn(uid, user_msg, reply)
        if self.memory_manager.should_summarize(uid):
            self.memory_manager.summarize_short_term(uid, llm_summarize_fn=lambda p: self._generate_raw(p, "text"))

    # =========================
    # Low-level raw calls (unchanged)
    # =========================
    def _generate_raw(self, prompt: str, output_format: str) -> str:
        log.debug("[Jarvis] Sending raw prompt to Ollama")
        res = requests.post(self.API_URL, json={"model": self.model, "prompt": prompt, "stream": False})
        if res.status_code != 200:
            raise RuntimeError(f"Ollama call failed: {res.status_code} {res.text}")
        raw = res.json().get("response", "")
        cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        log.debug(f"[Jarvis] Cleaned Ollama response: {cleaned[:200]!r}")
        return cleaned

    async def _generate_stream_raw(self, prompt: str, output_format: str = "text"):
        log.debug("[Jarvis] Streaming generation started")
        payload = {"model": self.model, "prompt": prompt, "stream": True, "options": {"num_predict": 512, "temperature": 0.7}}

        in_think = False
        def strip_think_streaming(delta: str):
            nonlocal in_think
            out = []
            i = 0
            while i < len(delta):
                if not in_think:
                    start = delta.find("<think>", i)
                    if start == -1:
                        out.append(delta[i:]); break
                    if start > i:
                        out.append(delta[i:start])
                    i = start + len("<think>")
                    in_think = True
                else:
                    end = delta.find("</think>", i)
                    if end == -1:
                        return "".join(out)
                    i = end + len("</think>")
                    in_think = False
            return "".join(out)

        buffer = ""
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", self.API_URL, json=payload) as r:
                r.raise_for_status()
                async for chunk in r.aiter_bytes():
                    if not chunk:
                        continue
                    buffer += chunk.decode("utf-8", errors="ignore")
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
                            continue
                        delta = obj.get("response", "")
                        if delta:
                            clean = strip_think_streaming(delta)
                            if clean:
                                yield clean
                        if obj.get("done"):
                            return
