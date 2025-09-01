import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

class RunRegistry:
    """Simple SQLite-backed registry for training/backtest runs."""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
                    type TEXT,
                    status TEXT,
                    out_dir TEXT,
                    created_at TEXT,
                    started_at TEXT,
                    finished_at TEXT,
                    meta TEXT,
                    error TEXT
                )
                """
            )
            conn.commit()

    def save(self, rec: Any) -> None:
        """Insert or update a run record."""
        if hasattr(rec, "model_dump"):
            data: Dict[str, Any] = rec.model_dump()
        elif hasattr(rec, "dict"):
            data = rec.dict()
        else:
            data = dict(rec)
        meta = json.dumps(data.get("meta") or {})
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO runs
                (id, type, status, out_dir, created_at, started_at, finished_at, meta, error)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    data.get("id"),
                    data.get("type"),
                    data.get("status"),
                    data.get("out_dir"),
                    data.get("created_at"),
                    data.get("started_at"),
                    data.get("finished_at"),
                    meta,
                    data.get("error"),
                ),
            )
            conn.commit()

    def list(self) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.execute(
                """
                SELECT id, type, status, out_dir, created_at, started_at, finished_at
                FROM runs ORDER BY datetime(created_at) DESC
                """
            )
            cols = [col[0] for col in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]

    def get(self, run_id: str) -> Optional[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.execute(
                """
                SELECT id, type, status, out_dir, created_at, started_at, finished_at, meta, error
                FROM runs WHERE id = ?
                """,
                (run_id,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            cols = [col[0] for col in cur.description]
            data = dict(zip(cols, row))
            try:
                data["meta"] = json.loads(data.get("meta") or "{}")
            except Exception:
                data["meta"] = {}
            return data
