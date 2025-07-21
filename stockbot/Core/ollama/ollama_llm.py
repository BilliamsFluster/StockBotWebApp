import requests

def generate_analysis(prompt: str, model: str = "deepseek-r1:14b", output_format: str = "markdown") -> str:
    meta_prompt = {
        "markdown": "Respond in markdown format.",
        "json": "Respond using valid JSON.",
        "text": "Respond in plain text format, no markdown or JSON."
    }

    final_prompt = f"{prompt}\n\n{meta_prompt.get(output_format, '')}"

    res = requests.post(
        "http://localhost:11434/api/generate",
        json={"model": model, "prompt": final_prompt, "stream": False}
    )
    
    if res.status_code != 200:
        raise RuntimeError(f"Ollama LLM call failed: {res.status_code} {res.text}")
    
    return res.json().get("response", "").strip()
