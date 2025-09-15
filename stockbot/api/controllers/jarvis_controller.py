from __future__ import annotations

import json, re
import os
from typing import Any, Dict, List, Optional, Literal

from fastapi import Depends, WebSocket
from pydantic import BaseModel, Field

from jarvis.ws_handler import handle_voice_ws
from jarvis.jarvis_service import JarvisService
from jarvis.ollama_agent import OllamaAgent
from jarvis.memory_manager import MemoryManager
from jarvis.huggingFace_agent import HuggingFaceAgent

# -----------------------------
# Singletons (simple DI)
# -----------------------------
_mm = MemoryManager(storage_dir="data/memory")

'''hugging_face_agent = HuggingFaceAgent(
    model="Qwen/Qwen3-4B-Instruct-2507",
    use_local=True,
    memory_manager=_mm,
    local_cache_root=r"D:\huggingface\transformers",

    # latency tuning
    default_max_new_tokens=56,      # short voice replies
    prefill_token_budget=512,       # trim context aggressively
    temperature=0.6,
    top_p=0.9,
    repetition_penalty=1.05,

    # CPU-specific
    cpu_num_threads= max(1, (os.cpu_count() or 8) - 1),

    # keep failover OFF unless you provide a fallback model
    ttft_failover_seconds=None,
    fallback_model_name=None,
)'''

'''hugging_face_agent = HuggingFaceAgent(
    model="meta-llama/Meta-Llama-3-8B-Instruct",
    use_local=False,
    api_key= "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",
    memory_manager=_mm,
    default_max_new_tokens=64,
    temperature=0.6,
)'''

_agent = OllamaAgent("llama3:8b", _mm)
_service = JarvisService(llm_agent=_agent)

def get_jarvis_service() -> JarvisService:
    return _service

# -----------------------------
# Models
# -----------------------------
class ChatAskIn(BaseModel):
    prompt: str
    model: Optional[str] = "llama3:8b"
    format: Optional[str] = "markdown"
    use_memory: Optional[bool] = True

class ChatAskOut(BaseModel):
    response: str


# -----------------------------
# Chat handlers
# -----------------------------
def chat_ask(
    req: ChatAskIn,
    service: JarvisService = Depends(get_jarvis_service),
) -> ChatAskOut:
    """Simple text chat endpoint.

    If use_memory is False, we bypass memory context and persistence for this call.
    """
    # Optional per-call model override
    old_model = None
    if req.model and hasattr(service.agent, 'model'):
        try:
            old_model = getattr(service.agent, 'model', None)
            setattr(service.agent, 'model', req.model)
        except Exception:
            old_model = None

    try:
        if req.use_memory is False:
            # Build a tools-only context without memory and avoid persisting the turn.
            try:
                user_msg = req.prompt
                # BaseAgent API
                flags = service.agent.detect_flags(user_msg)
                # Agent-specific helpers (present in both OllamaAgent and HuggingFaceAgent)
                tool_ctx = service.agent._resolve_flag_context(flags)  # type: ignore[attr-defined]
                system_prompt = service.agent._get_system_prompt()      # type: ignore[attr-defined]

                context_str = ""
                if tool_ctx:
                    import json as _json
                    context_str = f"## Market Data\n{_json.dumps(tool_ctx, indent=2)}\n\n"

                meta_prompt = {
                    "markdown": "Respond in markdown format.",
                    "json": "Respond using valid JSON.",
                    "text": "Respond in plain text format, no markdown or JSON.",
                }
                final_prompt = (
                    f"{system_prompt}\n\n"
                    f"{context_str}"
                    f"## Your Turn\nUser: {user_msg}\nAssistant:\n\n{meta_prompt.get(req.format or 'text', '')}"
                )
                raw = service.agent._generate_raw(final_prompt, req.format or "text")  # type: ignore[attr-defined]
                return ChatAskOut(response=raw)
            except Exception:
                # Fallback: direct raw call without extra context
                raw = service.agent._generate_raw(req.prompt, req.format or "text")  # type: ignore[attr-defined]
                return ChatAskOut(response=raw)

        # Default path: full memory-enabled generation
        response = service.agent.generate(req.prompt, output_format=req.format)
        return ChatAskOut(response=response)
    finally:
        if old_model is not None and hasattr(service.agent, 'model'):
            try:
                setattr(service.agent, 'model', old_model)
            except Exception:
                pass

# DOM action models
class WaitFor(BaseModel):
    op: Literal["wait_for"]
    selector: str
    timeout_ms: Optional[int] = 5000

class Click(BaseModel):
    op: Literal["click"]
    selector: str

class Fill(BaseModel):
    op: Literal["fill"]
    selector: str
    value: str
    submit: Optional[bool] = False

class Type_(BaseModel):
    op: Literal["type"]
    selector: str
    text: str

class Press(BaseModel):
    op: Literal["press"]
    selector: str
    keys: str

class SetStyle(BaseModel):
    op: Literal["set_style"]
    selector: str
    style: Dict[str, str] = Field(default_factory=dict)

class SetText(BaseModel):
    op: Literal["set_text"]
    selector: str
    text: str

class Select(BaseModel):
    op: Literal["select"]
    selector: str
    value: str | List[str]

class Scroll(BaseModel):
    op: Literal["scroll"]
    to: Optional[Literal["top","bottom"]] = None
    y: Optional[int] = None

Action = WaitFor | Click | Fill | Type_ | Press | SetStyle | SetText | Select | Scroll

class EditPlanIn(BaseModel):
    goal: str
    # Optional: include a compact DOM context if you add that on the frontend
    context: Optional[Any] = None

class EditPlanOut(BaseModel):
    actions: List[Action] = Field(default_factory=list)

# -----------------------------
# WS controller
# -----------------------------
async def voice_ws(websocket: WebSocket, service: JarvisService = Depends(get_jarvis_service)):
    await handle_voice_ws(websocket, service)

# -----------------------------
# Edit planner
# -----------------------------
BROWSER_PLANNER_SYS = """You are a planner that converts a user goal about the CURRENT WEB PAGE into a compact JSON plan.

Output ONLY valid JSON:
{
  "actions":[
    {"op":"wait_for","selector":"css","timeout_ms":5000},
    {"op":"click","selector":"css"},
    {"op":"fill","selector":"css","value":"text","submit":false},
    {"op":"type","selector":"css","text":"text"},
    {"op":"press","selector":"css","keys":"Enter"},
    {"op":"set_style","selector":"css","style":{"outline":"3px solid magenta"}},
    {"op":"set_text","selector":"css","text":"Hello"},
    {"op":"select","selector":"css","value":"US"},
    {"op":"scroll","to":"bottom"}
  ]
}
Rules:
- Use the MINIMUM steps.
- Prefer stable selectors (ids, data attributes, labels/placeholder).
- If impossible or unsafe, return {"actions":[]}.
"""

def _first_json(s: str) -> Dict[str, Any]:
    try:
        return json.loads(s)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", s)
        return json.loads(m.group(0)) if m else {"actions": []}

def plan_edit(req: EditPlanIn, service: JarvisService = Depends(get_jarvis_service)) -> EditPlanOut:
    # Build an optional context block OUTSIDE the f-string expression (no backslashes in {})
    ctx_str = ""
    if req.context is not None:
        try:
            ctx_str = json.dumps(req.context, ensure_ascii=False, indent=2)
        except Exception:
            ctx_str = str(req.context)
    ctx_block = f"## Page context\n{ctx_str}\n\n" if ctx_str else ""

    prompt = (
        f"{BROWSER_PLANNER_SYS}\n\n"
        f"{ctx_block}"
        f"User goal: {req.goal}\n\n"
        f"Return JSON only."
    )

    raw = service.agent._generate_raw(prompt, output_format="json")
    plan = _first_json(raw)
    actions = plan.get("actions", []) or []
    return EditPlanOut(actions=actions)
