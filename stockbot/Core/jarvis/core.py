import os
import json
import re
from datetime import datetime
import Core.config.shared_state as shared_state
from Core.ollama.RAG import rag
from Core.ollama.ollama_llm import generate_analysis

# Toggle debug mode
DEBUG_MODE = os.getenv("JARVIS_DEBUG", "false").lower() == "false"


# -- Core API Calls --
def call_jarvis(user_prompt: str, model: str = "deepseek-r1:14b") -> str:
    print("🧪 CALL_JARVIS received prompt:")
    print(user_prompt)

    result_gen = generate_analysis(
        prompt=user_prompt,
        model=model,
        output_format="text"
    )

    if isinstance(result_gen, str):
        cleaned = filter_prompt_text(result_gen)
        print("🧪 CALL_JARVIS final result (cleaned):")
        print(cleaned)
        return cleaned

    result = "".join(result_gen)
    cleaned = filter_prompt_text(result)

    print("🧪 CALL_JARVIS final result (cleaned):")
    print(cleaned)

    return cleaned


def filter_prompt_text(text: str) -> str:
    """
    Cleans and filters the response text by removing markdown, think blocks, and extra whitespace.
    """
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)  # remove full think blocks
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)        # remove markdown headers
    text = re.sub(r"^[-*+]\s+", "", text, flags=re.MULTILINE)         # remove bullet markers
    text = re.sub(r"[*_`~]", "", text)                                # remove markdown symbols
    text = re.sub(r"\s+", " ", text)                                  # collapse multiple spaces
    return text.strip()



