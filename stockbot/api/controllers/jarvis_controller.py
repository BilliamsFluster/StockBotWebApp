from __future__ import annotations

import json, re
from typing import Any, Dict, List, Optional, Literal

from fastapi import Depends, WebSocket
from pydantic import BaseModel, Field

from jarvis.ws_handler import handle_voice_ws
from jarvis.jarvis_service import JarvisService
from jarvis.ollama_agent import OllamaAgent
from jarvis.memory_manager import MemoryManager

# -----------------------------
# Singletons (simple DI)
# -----------------------------
_mm = MemoryManager(storage_dir="data/memory")
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

class ChatAskOut(BaseModel):
    response: str

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
