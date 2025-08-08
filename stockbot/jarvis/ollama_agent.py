import json
import logging
import httpx
import requests
import re
from .agent import BaseAgent
from ingestion.provider_manager import ProviderManager

logging.basicConfig(level=logging.DEBUG)


class OllamaAgent(BaseAgent):
    API_URL = "http://localhost:11434/api/generate"

    def __init__(self, model_name: str):
        super().__init__(model=model_name)
        self.model = model_name

    async def generate_stream(self, prompt: str, output_format: str = "text"):
        """
        Async token stream from Ollama (NDJSON). Yields small string deltas.
        Also filters out <think>...</think> in a stream-safe way.
        """
        logging.debug("[Jarvis] Streaming generation started")

        meta_prompt = {
            "markdown": "Respond in markdown format.",
            "json": "Respond using valid JSON.",
            "text": "Respond in plain text format, no markdown or JSON.",
        }
        final_prompt = f"{prompt}\n\n{meta_prompt.get(output_format, '')}"

        payload = {
            "model": self.model,
            "prompt": final_prompt,
            "stream": True,
            # encourage longer generations so streaming is noticeable
            "options": {"num_predict": 512, "temperature": 0.7},
        }

        # state for streaming <think> removal
        in_think = False

        def strip_think_streaming(delta: str):
            nonlocal in_think
            out = []
            i = 0
            while i < len(delta):
                if not in_think:
                    start = delta.find("<think>", i)
                    if start == -1:
                        out.append(delta[i:])
                        break
                    # emit text before <think>
                    if start > i:
                        out.append(delta[i:start])
                    i = start + len("<think>")
                    in_think = True
                else:
                    end = delta.find("</think>", i)
                    if end == -1:
                        # still inside think; consume all and wait for close
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

                    # Drain complete NDJSON lines
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
                            # strip streamed <think> chunks
                            clean = strip_think_streaming(delta)
                            if clean:
                                logging.debug(f"[Jarvis] Δ{len(clean)}: {clean!r}")
                                yield clean

                        if obj.get("done"):
                            logging.debug("[Jarvis] stream done")
                            return

    def generate_with_provider(self, prompt: str, output_format: str = "text") -> str:
        logging.debug("========== JARVIS AGENT START ==========")
        logging.debug(f"[Jarvis] Prompt received: {prompt}")
        flags = self.detect_flags(prompt)
        logging.debug(f"[Jarvis] Flags detected: {flags}")

        try:
            provider = ProviderManager.get_provider("schwab", {})
            logging.debug(f"[Jarvis] Got provider from cache: {provider}")
        except Exception as e:
            logging.warning(f"[Jarvis] No provider found in cache: {e}")
            return self._generate_raw(prompt, output_format)

        account_data = {}
        try:
            if flags.get("needs_summary"):
                logging.debug("[Jarvis] Fetching account summary")
                account_data["summary"] = provider.get_account_summary()
            if flags.get("needs_positions"):
                logging.debug("[Jarvis] Fetching positions")
                account_data["positions"] = provider.get_positions()
            if flags.get("needs_transactions"):
                logging.debug("[Jarvis] Fetching transactions")
                account_data["transactions"] = provider.get_transactions()
        except Exception as e:
            logging.error(f"[Jarvis] Error fetching account data: {e}")

        if account_data:
            logging.debug("[Jarvis] Injecting account data into prompt.")
            prompt = f"Here is your latest account data:\n{account_data}\n\n{prompt}"
        else:
            logging.warning("[Jarvis] No account data fetched.")

        logging.debug("========== JARVIS AGENT END ==========")
        return self._generate_raw(prompt, output_format)

    def generate(self, prompt: str, output_format: str = "text") -> str:
        logging.debug("[Jarvis] generate() called")
        return self.generate_with_provider(prompt, output_format)

    def _generate_raw(self, prompt: str, output_format: str) -> str:
        logging.debug("[Jarvis] Sending raw prompt to Ollama (no account context)")
        meta_prompt = {
            "markdown": "Respond in markdown format.",
            "json": "Respond using valid JSON.",
            "text": "Respond in plain text format, no markdown or JSON.",
        }
        final_prompt = f"{prompt}\n\n{meta_prompt.get(output_format, '')}"

        res = requests.post(
            self.API_URL, json={"model": self.model, "prompt": final_prompt, "stream": False}
        )
        if res.status_code != 200:
            raise RuntimeError(f"Ollama call failed: {res.status_code} {res.text}")

        raw = res.json().get("response", "")
        cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        logging.debug(f"[Jarvis] Raw Ollama response: {raw}")
        logging.debug(f"[Jarvis] Cleaned Ollama response: {cleaned}")
        return cleaned
