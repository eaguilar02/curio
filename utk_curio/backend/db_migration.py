import sqlite3


def column_exists(cursor, table_name: str, column_name: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [row[1] for row in cursor.fetchall()]
    return column_name in columns


def run_migration(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS interaction_session (
        session_id INTEGER PRIMARY KEY,
        user_id INTEGER,
        workflow_id INTEGER,
        workflow_name TEXT,
        session_start DATETIME,
        session_end DATETIME,
        archived INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES user(user_id),
        FOREIGN KEY (workflow_id) REFERENCES workflow(workflow_id)
    );
    """)

    if not column_exists(cursor, "interaction_session", "workflow_name"):
        cursor.execute("""
        ALTER TABLE interaction_session
        ADD COLUMN workflow_name TEXT
        """)
        print("Added workflow_name column to interaction_session")

    if not column_exists(cursor, "interaction_session", "archived"):
        cursor.execute("""
        ALTER TABLE interaction_session
        ADD COLUMN archived INTEGER DEFAULT 0
        """)
        print("Added archived column to interaction_session")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS interaction_event (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        event_type TEXT,
        node_id TEXT,
        edge_id TEXT,
        event_time TEXT,
        event_data TEXT,
        snapshot_ref INTEGER,
        FOREIGN KEY (session_id) REFERENCES interaction_session(session_id),
        FOREIGN KEY (snapshot_ref) REFERENCES graph_snapshot(snapshot_id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS graph_snapshot (
        snapshot_id INTEGER PRIMARY KEY,
        session_id INTEGER,
        event_count INTEGER,
        snapshot_time DATETIME,
        graph_json TEXT,
        FOREIGN KEY (session_id) REFERENCES interaction_session(session_id)
    );
    """)

    conn.commit()
    conn.close()