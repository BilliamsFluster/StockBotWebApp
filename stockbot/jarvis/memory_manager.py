from __future__ import annotations
import json, os, time, threading, math, re
from dataclasses import dataclass, asdict
from typing import List, Tuple, Dict, Union, Optional, Callable
from enum import Enum
from collections import Counter
from pathlib import Path
import logging

# Configure basic logging for debugging and tracing
logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("MemoryManager")

class Role(str, Enum):
    """Speaker role inside short-term memory."""
    USER = "USER"
    JARVIS = "JARVIS"

@dataclass
class LTItem:
    """
    Long-term memory item.
    - key: identifier/category (e.g., 'timezone', 'preferred_name')
    - value: stored content
    - ts: unix timestamp when last updated
    - priority: manual/auto weight (0..1+) that boosts retrieval
    - tags: freeform labels for retrieval/organization
    """
    key: str
    value: str
    ts: float
    priority: float = 0.0
    tags: List[str] = None

def _find_stockbot_root(start: Path) -> Path:
    """
    Locate the project root folder 'stockbot' robustly from any run directory.
    Falls back to an ancestor path if exact layout isn't detected.
    """
    # Case 1: walk up parents looking for a python package named 'stockbot'
    for p in [start, *start.parents]:
        if p.name == "stockbot" and (p / "__init__.py").exists():
            return p
    # Case 2: walk parents and return a plain 'stockbot' directory if present
    for p in start.parents:
        cand = p / "stockbot"
        if cand.is_dir():
            return cand
    # Case 3: conservative fallback a couple levels up
    return start.parents[2] if len(start.parents) >= 3 else start.parent

class MemoryManager:
    """
    Memory subsystem with two layers:

    Short-term (ST):
      - Rolling conversation buffer ([(Role, text), ...]).
      - Pruned by an approximate token budget (word count proxy).
      - Persisted per user.

    Long-term (LT):
      - List[LTItem] with priority and time-decay.
      - Stored per user in JSON at <project>/stockbot/data/memory.

    Retrieval:
      - Simple TF/Cosine over (key + value + tags).
      - Score boosted by item.priority and decayed by age via exponential decay.

    Concurrency:
      - Thread-safe via a coarse-grained threading.Lock around mutations/loads.
    """
    def __init__(self, storage_dir: Optional[str] = None, max_st_tokens: int = 1500, lt_decay_halflife_days: float = 90.0):
        # Resolve a stable on-disk location for memory files
        stockbot_root = _find_stockbot_root(Path(__file__).resolve())
        if storage_dir is None:
            resolved = stockbot_root / "data" / "memory"
        else:
            resolved = (stockbot_root / storage_dir) if not os.path.isabs(storage_dir) else Path(storage_dir)

        self.storage_dir = str(resolved.resolve())
        self.max_st_tokens = max_st_tokens  # soft cap for ST token budget
        self.lt_decay_halflife_days = lt_decay_halflife_days  # half-life for LT decay
        os.makedirs(self.storage_dir, exist_ok=True)

        # In-memory cache: { user_id: {"short_term": List[(Role,str)], "long_term": List[LTItem]} }
        self._lock = threading.Lock()
        self._mem: Dict[str, Dict[str, Union[List[Tuple[str, str]], List[LTItem]]]] = {}
        log.debug(f"[Memory] storage_dir = {self.storage_dir}")

    # ---------- persistence ----------
    def _path(self, user_id: str) -> str:
        """Sanitize a user_id for filename usage and return full path to JSON store."""
        safe = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", user_id)
        return os.path.join(self.storage_dir, f"{safe}.json")

    def _load_user(self, user_id: str):
        """
        Load user state from disk into memory cache (idempotent).
        Initializes an empty structure if file does not exist.
        """
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

        # Normalize LT: accept both legacy tuple form and dict form
        lt = [LTItem(**it) if isinstance(it, dict) else LTItem(key=it[0], value=it[1], ts=time.time())
              for it in raw.get("long_term", [])]

        # Materialize into cache with Role enum normalization for ST
        self._mem[user_id] = {
            "short_term": [(Role(r), m) for r, m in raw.get("short_term", [])],
            "long_term": lt
        }

    def _save_user(self, user_id: str):
        """Persist the current in-memory state for a user to disk atomically."""
        path = self._path(user_id)
        data = self._mem[user_id]

        # Convert enums and dataclasses to JSON-serializable primitives
        serial = {
            "short_term": [(r.value if isinstance(r, Role) else r, m) for r, m in data["short_term"]],
            "long_term": [asdict(it) for it in data["long_term"]],
        }

        # Atomic write via .tmp swap to avoid partial writes
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(serial, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
        log.debug(f"[Memory] save -> {path}")

    # ---------- token counting ----------
    @staticmethod
    def _count_tokens(text: str) -> int:
        """
        Quick-and-dirty token proxy (word count).
        Replace with a real tokenizer if you need accuracy per model.
        """
        return len(text.split())

    # ---------- short-term ----------
    def add_turn(self, user_id: str, user_msg: str, jarvis_reply: str):
        """
        Append a (USER, msg) + (JARVIS, reply) turn and prune by token budget.
        """
        log.debug(f"[Memory] add_turn user_id={user_id}")
        with self._lock:
            self._load_user(user_id)
            st: List[Tuple[Role, str]] = self._mem[user_id]["short_term"]  # type: ignore
            st.extend([(Role.USER, user_msg), (Role.JARVIS, jarvis_reply)])

            # Compute approximate total tokens and prune oldest turns if needed
            total_tokens = sum(self._count_tokens(msg) for _, msg in st)
            while total_tokens > self.max_st_tokens and len(st) > 2:
                # Remove the oldest turn (user + assistant)
                removed_user = st.pop(0)
                removed_jarvis = st.pop(0)
                total_tokens -= self._count_tokens(removed_user[1]) + self._count_tokens(removed_jarvis[1])

            self._save_user(user_id)

    def get_short_term(self, user_id: str) -> List[Tuple[Role, str]]:
        """Return a copy of the short-term conversation for the user."""
        with self._lock:
            self._load_user(user_id)
            return list(self._mem[user_id]["short_term"])  # type: ignore

    # ---------- long-term ----------
    def add_to_long_term(self, user_id: str, key: str, value: str, priority: float = 0.0, tags: Optional[List[str]] = None):
        """
        Upsert behavior for LT items keyed by `key`.
        - If key exists: update value, refresh timestamp, max() priority, merge tags.
        - Else: append a new LTItem.
        """
        log.debug(f"[Memory] add_to_long_term user_id={user_id} key={key!r}")
        with self._lock:
            self._load_user(user_id)
            lt: List[LTItem] = self._mem[user_id]["long_term"]  # type: ignore

            # Update existing item by key
            for item in lt:
                if item.key == key:
                    log.debug(f"Updating existing long-term memory item with key '{key}'")
                    item.value = value
                    item.ts = time.time()  # refresh last-updated time
                    item.priority = max(item.priority, priority)  # keep highest priority
                    item.tags = sorted(list(set((item.tags or []) + (tags or []))))  # merge unique tags
                    self._save_user(user_id)
                    return

            # Insert new item
            lt.append(LTItem(key=key, value=value, ts=time.time(), priority=priority, tags=tags or []))
            self._save_user(user_id)

    def get_long_term(self, user_id: str) -> List[LTItem]:
        """Return a copy of the user's long-term items."""
        with self._lock:
            self._load_user(user_id)
            return list(self._mem[user_id]["long_term"])  # type: ignore

    # ---------- prioritization / extraction ----------
    # Simple regex cues that auto-promote preferences/identity/rules into LT
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
        """
        Scan the raw user message with regex patterns and store detected
        preferences/rules/identity as long-term items with sensible priorities.
        """
        lowered = user_msg.strip().lower()
        for pat, key, base_score, tags in self._PREF_PATTERNS:
            m = re.search(pat, lowered)
            if m:
                val = m.group(1).strip()
                # Extra boost if phrasing implies permanence
                boost = 0.5 if any(w in lowered for w in ("always", "every time", "from now on", "remember")) else 0.0
                self.add_to_long_term(user_id, key=key, value=val, priority=base_score + boost, tags=tags)

    # ---------- retrieval ----------
    # Stopword list for bag-of-words tokenization
    _STOP = set("a an the and or but if then with without into onto to for of in on at from by you your my me our we is are was were be being been".split())

    @staticmethod
    def _tok(s: str) -> List[str]:
        """Lowercase alnum tokenization with stopword removal."""
        return [t for t in re.findall(r"[a-z0-9]+", s.lower()) if t not in MemoryManager._STOP]

    @staticmethod
    def _bow(s: str) -> Counter:
        """Bag-of-words frequency vector."""
        return Counter(MemoryManager._tok(s))

    @staticmethod
    def _cosine(c1: Counter, c2: Counter) -> float:
        """Cosine similarity between two sparse frequency vectors."""
        if not c1 or not c2:
            return 0.0
        common = set(c1) & set(c2)
        dot = sum(c1[t] * c2[t] for t in common)
        n1 = math.sqrt(sum(v*v for v in c1.values()))
        n2 = math.sqrt(sum(v*v for v in c2.values()))
        return 0.0 if n1 == 0 or n2 == 0 else dot / (n1 * n2)

    def retrieve_relevant(self, user_id: str, query: str, k: int = 5) -> List[LTItem]:
        """
        Rank LT items against a query using:
          score = (cosine(bow(query), bow(item)) + 0.15*priority) * exp(-λ*age)
        where λ = ln(2)/half_life_seconds for exponential time decay.
        Returns top-k items with positive score.
        """
        log.debug(f"[Memory] retrieve_relevant user_id={user_id} q={query!r} k={k}")
        q = self._bow(query)
        items = self.get_long_term(user_id)
        scored = []
        now = time.time()

        # Convert half-life (days) to decay rate λ (per second)
        decay_lambda = math.log(2) / (self.lt_decay_halflife_days * 86400) if self.lt_decay_halflife_days > 0 else 0

        for it in items:
            # Build a retrievable string from key/value/tags
            bow = self._bow(f"{it.key} {it.value} {' '.join(it.tags or [])}")
            relevance = self._cosine(q, bow)

            # Age in seconds since last update
            age_seconds = now - it.ts
            decay_factor = math.exp(-decay_lambda * age_seconds) if decay_lambda > 0 else 1.0

            # Final ranking score
            score = (relevance + 0.15 * it.priority) * decay_factor
            scored.append((score, it))

        # Sort by score (desc) and return the top k with score>0
        scored.sort(key=lambda x: x[0], reverse=True)
        return [it for s, it in scored[:k] if s > 0.0]

    # ---------- formatting / context ----------
    def format_context(self, user_id: str, query: str, k_long: int = 5, as_json: bool = False):
        """
        Produce a model-ready context block consisting of:
          - relevant long-term items (scored for `query`)
          - recent short-term dialogue
        Optionally return as JSON for programmatic usage.
        """
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
    def should_summarize(self, user_id: str) -> bool:
        """
        Heuristic trigger for summarization: when ST token use exceeds 90% of budget.
        """
        st = self.get_short_term(user_id)
        current_tokens = sum(self._count_tokens(msg) for _, msg in st)
        return current_tokens > self.max_st_tokens * 0.9

    def summarize_short_term(self, user_id: str, llm_summarize_fn: Callable[[str], str]) -> Optional[str]:
        """
        Summarize the short-term conversation into a compact, useful LT item.
        - Uses an external callable `llm_summarize_fn` to produce the summary.
        - Stores the result as LT ('conversation_summary').
        - Clears ST afterward to free budget.
        """
        log.debug(f"[Memory] summarize_short_term user_id={user_id}")
        st = self.get_short_term(user_id)
        if not st:
            return None

        # Build a simple dialogue transcript for the summarizer
        convo = "\n".join(("User: " + m) if r == Role.USER else ("Jarvis: " + m) for r, m in st)
        prompt = (
            "Summarize this dialogue into concise bullet points focusing on:\n"
            "- user preferences & constraints\n- persistent facts (names, timezone, tools)\n"
            "- open tasks/promises\n- 3–5 sentence recap\n\nReturn plain text.\n\nDIALOGUE:\n" + convo
        )

        summary = llm_summarize_fn(prompt)
        if summary:
            # Persist summary as LT and clear ST buffer
            self.add_to_long_term(user_id, key="conversation_summary", value=summary, priority=0.6, tags=["summary"])
            with self._lock:
                self._load_user(user_id)
                self._mem[user_id]["short_term"] = []
                self._save_user(user_id)
                log.debug(f"[Memory] Short-term memory cleared for user {user_id} after summarization.")
        return summary

    # ---------- maintenance ----------
    def reset_memory(self, user_id: str):
        """Hard reset both ST and LT for a user."""
        with self._lock:
            self._mem[user_id] = {"short_term": [], "long_term": []}
            self._save_user(user_id)

    def get_raw_memory(self, user_id: str):
        """
        Return the raw internal memory structure (serializable) for inspection:
          { 'short_term': List[(Role,str)], 'long_term': List[LTItem-as-dict] }
        """
        with self._lock:
            self._load_user(user_id)
            st = self._mem[user_id]["short_term"]  # type: ignore
            lt = self._mem[user_id]["long_term"]  # type: ignore
            return {"short_term": list(st), "long_term": [asdict(x) for x in lt]}
