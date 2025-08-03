import requests
import re
from .agent import BaseAgent
from ingestion.provider_manager import ProviderManager
import logging

logging.basicConfig(level=logging.DEBUG)

class OllamaAgent(BaseAgent):
    API_URL = "http://localhost:11434/api/generate"

    def __init__(self, model_name: str):
        super().__init__(model=model_name)
        self.model = model_name

    def generate_with_provider(self, prompt: str, output_format: str = "text") -> str:
        logging.debug("========== JARVIS AGENT START ==========")
        logging.debug(f"[Jarvis] Prompt received: {prompt}")
        flags = self.detect_flags(prompt)
        logging.debug(f"[Jarvis] Flags detected: {flags}")

        # Try to get existing provider without credentials
        try:
            provider = ProviderManager.get_provider("schwab", {})  # broker hardcoded or set elsewhere
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
            logging.debug(f"[Jarvis] Injecting account data into prompt.")
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
            "json":     "Respond using valid JSON.",
            "text":     "Respond in plain text format, no markdown or JSON."
        }
        final_prompt = f"{prompt}\n\n{meta_prompt.get(output_format, '')}"

        res = requests.post(
            self.API_URL,
            json={"model": self.model, "prompt": final_prompt, "stream": False}
        )

        if res.status_code != 200:
            raise RuntimeError(f"Ollama call failed: {res.status_code} {res.text}")

        raw = res.json().get("response", "")
        cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        logging.debug(f"[Jarvis] Raw Ollama response: {raw}")
        logging.debug(f"[Jarvis] Cleaned Ollama response: {cleaned}")
        return cleaned
