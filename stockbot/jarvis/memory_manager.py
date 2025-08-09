from __future__ import annotations
import json, os, time, threading, math, re
from dataclasses import dataclass, asdict
from typing import List, Tuple, Dict, Union, Optional
from enum import Enum
from collections import Counter
from pathlib import Path
import logging

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("MemoryManager")

class Role(str, Enum):
    USER = "USER"
    JARVIS = "JARVIS"

@dataclass
class LTItem:
    key: str
    value: str
    ts: float
    priority: float = 0.0
    tags: List[str] = None

def _find_stockbot_root(start: Path) -> Path:
    # Find <project-root>/stockbot regardless of run dir
    for p in [start, *start.parents]:
        if p.name == "stockbot" and (p / "__init__.py").exists():
            return p
    for p in start.parents:
        cand = p / "stockbot"
        if cand.is_dir():
            return cand
    return start.parents[2] if len(start.parents) >= 3 else start.parent

class MemoryManager:
    """
    Short-term: capped rolling turns (in-memory + persisted)
    Long-term: LTItem list with priority; JSON per-user under <project-root>/stockbot/data/memory
    Retrieval: simple TF/cosine over (key + value + tags), boosted by priority
    """
    def __init__(self, storage_dir: Optional[str] = None, max_turns: int = 6):
        stockbot_root = _find_stockbot_root(Path(__file__).resolve())
        if storage_dir is None:
            resolved = stockbot_root / "data" / "memory"
        else:
            resolved = (stockbot_root / storage_dir) if not os.path.isabs(storage_dir) else Path(storage_dir)
        self.storage_dir = str(resolved.resolve())
        self.max_turns = max_turns
        os.makedirs(self.storage_dir, exist_ok=True)
        self._lock = threading.Lock()
        self._mem: Dict[str, Dict[str, Union[List[Tuple[str, str]], List[LTItem]]]] = {}
        log.debug(f"[Memory] storage_dir = {self.storage_dir}")

    # ---------- persistence ----------
    def _path(self, user_id: str) -> str:
        safe = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", user_id)
        return os.path.join(self.storage_dir, f"{safe}.json")

    def _load_user(self, user_id: str):
        log.debug(f"[Memory] load user_id={user_id}")
        if user_id in self._mem:
            return
        path = self._path(user_id)
        if os.path.exists(path):
            log.debug(f"[Memory] found file: {path}")
            with open(path, "r", encoding="utf-8") as f:
                raw = json.load(f)
        else:
            log.debug(f"[Memory] no file, initializing new user state at {path}")
            raw = {"short_term": [], "long_term": []}
        lt = [LTItem(**it) if isinstance(it, dict) else LTItem(key=it[0], value=it[1], ts=time.time())
              for it in raw.get("long_term", [])]
        self._mem[user_id] = {
            "short_term": [(Role(r), m) for r, m in raw.get("short_term", [])],
            "long_term": lt
        }

    def _save_user(self, user_id: str):
        path = self._path(user_id)
        data = self._mem[user_id]
        serial = {
            "short_term": [(r.value if isinstance(r, Role) else r, m) for r, m in data["short_term"]],
            "long_term": [asdict(it) for it in data["long_term"]],
        }
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(serial, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
        log.debug(f"[Memory] save -> {path}")

    # ---------- short-term ----------
    def add_turn(self, user_id: str, user_msg: str, jarvis_reply: str):
        log.debug(f"[Memory] add_turn user_id={user_id}")
        with self._lock:
            self._load_user(user_id)
            st: List[Tuple[Role, str]] = self._mem[user_id]["short_term"]  # type: ignore
            st.extend([(Role.USER, user_msg), (Role.JARVIS, jarvis_reply)])
            limit = self.max_turns * 2
            if len(st) > limit:
                del st[: len(st) - limit]
            self._save_user(user_id)

    def get_short_term(self, user_id: str) -> List[Tuple[Role, str]]:
        with self._lock:
            self._load_user(user_id)
            return list(self._mem[user_id]["short_term"])  # type: ignore

    # ---------- long-term ----------
    def add_to_long_term(self, user_id: str, key: str, value: str, priority: float = 0.0, tags: Optional[List[str]] = None):
        log.debug(f"[Memory] add_to_long_term user_id={user_id} key={key!r}")
        with self._lock:
            self._load_user(user_id)
            lt: List[LTItem] = self._mem[user_id]["long_term"]  # type: ignore
            lt.append(LTItem(key=key, value=value, ts=time.time(), priority=priority, tags=tags or []))
            self._save_user(user_id)

    def get_long_term(self, user_id: str) -> List[LTItem]:
        with self._lock:
            self._load_user(user_id)
            return list(self._mem[user_id]["long_term"])  # type: ignore

    # ---------- prioritization / extraction ----------
    _PREF_PATTERNS = [
        (r"\bcall me (\w[\w\s\-]+)\b", "preferred_name", 1.0, ["preference"]),
        (r"\bmy name is ([\w\s\-]+)\b", "preferred_name", 0.9, ["identity"]),
        (r"\bi (?:prefer|like)\s+([^\.]+)", "preference", 0.8, ["preference"]),
        (r"\bi use ([A-Za-z0-9\-\_ ]+)", "tooling", 0.7, ["tooling"]),
        (r"\btime(?:zone)? is ([A-Za-z_\/\-+0-9]+)", "timezone", 1.0, ["preference"]),
        (r"\bremember (?:that )?([^\.!?]+)", "remember", 1.0, ["pinned"]),
        (r"\bfrom now on,?\s*([^\.!?]+)", "rule", 1.0, ["rule","pinned"]),
    ]

    def auto_promote_preferences(self, user_id: str, user_msg: str):
        lowered = user_msg.strip().lower()
        for pat, key, base_score, tags in self._PREF_PATTERNS:
            m = re.search(pat, lowered)
            if m:
                val = m.group(1).strip()
                boost = 0.5 if any(w in lowered for w in ("always", "every time", "from now on", "remember")) else 0.0
                self.add_to_long_term(user_id, key=key, value=val, priority=base_score + boost, tags=tags)

    # ---------- retrieval ----------
    _STOP = set("a an the and or but if then with without into onto to for of in on at from by you your my me our we is are was were be being been".split())

    @staticmethod
    def _tok(s: str) -> List[str]:
        return [t for t in re.findall(r"[a-z0-9]+", s.lower()) if t not in MemoryManager._STOP]

    @staticmethod
    def _bow(s: str) -> Counter:
        return Counter(MemoryManager._tok(s))

    @staticmethod
    def _cosine(c1: Counter, c2: Counter) -> float:
        if not c1 or not c2:
            return 0.0
        common = set(c1) & set(c2)
        dot = sum(c1[t] * c2[t] for t in common)
        n1 = math.sqrt(sum(v*v for v in c1.values()))
        n2 = math.sqrt(sum(v*v for v in c2.values()))
        return 0.0 if n1 == 0 or n2 == 0 else dot / (n1 * n2)

    def retrieve_relevant(self, user_id: str, query: str, k: int = 5) -> List[LTItem]:
        log.debug(f"[Memory] retrieve_relevant user_id={user_id} q={query!r} k={k}")
        q = self._bow(query)
        items = self.get_long_term(user_id)
        scored = []
        for it in items:
            bow = self._bow(f"{it.key} {it.value} {' '.join(it.tags or [])}")
            s = self._cosine(q, bow) + 0.15 * it.priority
            scored.append((s, it))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [it for s, it in scored[:k] if s > 0.0]

    # ---------- formatting / context ----------
    def format_context(self, user_id: str, query: str, k_long: int = 5, as_json: bool = False):
        st = self.get_short_term(user_id)
        lt = self.retrieve_relevant(user_id, query=query, k=k_long)
        if as_json:
            return {
                "short_term": [{"role": r.value.lower(), "content": m} for r, m in st],
                "long_term": [asdict(x) for x in lt],
            }
        st_str = "\n".join(("User: " + m) if r == Role.USER else ("Jarvis: " + m) for r, m in st)
        lt_str = "\n".join(f"- {x.key}: {x.value}" for x in lt)
        return f"Relevant long-term memory:\n{lt_str or '(none)'}\n\nRecent conversation:\n{st_str or '(none)'}"

    # ---------- summarization ----------
    def should_summarize(self, user_id: str, max_pairs: int = 6) -> bool:
        st = self.get_short_term(user_id)
        return len(st) // 2 >= max_pairs

    def summarize_short_term(self, user_id: str, llm_summarize_fn) -> Optional[str]:
        log.debug(f"[Memory] summarize_short_term user_id={user_id}")
        st = self.get_short_term(user_id)
        if not st:
            return None
        convo = "\n".join(("User: " + m) if r == Role.USER else ("Jarvis: " + m) for r, m in st)
        prompt = (
            "Summarize this dialogue into concise bullet points focusing on:\n"
            "- user preferences & constraints\n- persistent facts (names, timezone, tools)\n"
            "- open tasks/promises\n- 3–5 sentence recap\n\nReturn plain text.\n\nDIALOGUE:\n" + convo
        )
        summary = llm_summarize_fn(prompt)
        if summary:
            self.add_to_long_term(user_id, key="conversation_summary", value=summary, priority=0.6, tags=["summary"])
        return summary

    # ---------- maintenance ----------
    def reset_memory(self, user_id: str):
        with self._lock:
            self._mem[user_id] = {"short_term": [], "long_term": []}
            self._save_user(user_id)

    def get_raw_memory(self, user_id: str):
        with self._lock:
            self._load_user(user_id)
            st = self._mem[user_id]["short_term"]  # type: ignore
            lt = self._mem[user_id]["long_term"]  # type: ignore
            return {"short_term": list(st), "long_term": [asdict(x) for x in lt]}
