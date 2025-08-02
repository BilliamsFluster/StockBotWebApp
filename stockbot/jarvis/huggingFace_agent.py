import os
import requests
from transformers import pipeline
from typing import Optional
from agent import BaseAgent  

class HuggingFaceAgent(BaseAgent):
    def __init__(
        self,
        model: str,
        api_key: Optional[str] = None,
        use_local: bool = False
    ):
        super().__init__(model)
        self.use_local = use_local
        self.api_key = api_key or os.getenv("HF_API_KEY")

        if self.use_local:
            print(f"🔄 Loading local HuggingFace model: {model}")
            self.pipe = pipeline("text-generation", model=model)
        else:
            if not self.api_key:
                raise ValueError("HuggingFace API key is required for hosted mode.")
            self.api_url = f"https://api-inference.huggingface.co/models/{model}"
            self.headers = {"Authorization": f"Bearer {self.api_key}"}

    def generate(self, prompt: str, output_format: str = "text") -> str:
        # Add optional format hints (same style as your OllamaAgent)
        meta_prompt = {
            "markdown": "Respond in markdown format.",
            "json": "Respond using valid JSON.",
            "text": "Respond in plain text format, no markdown or JSON."
        }
        final_prompt = f"{prompt}\n\n{meta_prompt.get(output_format, '')}"

        if self.use_local:
            # Local transformers pipeline
            outputs = self.pipe(final_prompt, max_new_tokens=256, do_sample=True)
            return outputs[0]["generated_text"].strip()
        else:
            # Hosted API
            payload = {"inputs": final_prompt}
            res = requests.post(self.api_url, headers=self.headers, json=payload)

            if res.status_code != 200:
                raise RuntimeError(f"HuggingFace API call failed: {res.status_code} {res.text}")

            data = res.json()
            if isinstance(data, list) and "generated_text" in data[0]:
                return data[0]["generated_text"].strip()

            return str(data).strip()
