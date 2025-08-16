# stockbot/jarvis/huggingface_agent.py
import os
import time
import logging
import requests
import concurrent.futures
from typing import Optional, Dict, Any, List

import torch
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    BitsAndBytesConfig,
    pipeline as hf_pipeline,
)
try:
    from transformers.utils import is_flash_attn_2_available  # transformers>=4.40
except Exception:
    def is_flash_attn_2_available() -> bool:  # fallback
        return False

from .agent import BaseAgent
from providers.provider_manager import ProviderManager

log = logging.getLogger("HuggingFaceAgent")
if not log.handlers:
    logging.basicConfig(level=logging.DEBUG)


# ---------- Local snapshot resolver ----------
def _resolve_local_snapshot(model_id: str, cache_root: Optional[str] = None) -> str:
    """
    Resolve the latest snapshot folder for a repo id like 'org/name'.
    Looks in common Hugging Face cache locations + an optional override.
    """
    if "/" not in model_id:
        raise ValueError(f"Expected 'org/name', got: {model_id}")
    org, name = model_id.split("/", 1)

    roots: List[str] = []
    if cache_root:
        roots.append(cache_root)

    # Env vars
    hf_home = os.getenv("HF_HOME")
    if hf_home:
        roots += [hf_home, os.path.join(hf_home, "hub")]
    t_cache = os.getenv("TRANSFORMERS_CACHE")
    if t_cache:
        roots.append(t_cache)

    # Common defaults (Windows + POSIX)
    roots += [
        os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub"),
        os.path.join(os.path.expanduser("~"), ".cache", "huggingface"),
        r"D:\huggingface\transformers",
        r"D:\huggingface\hub",
        r"C:\huggingface\transformers",
        r"C:\huggingface\hub",
    ]

    candidates = []
    for root in roots:
        if not root:
            continue
        candidates.append(os.path.join(root, f"models--{org}--{name}", "snapshots"))
        candidates.append(os.path.join(root, "hub", f"models--{org}--{name}", "snapshots"))

    snapshots_dir = next((p for p in candidates if os.path.isdir(p)), None)
    if not snapshots_dir:
        checked = "\n  - ".join(candidates)
        raise FileNotFoundError(
            f"No local snapshot found for {model_id}. Looked in:\n  - {checked}"
        )

    hashes = [
        os.path.join(snapshots_dir, d)
        for d in os.listdir(snapshots_dir)
        if os.path.isdir(os.path.join(snapshots_dir, d))
    ]
    if not hashes:
        raise FileNotFoundError(f"No snapshot folders inside: {snapshots_dir}")

    latest = max(hashes, key=os.path.getmtime)
    return latest


# ---------- Speedy local pipeline builder ----------
def _build_fast_pipe(model_path: str, trust_remote_code: bool = True):
    """
    Build a fast text-generation pipeline:
      - 4-bit quantization if CUDA + bitsandbytes available
      - FlashAttention 2 if available
      - return_full_text=False
      - Warmup 1 token
    """
    torch.set_float32_matmul_precision("high")
    use_cuda = torch.cuda.is_available()

    # 4-bit if we can
    bnb_cfg = None
    if use_cuda:
        try:
            import bitsandbytes  # noqa: F401
            bnb_cfg = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16)
            log.debug("[HF] bitsandbytes detected: using 4-bit quantization.")
        except Exception:
            log.debug("[HF] bitsandbytes not available: loading without 4-bit.")

    tok = AutoTokenizer.from_pretrained(model_path, trust_remote_code=trust_remote_code)

    attn_impl = None
    if use_cuda and is_flash_attn_2_available():
        attn_impl = "flash_attention_2"
        log.debug("[HF] FlashAttention 2 available: enabling if supported by model.")

    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        trust_remote_code=trust_remote_code,
        device_map="auto" if use_cuda else None,
        quantization_config=bnb_cfg,
        attn_implementation=attn_impl,  # silently ignored if unsupported
        low_cpu_mem_usage=True,
    )

    # Ensure pad token is sane
    if tok.pad_token_id is None and tok.eos_token_id is not None:
        tok.pad_token_id = tok.eos_token_id

    pipe = hf_pipeline(
        "text-generation",
        model=model,
        tokenizer=tok,
        return_full_text=False,
    )

    # Warmup (loads weights/kernels so first real call is faster)
    t0 = time.monotonic()
    try:
        _ = pipe("ping", max_new_tokens=1, do_sample=False)
    except Exception as e:
        log.debug(f"[HF] warmup failed (non-fatal): {e}")
    log.debug(f"[HF] warmup done in {time.monotonic()-t0:.2f}s; flash_attn={attn_impl is not None}")

    log.debug(f"[HF] CUDA available: {use_cuda}")
    log.debug(f"[HF] model dtype: {getattr(model, 'dtype', None)}")
    return pipe


# ---------- helpers ----------
def _format_prompt(pipe, prompt: str) -> str:
    tok = getattr(pipe, "tokenizer", None)
    if tok and hasattr(tok, "apply_chat_template") and getattr(tok, "chat_template", None):
        messages = [
            {"role": "system", "content": "You are a concise financial assistant."},
            {"role": "user", "content": prompt},
        ]
        return tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    return prompt


def _extract_text(gen_output: Any) -> str:
    if isinstance(gen_output, list) and gen_output:
        d = gen_output[0]
        if isinstance(d, dict):
            if "generated_text" in d and isinstance(d["generated_text"], str):
                return d["generated_text"]
            if "text" in d and isinstance(d["text"], str):
                return d["text"]
    return ""


# ---------- Agent ----------
class HuggingFaceAgent(BaseAgent):
    """
    Mirrors OllamaAgent:
      - generate_with_provider(): injects Schwab data when flags demand it
      - local snapshot auto-resolve OR hosted Inference API
      - robust generation (chat template, return_full_text=False, fallback)
      - watchdog timeout so your API never "hangs"
    """

    def __init__(
        self,
        model: str,                           # "org/name" or a local folder path
        api_key: Optional[str] = None,
        use_local: bool = False,
        trust_remote_code: bool = True,
        local_cache_root: Optional[str] = None,
        gen_timeout: float = 15.0,           # seconds watchdog
        default_max_new_tokens: int = 96,    # voice UX-friendly
    ):
        super().__init__(model)
        self.use_local = use_local
        self.api_key = api_key or os.getenv("HF_API_KEY")
        self.trust_remote_code = trust_remote_code
        self.local_cache_root = local_cache_root
        self.gen_timeout = gen_timeout
        self.default_max_new_tokens = default_max_new_tokens

        if self.use_local:
            if os.path.isdir(model):
                model_path = model
            else:
                model_path = _resolve_local_snapshot(model, cache_root=self.local_cache_root)

            log.debug(f"🔄 Loading local HuggingFace model from: {model_path}")
            self.pipe = _build_fast_pipe(model_path, trust_remote_code=self.trust_remote_code)
        else:
            if not self.api_key:
                raise ValueError("HuggingFace API key is required for hosted mode.")
            self.api_url = f"https://api-inference.huggingface.co/models/{model}"
            self.headers = {"Authorization": f"Bearer {self.api_key}"}

    # ---------- Public API ----------
    def generate(self, prompt: str, output_format: str = "text") -> str:
        log.debug("[HF] generate() called")
        return self.generate_with_provider(prompt, output_format)

    def generate_with_provider(self, prompt: str, output_format: str = "text") -> str:
        log.debug("========== HF AGENT START ==========")
        log.debug(f"[HF] Prompt received: {prompt}")
        flags = self.detect_flags(prompt)
        log.debug(f"[HF] Flags detected: {flags}")

        # Provider injection (mirrors OllamaAgent)
        try:
            provider = ProviderManager.get_provider("schwab", {})
            log.debug(f"[HF] Got provider from cache: {provider}")
        except Exception as e:
            log.warning(f"[HF] No provider found in cache: {e}")
            return self._generate_raw(prompt, output_format)

        account_data: Dict[str, Any] = {}
        try:
            if flags.get("needs_summary"):
                log.debug("[HF] Fetching account summary")
                account_data["summary"] = provider.get_account_summary()
            if flags.get("needs_positions"):
                log.debug("[HF] Fetching positions")
                account_data["positions"] = provider.get_positions()
            if flags.get("needs_transactions"):
                log.debug("[HF] Fetching transactions")
                account_data["transactions"] = provider.get_transactions()
        except Exception as e:
            log.error(f"[HF] Error fetching account data: {e}")

        if account_data:
            log.debug("[HF] Injecting account data into prompt.")
            prompt = f"Here is your latest account data:\n{account_data}\n\n{prompt}"
        else:
            log.warning("[HF] No account data fetched.")

        log.debug("========== HF AGENT END ==========")
        return self._generate_raw(prompt, output_format)

    # ---------- Internals ----------
    def _gen_with_timeout(self, final_prompt: str, gen_kwargs: Dict[str, Any]):
        # Run the pipeline call with a watchdog so your API never blocks indefinitely
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(self.pipe, final_prompt, **gen_kwargs)
            try:
                return fut.result(timeout=self.gen_timeout)
            except concurrent.futures.TimeoutError:
                log.warning("[HF] generation timed out; returning fallback")
                return None

    def _generate_raw(self, prompt: str, output_format: str) -> str:
        meta_prompt = {
            "markdown": "Respond in markdown format.",
            "json":     "Respond using valid JSON.",
            "text":     "Respond in plain text format, no markdown or JSON.",
        }
        user_prompt = f"{prompt}\n\n{meta_prompt.get(output_format, '')}".strip()

        if self.use_local:
            final_prompt = _format_prompt(self.pipe, user_prompt)
            tok = self.pipe.tokenizer
            eos_id = getattr(tok, "eos_token_id", None)
            pad_id = getattr(tok, "pad_token_id", None) or eos_id

            gen_kwargs = dict(
                max_new_tokens=self.default_max_new_tokens,
                do_sample=True,
                temperature=0.7,
                top_p=0.9,
                return_full_text=False,  # avoid echo-only
                eos_token_id=eos_id,
                pad_token_id=pad_id,
            )

            log.debug("[HF] starting generation (watchdog %.0fs)", self.gen_timeout)
            t0 = time.monotonic()
            res = self._gen_with_timeout(final_prompt, gen_kwargs)
            if res is None:
                return "Give me a second to load up — ask that again in a moment."

            log.debug(f"[HF] generation finished in {time.monotonic()-t0:.2f}s")
            raw = _extract_text(res).strip()
            log.debug(f"[HF] Raw local output: {raw[:200]!r}")

            # Deterministic fallback if sampling returned empty
            if not raw:
                fb = gen_kwargs.copy()
                fb.update({"do_sample": False, "temperature": None, "top_p": None})
                res2 = self._gen_with_timeout(final_prompt, fb)
                if res2 is not None:
                    raw = _extract_text(res2).strip()
                    log.debug(f"[HF] Fallback output: {raw[:200]!r}")

            # If pipeline echoed the prompt despite return_full_text=False
            if raw and final_prompt in raw and len(raw) > len(final_prompt):
                candidate = raw.replace(final_prompt, "", 1).strip()
                if candidate:
                    raw = candidate

            return raw or "[No content generated]"

        # Hosted inference API
        payload = {
            "inputs": user_prompt,
            "parameters": {
                "max_new_tokens": self.default_max_new_tokens,
                "do_sample": True,
                "temperature": 0.7,
                "top_p": 0.9,
                "return_full_text": False,
            },
        }
        res = requests.post(self.api_url, headers=self.headers, json=payload, timeout=90)
        if res.status_code != 200:
            raise RuntimeError(f"HuggingFace API call failed: {res.status_code} {res.text}")
        data = res.json()

        if isinstance(data, list) and data and "generated_text" in data[0]:
            raw = data[0]["generated_text"].strip()
        elif isinstance(data, list) and data and "text" in data[0]:
            raw = data[0]["text"].strip()
        else:
            raw = (str(data) or "").strip()

        log.debug(f"[HF] Raw hosted output: {raw[:200]!r}")
        return raw or "[No content generated]"

    async def generate_stream(self, prompt: str, output_format: str = "text"):
        log.debug("[Jarvis] Streaming generation started")
        for partial_response in self._stream_raw(prompt, output_format):
            yield partial_response
