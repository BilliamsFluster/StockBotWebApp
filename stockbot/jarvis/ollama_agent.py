import requests
from agent import BaseAgent

class OllamaAgent(BaseAgent):
    API_URL = "http://localhost:11434/api/generate"

    def generate(self, prompt: str, output_format: str = "text") -> str:
        meta_prompt = {
            "markdown": "Respond in markdown format.",
            "json": "Respond using valid JSON.",
            "text": "Respond in plain text format, no markdown or JSON."
        }
        final_prompt = f"{prompt}\n\n{meta_prompt.get(output_format, '')}"

        res = requests.post(
            self.API_URL,
            json={"model": self.model, "prompt": final_prompt, "stream": False}
        )

        if res.status_code != 200:
            raise RuntimeError(f"Ollama call failed: {res.status_code} {res.text}")

        return res.json().get("response", "").strip()
