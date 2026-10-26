"""SQLite persistence layer.

Uses stdlib sqlite3 with asyncio.to_thread() so async endpoints do not block.
Schema auto-creates on first use.  All IDs are short random hex strings.
"""

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = """\
CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('local','github')),
    local_path TEXT NOT NULL,
    default_branch TEXT,
    languages TEXT DEFAULT '[]',
    file_count INTEGER DEFAULT 0,
    last_indexed_at TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS investigations (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(id),
    question TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT 'ollama',
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TEXT NOT NULL,
    completed_at TEXT,
    error TEXT,
    limitations TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS findings (
    id TEXT PRIMARY KEY,
    investigation_id TEXT NOT NULL REFERENCES investigations(id),
    title TEXT NOT NULL,
    severity TEXT NOT NULL,
    category TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    evidence TEXT NOT NULL DEFAULT '',
    explanation TEXT,
    suggested_fix TEXT,
    confidence TEXT NOT NULL DEFAULT 'medium',
    review_status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patches (
    id TEXT PRIMARY KEY,
    finding_id TEXT NOT NULL REFERENCES findings(id),
    diff TEXT NOT NULL,
    explanation TEXT,
    file_path TEXT,
    original_hash TEXT,
    validation_status TEXT NOT NULL DEFAULT 'pending',
    approval_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_runs (
    id TEXT PRIMARY KEY,
    patch_id TEXT NOT NULL REFERENCES patches(id),
    command TEXT NOT NULL,
    exit_code INTEGER,
    output TEXT,
    duration_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS history_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def _uid() -> str:
    return uuid.uuid4().hex[:12]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_loads(s: Any) -> list:
    if s is None:
        return []
    try:
        return json.loads(s)
    except (json.JSONDecodeError, TypeError):
        return []


class Database:
    """Thin wrapper around SQLite.  One connection per call (safe for threads)."""

    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.path), timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init(self):
        if str(self.path) != ":memory:":
            self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = self._conn()
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)
            conn.commit()
        finally:
            conn.close()

    # ------------------------------------------------------------------ repos
    def insert_repository(
        self, name: str, source_type: str, local_path: str,
        default_branch: str | None = None, languages: list[str] | None = None,
        file_count: int = 0,
    ) -> dict:
        rid = _uid()
        now = _now()
        conn = self._conn()
        try:
            conn.execute(
                "INSERT INTO repositories "
                "(id,name,source_type,local_path,default_branch,languages,file_count,last_indexed_at,created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (rid, name, source_type, str(local_path), default_branch,
                 json.dumps(languages or []), file_count, now, now),
            )
            conn.commit()
            self._log_sync(conn, "repo_imported", f"Imported repository: {name}")
            return self._get_repo(conn, rid)  # type: ignore[return-value]
        finally:
            conn.close()

    def list_repositories(self) -> list[dict]:
        conn = self._conn()
        try:
            return [self._repo_row(r) for r in
                    conn.execute("SELECT * FROM repositories ORDER BY created_at DESC").fetchall()]
        finally:
            conn.close()

    def get_repository(self, rid: str) -> dict | None:
        conn = self._conn()
        try:
            return self._get_repo(conn, rid)
        finally:
            conn.close()

    def _get_repo(self, conn: sqlite3.Connection, rid: str) -> dict | None:
        row = conn.execute("SELECT * FROM repositories WHERE id=?", (rid,)).fetchone()
        return self._repo_row(row) if row else None

    @staticmethod
    def _repo_row(r: sqlite3.Row) -> dict:
        return {
            "id": r["id"], "name": r["name"], "source_type": r["source_type"],
            "local_path": r["local_path"], "default_branch": r["default_branch"],
            "languages": _json_loads(r["languages"]), "file_count": r["file_count"],
            "last_indexed_at": r["last_indexed_at"],
        }

    # --------------------------------------------------------- investigations
    def insert_investigation(
        self, repository_id: str, question: str, model: str, provider: str = "ollama",
    ) -> dict:
        iid = _uid()
        now = _now()
        conn = self._conn()
        try:
            conn.execute(
                "INSERT INTO investigations "
                "(id,repository_id,question,model,provider,status,started_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (iid, repository_id, question, model, provider, "running", now),
            )
            conn.commit()
            self._log_sync(conn, "investigation_started",
                           f"Investigation started: {question[:80]}")
            return self._get_inv(conn, iid)  # type: ignore[return-value]
        finally:
            conn.close()

    def complete_investigation(
        self, iid: str, status: str = "completed",
        error: str | None = None, limitations: list[str] | None = None,
    ) -> None:
        conn = self._conn()
        try:
            conn.execute(
                "UPDATE investigations SET status=?, completed_at=?, error=?, limitations=? WHERE id=?",
                (status, _now(), error, json.dumps(limitations or []), iid),
            )
            conn.commit()
            self._log_sync(conn, "investigation_completed",
                           f"Investigation {iid}: {status}")
        finally:
            conn.close()

    def list_investigations(self) -> list[dict]:
        conn = self._conn()
        try:
            return [self._inv_row(r) for r in
                    conn.execute("SELECT * FROM investigations ORDER BY started_at DESC").fetchall()]
        finally:
            conn.close()

    def get_investigation(self, iid: str) -> dict | None:
        conn = self._conn()
        try:
            return self._get_inv(conn, iid)
        finally:
            conn.close()

    def _get_inv(self, conn: sqlite3.Connection, iid: str) -> dict | None:
        row = conn.execute("SELECT * FROM investigations WHERE id=?", (iid,)).fetchone()
        return self._inv_row(row) if row else None

    @staticmethod
    def _inv_row(r: sqlite3.Row) -> dict:
        return {
            "id": r["id"], "repository_id": r["repository_id"],
            "question": r["question"], "model": r["model"], "provider": r["provider"],
            "status": r["status"], "started_at": r["started_at"],
            "completed_at": r["completed_at"], "error": r["error"],
            "limitations": _json_loads(r["limitations"]),
        }

    # --------------------------------------------------------------- findings
    def insert_finding(
        self, investigation_id: str, title: str, severity: str, category: str,
        file_path: str, evidence: str, explanation: str | None = None,
        suggested_fix: str | None = None, confidence: str = "medium",
        line_start: int | None = None, line_end: int | None = None,
    ) -> dict:
        fid = _uid()
        now = _now()
        conn = self._conn()
        try:
            conn.execute(
                "INSERT INTO findings "
                "(id,investigation_id,title,severity,category,file_path,"
                "line_start,line_end,evidence,explanation,suggested_fix,confidence,review_status,created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (fid, investigation_id, title, severity, category, file_path,
                 line_start, line_end, evidence, explanation, suggested_fix,
                 confidence, "new", now),
            )
            conn.commit()
            self._log_sync(conn, "finding_created", f"Finding: {title}")
            return self._get_finding(conn, fid)  # type: ignore[return-value]
        finally:
            conn.close()

    def list_findings(self) -> list[dict]:
        conn = self._conn()
        try:
            return [self._finding_row(r) for r in
                    conn.execute("SELECT * FROM findings ORDER BY created_at DESC").fetchall()]
        finally:
            conn.close()

    def get_finding(self, fid: str) -> dict | None:
        conn = self._conn()
        try:
            return self._get_finding(conn, fid)
        finally:
            conn.close()

    def _get_finding(self, conn: sqlite3.Connection, fid: str) -> dict | None:
        row = conn.execute("SELECT * FROM findings WHERE id=?", (fid,)).fetchone()
        return self._finding_row(row) if row else None

    @staticmethod
    def _finding_row(r: sqlite3.Row) -> dict:
        return {
            "id": r["id"], "investigation_id": r["investigation_id"],
            "title": r["title"], "severity": r["severity"], "category": r["category"],
            "file_path": r["file_path"], "line_start": r["line_start"],
            "line_end": r["line_end"], "evidence": r["evidence"],
            "explanation": r["explanation"], "suggested_fix": r["suggested_fix"],
            "confidence": r["confidence"], "review_status": r["review_status"],
        }

    # --------------------------------------------------------------- patches
    def insert_patch(
        self, finding_id: str, diff: str, explanation: str | None = None,
        file_path: str | None = None, original_hash: str | None = None,
    ) -> dict:
        pid = _uid()
        now = _now()
        conn = self._conn()
        try:
            conn.execute(
                "INSERT INTO patches "
                "(id,finding_id,diff,explanation,file_path,original_hash,"
                "validation_status,approval_status,created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (pid, finding_id, diff, explanation, file_path, original_hash,
                 "pending", "pending", now),
            )
            conn.commit()
            self._log_sync(conn, "patch_created",
                           f"Patch proposed for finding {finding_id}")
            return self._get_patch(conn, pid)  # type: ignore[return-value]
        finally:
            conn.close()

    def update_patch(self, pid: str, **kw: str) -> None:
        allowed = {"validation_status", "approval_status"}
        sets = {k: v for k, v in kw.items() if k in allowed and v}
        if not sets:
            return
        conn = self._conn()
        try:
            for col, val in sets.items():
                conn.execute(f"UPDATE patches SET {col}=? WHERE id=?", (val, pid))
            conn.commit()
            label = ", ".join(f"{k}={v}" for k, v in sets.items())
            self._log_sync(conn, "patch_updated", f"Patch {pid}: {label}")
        finally:
            conn.close()

    def list_patches(self) -> list[dict]:
        conn = self._conn()
        try:
            return [self._patch_row(r) for r in
                    conn.execute("SELECT * FROM patches ORDER BY created_at DESC").fetchall()]
        finally:
            conn.close()

    def get_patch(self, pid: str) -> dict | None:
        conn = self._conn()
        try:
            return self._get_patch(conn, pid)
        finally:
            conn.close()

    def _get_patch(self, conn: sqlite3.Connection, pid: str) -> dict | None:
        row = conn.execute("SELECT * FROM patches WHERE id=?", (pid,)).fetchone()
        return self._patch_row(row) if row else None

    @staticmethod
    def _patch_row(r: sqlite3.Row) -> dict:
        return {
            "id": r["id"], "finding_id": r["finding_id"], "diff": r["diff"],
            "explanation": r["explanation"], "file_path": r["file_path"],
            "original_hash": r["original_hash"],
            "validation_status": r["validation_status"],
            "approval_status": r["approval_status"],
        }

    # ------------------------------------------------------------- test runs
    def insert_test_run(
        self, patch_id: str, command: str, exit_code: int | None = None,
        output: str | None = None, duration_ms: int | None = None,
        status: str = "pending",
    ) -> dict:
        tid = _uid()
        now = _now()
        conn = self._conn()
        try:
            conn.execute(
                "INSERT INTO test_runs "
                "(id,patch_id,command,exit_code,output,duration_ms,status,created_at) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (tid, patch_id, command, exit_code, output, duration_ms, status, now),
            )
            conn.commit()
            self._log_sync(conn, "test_run",
                           f"Test for patch {patch_id}: {status}")
            return self._get_trun(conn, tid)  # type: ignore[return-value]
        finally:
            conn.close()

    def list_test_runs(self) -> list[dict]:
        conn = self._conn()
        try:
            return [self._tr_row(r) for r in
                    conn.execute("SELECT * FROM test_runs ORDER BY created_at DESC").fetchall()]
        finally:
            conn.close()

    def _get_trun(self, conn: sqlite3.Connection, tid: str) -> dict | None:
        row = conn.execute("SELECT * FROM test_runs WHERE id=?", (tid,)).fetchone()
        return self._tr_row(row) if row else None

    @staticmethod
    def _tr_row(r: sqlite3.Row) -> dict:
        return {
            "id": r["id"], "patch_id": r["patch_id"], "command": r["command"],
            "exit_code": r["exit_code"], "output": r["output"],
            "duration_ms": r["duration_ms"], "status": r["status"],
        }

    # -------------------------------------------------------------- history
    def _log_sync(self, conn: sqlite3.Connection, etype: str, message: str) -> None:
        conn.execute(
            "INSERT INTO history_events (id,type,message,created_at) VALUES (?,?,?,?)",
            (_uid(), etype, message, _now()),
        )
        conn.commit()

    def log_event(self, etype: str, message: str) -> None:
        conn = self._conn()
        try:
            self._log_sync(conn, etype, message)
        finally:
            conn.close()

    def list_events(self, limit: int = 50) -> list[dict]:
        conn = self._conn()
        try:
            return [
                {"id": r["id"], "type": r["type"], "message": r["message"],
                 "created_at": r["created_at"]}
                for r in conn.execute(
                    "SELECT * FROM history_events ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            ]
        finally:
            conn.close()
