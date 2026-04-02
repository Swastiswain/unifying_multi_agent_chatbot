import sqlite3
import uuid
from datetime import datetime
from typing import Optional

DB_PATH = "chatbot.db"

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            bot_id TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        )
    """)

    conn.commit()
    conn.close()
    print("✅ Database initialized")

def create_session(bot_id: str) -> str:
    session_id = str(uuid.uuid4())
    conn = get_conn()
    conn.execute(
        "INSERT INTO sessions (id, bot_id, created_at) VALUES (?, ?, ?)",
        (session_id, bot_id, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()
    return session_id

def save_message(session_id: str, role: str, content: str):
    conn = get_conn()
    conn.execute(
        "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
        (session_id, role, content, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()

def get_history(session_id: str) -> Optional[list]:
    conn = get_conn()

    session = conn.execute(
        "SELECT * FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()

    if not session:
        conn.close()
        return None

    rows = conn.execute(
        "SELECT role, content, created_at FROM messages WHERE session_id = ? ORDER BY id ASC",
        (session_id,)
    ).fetchall()
    conn.close()

    return [{"role": r["role"], "content": r["content"], "created_at": r["created_at"]} for r in rows]

def get_sessions(bot_id: str) -> list:
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT s.id, s.bot_id, s.created_at,
               COUNT(m.id) as message_count
        FROM sessions s
        LEFT JOIN messages m ON m.session_id = s.id
        WHERE s.bot_id = ?
        GROUP BY s.id
        ORDER BY s.created_at DESC
        """,
        (bot_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def delete_session(session_id: str):
    conn = get_conn()
    conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
    conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()