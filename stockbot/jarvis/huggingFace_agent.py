from __future__ import annotations

import os
import re
import json
import time
import logging
import asyncio
import requests
import concurrent.futures
import threading
from typing import Optional, Dict, Any, AsyncGenerator, List

import torch
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    BitsAndBytesConfig,
    pipeline as hf_pipeline,
    TextIteratorStreamer,
    StoppingCriteria,
    StoppingCriteriaList,
)

# -----------------------------------------
# Logging
# -----------------------------------------
log = logging.getLogger("HuggingFaceAgent")
if not log.handlers:
    logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(levelname)s - %(message)s")


# -----------------------------------------
# Optional CUDA attention detection
# -----------------------------------------
try:
    from transformers.utils import is_flash_attn_2_available  # transformers>=4.40
except Exception:
    def is_flash_attn_2_available() -> bool:
        return False


# -----------------------------------------
# Project deps
# -----------------------------------------
from .agent import BaseAgent
from .memory_manager import MemoryManager
from providers.provider_manager import ProviderManager
from utils.web_search import fetch_financial_snippets


# -----------------------------------------
# Environment knobs (CPU path)
# -----------------------------------------
def _prep_cpu_threads(user_threads: Optional[int] = None):
    """Tune CPU threading for faster generation on MKL/OpenMP backends."""
    if torch.cuda.is_available():
        return  # CUDA path ignores these
    try:
        hw = os.cpu_count() or 4
        threads = max(1, min(hw, user_threads if user_threads else hw - 1))
        interop = 2
        # Env vars (some backends read only at import time, but still set)
        os.environ.setdefault("OMP_NUM_THREADS", str(threads))
        os.environ.setdefault("MKL_NUM_THREADS", str(threads))
        # Torch runtime knobs
        torch.set_num_threads(threads)
        torch.set_num_interop_threads(interop)
        log.info(f"[CPU] threads={threads}, interop={interop}")
    except Exception as e:
        log.debug(f"[CPU] thread tuning skipped: {e}")


# -----------------------------------------
# Local snapshot resolver
# -----------------------------------------
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

    hf_home = os.getenv("HF_HOME")
    if hf_home:
        roots += [hf_home, os.path.join(hf_home, "hub")]
    t_cache = os.getenv("TRANSFORMERS_CACHE")
    if t_cache:
        roots.append(t_cache)

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


# -----------------------------------------
# Fast local pipeline builder
# -----------------------------------------
def _build_fast_pipe(
    model_path: str,
    *,
    trust_remote_code: bool = True,
    quantization: str = "auto",   # "auto"|"bnb4"|"none"
    attn_preference: str = "auto" # "auto"|"flashattn"|"sdpa"|"eager"
):
    """
    Build a fast text-generation pipeline with:
      - bitsandbytes 4-bit quantization if CUDA available
      - FlashAttention 2 if available (else SDPA on CUDA)
      - TF32 & cuDNN autotune for throughput on GPU
      - CPU threading tuned for best MKL/OMP utilization
      - warmup for first-token latency
    """
    # CPU tuning
    _prep_cpu_threads()

    # Fast math on CUDA
    if torch.cuda.is_available():
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        torch.backends.cudnn.benchmark = True
        torch.set_float32_matmul_precision("high")

    use_cuda = torch.cuda.is_available()

    # Decide quantization
    bnb_cfg = None
    enable_bnb = (quantization in ("auto", "bnb4")) and use_cuda
    if enable_bnb:
        try:
            import bitsandbytes  # noqa: F401
            bnb_cfg = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.bfloat16,
            )
            log.debug("[LOAD] bitsandbytes detected: 4-bit quantization enabled.")
        except Exception as e:
            if quantization == "bnb4":
                log.warning(f"[LOAD] Requested 4-bit but bitsandbytes not usable: {e}")
            else:
                log.debug("[LOAD] bitsandbytes not available: loading without 4-bit.")
            bnb_cfg = None

    # Tokenizer
    tok = AutoTokenizer.from_pretrained(model_path, trust_remote_code=trust_remote_code)

    # Attention impl
    attn_impl = None
    if use_cuda:
        if attn_preference in ("auto", "flashattn") and is_flash_attn_2_available():
            attn_impl = "flash_attention_2"
            log.debug("[LOAD] Using FlashAttention 2.")
        if attn_impl is None and attn_preference in ("auto", "sdpa"):
            attn_impl = "sdpa"  # PyTorch SDPA
    if not use_cuda and attn_preference == "eager":
        attn_impl = None  # explicit eager
    elif not use_cuda:
        # SDPA on CPU can be slower on some boxes; eager is often fine
        attn_impl = None

    # Model
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        trust_remote_code=trust_remote_code,
        device_map="auto" if use_cuda else None,
        quantization_config=bnb_cfg,
        attn_implementation=attn_impl,
        low_cpu_mem_usage=True,
        torch_dtype=torch.bfloat16 if use_cuda else torch.float32,
    )

    # Diagnostics
    dm = getattr(model, "hf_device_map", None)
    is_4bit = getattr(model, "is_loaded_in_4bit", False)
    dtype = getattr(model, "dtype", None)
    log.info(f"[LOAD] device_map={dm}")
    log.info(f"[LOAD] is_loaded_in_4bit={is_4bit}, dtype={dtype}, attn={attn_impl}")
    if not torch.cuda.is_available():
        log.warning("[LOAD] CUDA=False → TTFT will be CPU-bound. Prefer GGUF/llama.cpp for best CPU latency.")

    # Good defaults
    try:
        model.generation_config.use_cache = True
    except Exception:
        pass

    if tok.pad_token_id is None and tok.eos_token_id is not None:
        tok.pad_token_id = tok.eos_token_id

    pipe = hf_pipeline(
        "text-generation",
        model=model,
        tokenizer=tok,
        return_full_text=False,
    )

    # Warmup reduces first real call latency
    try:
        _ = pipe("ping", max_new_tokens=1, do_sample=False)
    except Exception as e:
        log.debug(f"[WARMUP] non-fatal: {e}")

    return pipe


def _format_prompt(pipe, prompt: str) -> str:
    tok = getattr(pipe, "tokenizer", None)
    if tok and hasattr(tok, "apply_chat_template") and getattr(tok, "chat_template", None):
        messages = [
            {"role": "system", "content": "You are Jarvis, a precise but friendly finance assistant. Keep replies concise."},
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


# ---------- helpers for streaming ----------
class _CancelFlag(StoppingCriteria):
    def __init__(self):
        super().__init__()
        self._stop = False
    def set(self, v: bool = True):
        self._stop = v
    def __call__(self, input_ids, scores, **kwargs):
        return self._stop

async def _aiter_queue(q: asyncio.Queue):
    while True:
        item = await q.get()
        if item is None:
            break
        yield item


class HuggingFaceAgent(BaseAgent):
    """
    Drop-in HF agent with:
      - CPU/GPU tuned loading
      - prompt pre-trimming to reduce TTFT
      - true token streaming
      - detailed logs
      - (failover off by default)
    """

    API_BASE = "https://api-inference.huggingface.co/models"
    _system_prompt_cache: Optional[str] = None
    _USER_TAG_RE = re.compile(r"^\s*\[\[\s*user\s*:\s*([^\]]+?)\s*\]\]\s*", re.IGNORECASE)

    def __init__(
        self,
        model_name: Optional[str] = None,
        memory_manager: MemoryManager = None,
        provider_name: str = "schwab",
        provider_kwargs: Optional[Dict[str, Any]] = None,
        *,
        use_local: bool = True,
        api_key: Optional[str] = None,
        local_cache_root: Optional[str] = None,
        trust_remote_code: bool = True,
        # decoding defaults
        default_max_new_tokens: int = 64,   # voice-sized
        temperature: float = 0.6,
        top_p: float = 0.9,
        repetition_penalty: float = 1.05,
        # performance tuning
        gen_timeout: float = 45.0,
        prefill_token_budget: int = 512,    # trim context aggressively
        quantization: str = "auto",         # gpu: try 4-bit
        attn_preference: str = "auto",
        cpu_num_threads: Optional[int] = None,
        # optional TTFT failover (disabled unless both set)
        ttft_failover_seconds: Optional[float] = None,
        fallback_model_name: Optional[str] = None,
        **kwargs,
    ):
        # allow both model_name=... and model=...
        model_from_alias = kwargs.pop("model", None)
        model_to_use = model_name or model_from_alias
        if not model_to_use:
            raise ValueError("Pass a model via model='org/name' or model_name='org/name'.")

        super().__init__(model=model_to_use, memory_manager=memory_manager)
        self.model = model_to_use
        self.provider_name = provider_name
        self.provider_kwargs = provider_kwargs or {}
        self._user_id: str = "default"

        self.use_local = use_local
        self.api_key = api_key or os.getenv("HF_API_KEY")
        self.local_cache_root = local_cache_root
        self.trust_remote_code = trust_remote_code

        self.default_max_new_tokens = default_max_new_tokens
        self.temperature = temperature
        self.top_p = top_p
        self.repetition_penalty = repetition_penalty

        self.gen_timeout = gen_timeout
        self.prefill_token_budget = prefill_token_budget
        self.quantization = quantization
        self.attn_preference = attn_preference
        self.cpu_num_threads = cpu_num_threads

        # Failover only triggers if BOTH are set
        self.ttft_failover_seconds = ttft_failover_seconds
        self.fallback_model_name = fallback_model_name

        # Force CPU thread plan early if requested
        if cpu_num_threads is not None and not torch.cuda.is_available():
            _prep_cpu_threads(cpu_num_threads)

        if self.use_local:
            if os.path.isdir(self.model):
                model_path = self.model
            else:
                model_path = _resolve_local_snapshot(self.model, cache_root=self.local_cache_root)
            log.info(f"[LOAD] Local model path: {model_path}")
            self.pipe = _build_fast_pipe(
                model_path,
                trust_remote_code=self.trust_remote_code,
                quantization=self.quantization,
                attn_preference=self.attn_preference,
            )
        else:
            if not self.api_key:
                raise ValueError("HuggingFace API key is required for hosted mode.")
            self.api_url = f"{self.API_BASE}/{self.model}"
            self.headers = {"Authorization": f"Bearer {self.api_key}"}
            log.info(f"[LOAD] Hosted API endpoint set: {self.api_url}")

    # ---------- system prompt ----------
    def _get_system_prompt(self) -> str:
        if HuggingFaceAgent._system_prompt_cache is None:
            try:
                current_dir = os.path.dirname(__file__)
                prompt_path = os.path.join(current_dir, "prompts", "system_prompt.txt")
                with open(prompt_path, "r", encoding="utf-8") as f:
                    HuggingFaceAgent._system_prompt_cache = f.read().strip()
                log.debug("[PROMPT] System prompt loaded from file.")
            except Exception as e:
                log.error(f"[PROMPT] Failed to load system prompt: {e}")
                HuggingFaceAgent._system_prompt_cache = "You are Jarvis, a precise but friendly finance assistant."
        return HuggingFaceAgent._system_prompt_cache

    # ---------- user pin / inline tag ----------
    def set_user(self, user_id: str) -> "HuggingFaceAgent":
        self._user_id = user_id
        return self

    def _pick_user_id(self, prompt: str) -> str:
        m = self._USER_TAG_RE.match(prompt or "")
        return m.group(1).strip() if m else self._user_id

    def _strip_user_tag(self, prompt: str) -> str:
        return self._USER_TAG_RE.sub("", prompt, count=1)

    # ---------- provider + web search ----------
    def _resolve_flag_context(self, flags: Dict[str, bool]) -> Dict[str, Any]:
        ctx: Dict[str, Any] = {}

        try:
            provider = ProviderManager.get_provider(self.provider_name, self.provider_kwargs)
            log.debug(f"[PROVIDER] Acquired: {provider}")

            if flags.get("needs_summary"):
                ctx["summary"] = provider.get_account_summary()
            if flags.get("needs_positions"):
                ctx["positions"] = provider.get_positions()
            if flags.get("needs_transactions"):
                ctx["transactions"] = provider.get_transactions()
            if flags.get("needs_orders"):
                ctx["orders"] = provider.get_orders()
        except Exception as e:
            log.debug(f"[PROVIDER] Unavailable: {e} (continuing without provider context)")

        if flags.get("needs_web_search"):
            try:
                ctx["web_search_results"] = fetch_financial_snippets()
            except Exception as e:
                ctx["web_search_results"] = {"error": f"Web search failed: {e}"}

        return ctx

    # ---------- memory + tools wrapper ----------
    def _wrap_with_memory(
        self,
        user_id: str,
        user_msg: str,
        tool_context: Dict[str, Any],
        output_format: str,
    ) -> str:
        # update preferences
        self.memory_manager.auto_promote_preferences(user_id, user_msg)

        # retrieve relevant memory
        mem_ctx = self.memory_manager.format_context(
            user_id, query=user_msg, k_long=5, as_json=False
        )

        # combine
        context_str = ""
        if tool_context:
            tool_info = json.dumps(tool_context, indent=2)
            context_str += f"## Market Data\n{tool_info}\n\n"
        if mem_ctx.strip():
            context_str += f"## Log of Past Conversation\n{mem_ctx}\n\n"

        meta_prompt = {
            "markdown": "Respond in markdown format.",
            "json": "Respond using valid JSON.",
            "text": "Respond in plain text format, no markdown or JSON.",
        }

        system_prompt = self._get_system_prompt()

        full = (
            f"{system_prompt}\n\n"
            f"{context_str}"
            f"## Your Turn\nUser: {user_msg}\nAssistant:\n\n{meta_prompt.get(output_format, '')}"
        )
        return full

    # ---------- prefill trimming ----------
    def _truncate_prefill(self, text: str) -> str:
        if not self.use_local:
            return text
        tok = getattr(self.pipe, "tokenizer", None)
        if not tok:
            return text
        ids = tok(text).input_ids
        if len(ids) <= self.prefill_token_budget:
            return text
        head_keep = int(self.prefill_token_budget * 0.35)
        tail_keep = self.prefill_token_budget - head_keep
        head = tok.decode(ids[:head_keep], skip_special_tokens=True)
        tail = tok.decode(ids[-tail_keep:], skip_special_tokens=True)
        log.debug(f"[TRIM] Prefill tokens={len(ids)} > budget={self.prefill_token_budget}. Keeping {head_keep}+{tail_keep}.")
        return head + "\n...\n" + tail

    # ---------- public API ----------
    def generate(self, prompt: str, output_format: str = "text") -> str:
        log.debug("[API] generate() called")
        uid = self._pick_user_id(prompt)
        user_msg = self._strip_user_tag(prompt)

        flags = self.detect_flags(user_msg)
        tool_ctx = self._resolve_flag_context(flags)
        final_prompt = self._wrap_with_memory(uid, user_msg, tool_ctx, output_format)
        final_prompt = self._truncate_prefill(final_prompt)

        reply = self._generate_raw(final_prompt, output_format)
        self.memory_manager.add_turn(uid, user_msg, reply)

        if self.memory_manager.should_summarize(uid):
            self.memory_manager.summarize_short_term(
                uid,
                llm_summarize_fn=lambda p: self._generate_raw(p, "text")
            )
        return reply

    async def generate_stream(self, prompt: str, output_format: str = "text") -> AsyncGenerator[str, None]:
        log.debug("[API] generate_stream() called")
        uid = self._pick_user_id(prompt)
        user_msg = self._strip_user_tag(prompt)

        flags = self.detect_flags(user_msg)
        tool_ctx = self._resolve_flag_context(flags)
        final_prompt = self._wrap_with_memory(uid, user_msg, tool_ctx, output_format)
        final_prompt = self._truncate_prefill(final_prompt)

        # Failover only if both set
        if self.use_local and self.ttft_failover_seconds and self.fallback_model_name:
            async for delta in self._generate_stream_with_failover(final_prompt, output_format):
                yield delta
            return

        # normal streaming
        full: List[str] = []
        try:
            async for delta in self._generate_stream_raw(final_prompt, output_format):
                full.append(delta)
                yield delta
        finally:
            reply = "".join(full).strip()
            if reply:
                self.memory_manager.add_turn(uid, user_msg, reply)
                if self.memory_manager.should_summarize(uid):
                    asyncio.create_task(
                        self.memory_manager.summarize_short_term(
                            uid, llm_summarize_fn=lambda p: self._generate_raw(p, "text")
                        )
                    )

    # ---------- raw generation (non-stream) ----------
    def _cleanup(self, text: str) -> str:
        return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    def _gen_with_timeout_local(self, prompt: str, gen_kwargs: Dict[str, Any]):
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(self.pipe, prompt, **gen_kwargs)
            try:
                return fut.result(timeout=self.gen_timeout)
            except concurrent.futures.TimeoutError:
                log.warning("[GEN] local generation timed out.")
                return None

    def _generate_raw(self, prompt: str, output_format: str) -> str:
        if self.use_local:
            final_prompt = _format_prompt(self.pipe, prompt)
            tok = self.pipe.tokenizer
            eos_id = getattr(tok, "eos_token_id", None)
            pad_id = getattr(tok, "pad_token_id", None) or eos_id

            gen_kwargs = dict(
                max_new_tokens=self.default_max_new_tokens,
                do_sample=True,
                temperature=self.temperature,
                top_p=self.top_p,
                repetition_penalty=self.repetition_penalty,
                return_full_text=False,
                eos_token_id=eos_id,
                pad_token_id=pad_id,
            )

            res = self._gen_with_timeout_local(final_prompt, gen_kwargs)
            raw = _extract_text(res).strip() if res is not None else ""

            if not raw:
                fb = gen_kwargs.copy()
                fb.update({"do_sample": False, "temperature": None, "top_p": None})
                res2 = self._gen_with_timeout_local(final_prompt, fb)
                raw = _extract_text(res2).strip() if res2 is not None else ""

            return self._cleanup(raw or "[No content generated]")

        # Hosted Inference API (non-stream)
        payload = {
            "inputs": prompt,
            "parameters": {
                "max_new_tokens": self.default_max_new_tokens,
                "do_sample": True,
                "temperature": self.temperature,
                "top_p": self.top_p,
                "repetition_penalty": self.repetition_penalty,
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

        return self._cleanup(raw or "[No content generated]")

    # ---------- true streaming ----------
    async def _generate_stream_raw(self, prompt: str, output_format: str) -> AsyncGenerator[str, None]:
        """
        True streaming for local models (TextIteratorStreamer) with TTFT/TPS logs.
        Hosted mode falls back to one-shot then chunking.
        """
        if self.use_local:
            tok = self.pipe.tokenizer
            model = self.pipe.model
            device = getattr(model, "device", None)

            final_prompt = _format_prompt(self.pipe, prompt)
            inputs = tok(final_prompt, return_tensors="pt")
            if device is not None:
                inputs = {k: v.to(device) for k, v in inputs.items()}

            streamer = TextIteratorStreamer(tok, skip_special_tokens=True, skip_prompt=True)
            cancel_flag = _CancelFlag()
            stops = StoppingCriteriaList([cancel_flag])

            gen_kwargs = dict(
                **inputs,
                max_new_tokens=self.default_max_new_tokens,
                do_sample=True,
                temperature=self.temperature,
                top_p=self.top_p,
                repetition_penalty=self.repetition_penalty,
                eos_token_id=getattr(tok, "eos_token_id", None),
                pad_token_id=getattr(tok, "pad_token_id", None) or getattr(tok, "eos_token_id", None),
                streamer=streamer,
                stopping_criteria=stops,
                use_cache=True,
            )

            loop = asyncio.get_event_loop()
            out_q: asyncio.Queue[str] = asyncio.Queue()

            t0 = time.perf_counter()
            first_token_time = None
            token_count = 0

            def _run_generate():
                try:
                    model.generate(**gen_kwargs)
                except Exception as e:
                    asyncio.run_coroutine_threadsafe(out_q.put(f"[GEN_ERROR]{e}"), loop)
                finally:
                    asyncio.run_coroutine_threadsafe(out_q.put(None), loop)

            def _drain_streamer():
                nonlocal first_token_time, token_count
                try:
                    for piece in streamer:
                        if first_token_time is None:
                            first_token_time = time.perf_counter()
                        token_count += len(tok(piece).input_ids)
                        asyncio.run_coroutine_threadsafe(out_q.put(piece), loop)
                finally:
                    asyncio.run_coroutine_threadsafe(out_q.put(None), loop)

            gen_thread = threading.Thread(target=_run_generate, daemon=True)
            read_thread = threading.Thread(target=_drain_streamer, daemon=True)
            gen_thread.start()
            read_thread.start()

            try:
                async for piece in _aiter_queue(out_q):
                    if piece.startswith("[GEN_ERROR]"):
                        raise RuntimeError(piece[len("[GEN_ERROR]"):])
                    yield piece
            except asyncio.CancelledError:
                cancel_flag.set(True)
            finally:
                cancel_flag.set(True)
                t_end = time.perf_counter()
                if first_token_time:
                    ttft = first_token_time - t0
                    dur = max(t_end - first_token_time, 1e-6)
                    tps = token_count / dur
                    log.warning(f"[STREAM] TTFT={ttft:.2f}s, tokens={token_count}, TPS={tps:.1f}")
            return

        # Hosted fallback: one shot then chunk
        loop = asyncio.get_event_loop()
        def _blocking_call() -> str:
            return self._generate_raw(prompt, output_format)
        text = await loop.run_in_executor(None, _blocking_call)
        if not text:
            return
        words, buf = text.split(), []
        for w in words:
            buf.append(w)
            if len(buf) >= 20:
                yield " ".join(buf) + " "
                buf.clear()
                await asyncio.sleep(0)
        if buf:
            yield " ".join(buf)

    # ---------- streaming with TTFT failover (optional) ----------
    async def _generate_stream_with_failover(self, prompt: str, output_format: str) -> AsyncGenerator[str, None]:
        """
        Try primary model; if TTFT exceeds threshold, switch to fallback model.
        Only called when both self.ttft_failover_seconds and fallback_model_name are set.
        """
        assert self.use_local and self.ttft_failover_seconds and self.fallback_model_name

        primary_started = asyncio.Event()
        first_token_emitted = asyncio.Event()
        buffer_q: asyncio.Queue[str] = asyncio.Queue()

        async def _primary():
            tok = self.pipe.tokenizer
            model = self.pipe.model
            device = getattr(model, "device", None)

            final_prompt = _format_prompt(self.pipe, prompt)
            inputs = tok(final_prompt, return_tensors="pt")
            if device is not None:
                inputs = {k: v.to(device) for k, v in inputs.items()}

            streamer = TextIteratorStreamer(tok, skip_special_tokens=True, skip_prompt=True)
            cancel_flag = _CancelFlag()
            stops = StoppingCriteriaList([cancel_flag])

            gen_kwargs = dict(
                **inputs,
                max_new_tokens=self.default_max_new_tokens,
                do_sample=True,
                temperature=self.temperature,
                top_p=self.top_p,
                repetition_penalty=self.repetition_penalty,
                eos_token_id=getattr(tok, "eos_token_id", None),
                pad_token_id=getattr(tok, "pad_token_id", None) or getattr(tok, "eos_token_id", None),
                streamer=streamer,
                stopping_criteria=stops,
                use_cache=True,
            )

            loop = asyncio.get_event_loop()
            primary_started.set()

            def _run():
                try:
                    model.generate(**gen_kwargs)
                except Exception as e:
                    asyncio.run_coroutine_threadsafe(buffer_q.put(f"[GEN_ERROR]{e}"), loop)
                finally:
                    asyncio.run_coroutine_threadsafe(buffer_q.put(None), loop)

            def _drain():
                try:
                    for piece in streamer:
                        if not first_token_emitted.is_set():
                            first_token_emitted.set()
                        asyncio.run_coroutine_threadsafe(buffer_q.put(piece), loop)
                finally:
                    asyncio.run_coroutine_threadsafe(buffer_q.put(None), loop)

            threading.Thread(target=_run, daemon=True).start()
            threading.Thread(target=_drain, daemon=True).start()

        # Kick primary
        asyncio.create_task(_primary())

        # Wait up to threshold for first token
        try:
            await asyncio.wait_for(first_token_emitted.wait(), timeout=self.ttft_failover_seconds)
            # Primary produced — stream its output
            async for piece in _aiter_queue(buffer_q):
                if piece and piece.startswith("[GEN_ERROR]"):
                    raise RuntimeError(piece[len("[GEN_ERROR]"):])
                if piece is None:
                    break
                yield piece
            return
        except asyncio.TimeoutError:
            log.warning(f"[FAILOVER] TTFT>{self.ttft_failover_seconds}s — switching to fallback: {self.fallback_model_name}")

        # Build fallback pipeline
        fb_model_id = self.fallback_model_name
        if os.path.isdir(fb_model_id):
            fb_path = fb_model_id
        else:
            fb_path = _resolve_local_snapshot(fb_model_id, cache_root=self.local_cache_root)

        fb_pipe = _build_fast_pipe(
            fb_path,
            trust_remote_code=self.trust_remote_code,
            quantization=self.quantization,
            attn_preference=self.attn_preference,
        )

        tok = fb_pipe.tokenizer
        model = fb_pipe.model
        device = getattr(model, "device", None)

        final_prompt = _format_prompt(fb_pipe, prompt)
        inputs = tok(final_prompt, return_tensors="pt")
        if device is not None:
            inputs = {k: v.to(device) for k, v in inputs.items()}

        streamer = TextIteratorStreamer(tok, skip_special_tokens=True, skip_prompt=True)
        cancel_flag = _CancelFlag()
        stops = StoppingCriteriaList([cancel_flag])

        gen_kwargs = dict(
            **inputs,
            max_new_tokens=self.default_max_new_tokens,
            do_sample=True,
            temperature=self.temperature,
            top_p=self.top_p,
            repetition_penalty=self.repetition_penalty,
            eos_token_id=getattr(tok, "eos_token_id", None),
            pad_token_id=getattr(tok, "pad_token_id", None) or getattr(tok, "eos_token_id", None),
            streamer=streamer,
            stopping_criteria=stops,
            use_cache=True,
        )

        loop = asyncio.get_event_loop()
        out_q: asyncio.Queue[str] = asyncio.Queue()

        def _run():
            try:
                model.generate(**gen_kwargs)
            except Exception as e:
                asyncio.run_coroutine_threadsafe(out_q.put(f"[GEN_ERROR]{e}"), loop)
            finally:
                asyncio.run_coroutine_threadsafe(out_q.put(None), loop)

        def _drain():
            try:
                for piece in streamer:
                    asyncio.run_coroutine_threadsafe(out_q.put(piece), loop)
            finally:
                asyncio.run_coroutine_threadsafe(out_q.put(None), loop)

        threading.Thread(target=_run, daemon=True).start()
        threading.Thread(target=_drain, daemon=True).start()

        async for piece in _aiter_queue(out_q):
            if piece and piece.startswith("[GEN_ERROR]"):
                raise RuntimeError(piece[len("[GEN_ERROR]"):])
            if piece is None:
                break
            yield piece
