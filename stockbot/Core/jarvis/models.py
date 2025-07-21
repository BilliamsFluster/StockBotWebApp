import requests
import json

def generate_analysis(prompt: str,
                      model: str = "vanilj/palmyra-fin-70b-32k",
                      output_format: str = "markdown",
                      stream: bool = False):
    """
    If stream=False, returns the full response string.
    If stream=True, returns a generator yielding each token.
    """
    meta_prompt = {
        "markdown": "Respond in markdown format.",
        "json": "Respond using valid JSON.",
        "text": "Respond in plain text format, no markdown or JSON."
    }
    final_prompt = f"{prompt}\n\n{meta_prompt.get(output_format, '')}"
    res = requests.post(
        "http://localhost:11434/api/generate",
        json={"model": model, "prompt": final_prompt, "stream": stream},
        stream=stream
    )
    if res.status_code != 200:
        raise RuntimeError(f"Ollama LLM call failed: {res.status_code} {res.text}")

    if not stream:
        return res.json().get("response", "").strip()
    else:
        for line in res.iter_lines(decode_unicode=True):
            if not line:
                continue
            try:
                yield json.loads(line)["response"]
            except Exception:
                continue