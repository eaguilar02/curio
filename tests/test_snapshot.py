import json
import sqlite3
import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "utk_curio", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "utk_curio", "backend", "app", "api"))

from flask import Flask
from db_migration import run_migration
from logging_routes import register_logging_routes


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "provenance.db")
    run_migration(path)
    return path


@pytest.fixture
def app(db_path):
    flask_app = Flask(__name__)
    flask_app.config["TESTING"] = True

    from flask import Blueprint
    bp = Blueprint("api", __name__)
    register_logging_routes(bp, lambda: db_path)
    flask_app.register_blueprint(bp)

    return flask_app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def session_id(client):
    r = client.post(
        "/api/log/session/start",
        json={"user_id": 1, "workflow_id": None},
    )
    assert r.status_code == 200
    return r.get_json()["session_id"]


def make_events(n, event_type="NODE_ADDED"):
    return [
        {
            "event_type": event_type,
            "node_id":    f"node-{i}",
            "event_time": f"2025-03-08 14:{i:02d}:00",
            "event_data": {"nodeType": "DATA_LOADING", "position": {"x": i * 10, "y": 0}},
        }
        for i in range(n)
    ]


SAMPLE_GRAPH = json.dumps({
    "nodes": [
        {"id": "node-1", "type": "DATA_LOADING", "position": {"x": 100, "y": 100}, "data": {}},
        {"id": "node-2", "type": "DATA_TRANSFORM", "position": {"x": 300, "y": 100}, "data": {}},
    ],
    "edges": [
        {"id": "edge-1", "source": "node-1", "target": "node-2"},
    ],
})


def test_snapshot_creates_row(client, session_id, db_path):
    r = client.post("/api/log/snapshot", json={
        "session_id":    session_id,
        "event_count":   25,
        "graph_json":    SAMPLE_GRAPH,
        "snapshot_time": "2025-03-08 14:10:00",
    })
    assert r.status_code == 200
    data = r.get_json()
    assert "snapshot_id" in data
    assert data["event_count"] == 25

    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT session_id, event_count, graph_json FROM graph_snapshot WHERE snapshot_id = ?",
        (data["snapshot_id"],)
    ).fetchone()
    conn.close()

    assert row is not None
    assert row[0] == session_id
    assert row[1] == 25
    parsed = json.loads(row[2])
    assert "nodes" in parsed
    assert "edges" in parsed
    assert len(parsed["nodes"]) == 2


def test_snapshot_missing_session_id(client):
    r = client.post("/api/log/snapshot", json={
        "event_count": 25,
        "graph_json":  SAMPLE_GRAPH,
    })
    assert r.status_code == 400


def test_snapshot_missing_graph_json(client, session_id):
    r = client.post("/api/log/snapshot", json={
        "session_id":  session_id,
        "event_count": 25,
    })
    assert r.status_code == 400


def test_snapshot_dict_graph_json(client, session_id, db_path):
    r = client.post("/api/log/snapshot", json={
        "session_id":  session_id,
        "event_count": 10,
        "graph_json":  {"nodes": [], "edges": []},
    })
    assert r.status_code == 200
    sid = r.get_json()["snapshot_id"]

    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT graph_json FROM graph_snapshot WHERE snapshot_id = ?", (sid,)
    ).fetchone()
    conn.close()
    assert row is not None
    assert isinstance(row[0], str)
    parsed = json.loads(row[0])
    assert "nodes" in parsed


def test_session_end_closes_session(client, session_id, db_path):
    r = client.post("/api/log/session/end", json={
        "session_id":  session_id,
        "session_end": "2025-03-08 15:00:00",
    })
    assert r.status_code == 200
    data = r.get_json()
    assert data["closed"] is True
    assert data["session_id"] == session_id

    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT session_end FROM interaction_session WHERE session_id = ?",
        (session_id,)
    ).fetchone()
    conn.close()
    assert row is not None
    assert row[0] == "2025-03-08 15:00:00"


def test_session_end_defaults_to_now(client, session_id, db_path):
    r = client.post("/api/log/session/end", json={"session_id": session_id})
    assert r.status_code == 200
    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT session_end FROM interaction_session WHERE session_id = ?",
        (session_id,)
    ).fetchone()
    conn.close()
    assert row[0] is not None


def test_session_end_missing_session_id(client):
    r = client.post("/api/log/session/end", json={})
    assert r.status_code == 400


def test_session_end_nonexistent_session(client):
    r = client.post("/api/log/session/end", json={"session_id": 9999})
    assert r.status_code == 404


def test_cleanup_closes_stale_sessions(client, db_path):
    conn = sqlite3.connect(db_path)
    conn.execute(
        """INSERT INTO interaction_session (user_id, workflow_id, session_start)
           VALUES (1, NULL, datetime('now', '-2 days'))"""
    )
    conn.execute(
        """INSERT INTO interaction_session (user_id, workflow_id, session_start)
           VALUES (1, NULL, datetime('now', '-1 hour'))"""
    )
    conn.commit()
    conn.close()

    r = client.post("/api/log/sessions/cleanup?hours=24")
    assert r.status_code == 200
    data = r.get_json()
    assert data["closed"] >= 1

    conn = sqlite3.connect(db_path)
    stale = conn.execute(
        "SELECT COUNT(*) FROM interaction_session WHERE session_end = 'AUTO_CLOSED'"
    ).fetchone()[0]
    conn.close()
    assert stale >= 1


def test_30_event_sequence_with_snapshot(client, session_id, db_path):
    r1 = client.post("/api/log/events", json={
        "session_id": session_id,
        "events":     make_events(25),
    })
    assert r1.status_code == 200
    assert r1.get_json()["inserted"] == 25

    r2 = client.post("/api/log/snapshot", json={
        "session_id":  session_id,
        "event_count": 25,
        "graph_json":  SAMPLE_GRAPH,
    })
    assert r2.status_code == 200
    snapshot_id = r2.get_json()["snapshot_id"]
    assert isinstance(snapshot_id, int)

    r3 = client.post("/api/log/events", json={
        "session_id":   session_id,
        "events":       make_events(5, event_type="PARAM_CHANGED"),
        "snapshot_ref": snapshot_id,
    })
    assert r3.status_code == 200
    assert r3.get_json()["inserted"] == 5

    conn = sqlite3.connect(db_path)

    total = conn.execute(
        "SELECT COUNT(*) FROM interaction_event WHERE session_id = ?",
        (session_id,)
    ).fetchone()[0]
    assert total == 30

    snap_count = conn.execute(
        "SELECT COUNT(*) FROM graph_snapshot WHERE session_id = ?",
        (session_id,)
    ).fetchone()[0]
    assert snap_count == 1

    null_count = conn.execute(
        """SELECT COUNT(*) FROM interaction_event
           WHERE session_id = ? AND snapshot_ref IS NULL""",
        (session_id,)
    ).fetchone()[0]
    assert null_count == 25

    ref_count = conn.execute(
        """SELECT COUNT(*) FROM interaction_event
           WHERE session_id = ? AND snapshot_ref = ?""",
        (session_id, snapshot_id)
    ).fetchone()[0]
    assert ref_count == 5

    snap_row = conn.execute(
        "SELECT event_count FROM graph_snapshot WHERE snapshot_id = ?",
        (snapshot_id,)
    ).fetchone()
    assert snap_row[0] == 25

    conn.close()


def test_close_stale_sessions_function(db_path):
    try:
        from logging_routes import close_stale_sessions
    except ImportError:
        pytest.skip("close_stale_sessions not yet imported — add it to logging_routes.py")

    conn = sqlite3.connect(db_path)
    for _ in range(2):
        conn.execute(
            """INSERT INTO interaction_session (user_id, workflow_id, session_start)
               VALUES (1, NULL, datetime('now', '-48 hours'))"""
        )
    conn.execute(
        """INSERT INTO interaction_session (user_id, workflow_id, session_start)
           VALUES (1, NULL, datetime('now', '-30 minutes'))"""
    )
    conn.commit()
    conn.close()

    closed = close_stale_sessions(db_path, hours=24)
    assert closed == 2

    conn = sqlite3.connect(db_path)
    still_open = conn.execute(
        "SELECT COUNT(*) FROM interaction_session WHERE session_end IS NULL"
    ).fetchone()[0]
    conn.close()
    assert still_open == 1