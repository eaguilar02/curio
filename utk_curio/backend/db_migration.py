import sqlite3


def run_migration(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS interaction_session (
        session_id INTEGER PRIMARY KEY,
        user_id INTEGER,
        workflow_id INTEGER,
        session_start DATETIME,
        session_end DATETIME,
        FOREIGN KEY (user_id) REFERENCES user(user_id),
        FOREIGN KEY (workflow_id) REFERENCES workflow(workflow_id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS interaction_event (
        event_id INTEGER PRIMARY KEY,
        session_id INTEGER,
        event_type TEXT,
        node_id TEXT,
        edge_id TEXT,
        event_time DATETIME,
        event_data TEXT,
        FOREIGN KEY (session_id) REFERENCES interaction_session(session_id)
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