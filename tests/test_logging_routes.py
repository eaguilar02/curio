
import sqlite3
import json
import pytest
from flask import Flask, Blueprint

from utk_curio.backend.db_migration import run_migration
from utk_curio.backend.app.api.logging_routes import register_logging_routes


@pytest.fixture
def app_and_db(tmp_path):
    """
    Create a minimal Flask app with a temporary SQLite DB,
    run the migration, and register the logging routes.
    Returns: (Flask test client, db_path string)
    """
    db_path = str(tmp_path / "test_provenance.db")

    # Create your 3 new logging tables
    run_migration(db_path)

    # Create minimal existing tables that foreign keys reference
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user (
            user_id INTEGER PRIMARY KEY,
            user_name TEXT,
            user_type TEXT,
            user_IP TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS workflow (
            workflow_id INTEGER PRIMARY KEY,
            workflow_name TEXT
        )
    """)
    conn.execute("INSERT INTO user VALUES (1, 'Test', 'default', '127.0.0.1')")
    conn.execute("INSERT INTO workflow VALUES (1, 'DefaultWorkflow')")
    conn.execute("INSERT INTO workflow VALUES (2, 'ShadowAnalysis')")
    conn.commit()
    conn.close()

    # Build minimal Flask app + Blueprint
    app = Flask(__name__)
    app.config["TESTING"] = True

    bp = Blueprint("api", __name__)
    register_logging_routes(bp, lambda: db_path)
    app.register_blueprint(bp)

    return app.test_client(), db_path


def seed_session(db_path, workflow_id=1, user_id=1):
    """Insert a test session and return its session_id."""
    conn = sqlite3.connect(db_path)
    cur = conn.execute(
        "INSERT INTO interaction_session (user_id, workflow_id, session_start) VALUES (?,?,?)",
        (user_id, workflow_id, "2025-03-08 14:00:00")
    )
    session_id = cur.lastrowid
    conn.commit()
    conn.close()
    return session_id


class TestLogEvents:

    def test_happy_path_batch_inserted(self, app_and_db):
        client, db_path = app_and_db
        session_id = seed_session(db_path)

        batch = {
            "session_id": session_id,
            "events": [
                {
                    "event_type": "NODE_ADDED",
                    "node_id": "DATA_LOADING-abc",
                    "edge_id": None,
                    "event_time": "2025-03-08 14:01:00",
                    "event_data": {"nodeType": "DATA_LOADING", "position": {"x": 100, "y": 200}}
                },
                {
                    "event_type": "EDGE_CREATED",
                    "node_id": None,
                    "edge_id": "edge-1",
                    "event_time": "2025-03-08 14:02:00",
                    "event_data": {"source": "nodeA", "target": "nodeB"}
                },
                {
                    "event_type": "NODE_EXECUTED",
                    "node_id": "DATA_LOADING-abc",
                    "edge_id": None,
                    "event_time": "2025-03-08 14:03:00",
                    "event_data": {"workflowName": "DefaultWorkflow"}
                },
            ]
        }

        resp = client.post(
            "/api/log/events",
            data=json.dumps(batch),
            content_type="application/json"
        )

        assert resp.status_code == 200
        assert resp.get_json()["inserted"] == 3

        conn = sqlite3.connect(db_path)
        rows = conn.execute(
            "SELECT event_type FROM interaction_event WHERE session_id = ? ORDER BY event_time",
            (session_id,)
        ).fetchall()
        conn.close()

        assert len(rows) == 3
        assert rows[0][0] == "NODE_ADDED"
        assert rows[1][0] == "EDGE_CREATED"
        assert rows[2][0] == "NODE_EXECUTED"

    def test_empty_batch_returns_zero(self, app_and_db):
        client, db_path = app_and_db
        session_id = seed_session(db_path)

        resp = client.post(
            "/api/log/events",
            data=json.dumps({"session_id": session_id, "events": []}),
            content_type="application/json"
        )

        assert resp.status_code == 200
        assert resp.get_json()["inserted"] == 0

    def test_missing_session_id_returns_400(self, app_and_db):
        client, _ = app_and_db

        resp = client.post(
            "/api/log/events",
            data=json.dumps({"events": [{"event_type": "NODE_ADDED"}]}),
            content_type="application/json"
        )

        assert resp.status_code == 400
        assert "session_id" in resp.get_json()["error"]

    def test_non_list_events_returns_400(self, app_and_db):
        client, db_path = app_and_db
        session_id = seed_session(db_path)

        resp = client.post(
            "/api/log/events",
            data=json.dumps({"session_id": session_id, "events": {"bad": "format"}}),
            content_type="application/json"
        )

        assert resp.status_code == 400

    def test_event_data_dict_serialised_in_db(self, app_and_db):
        client, db_path = app_and_db
        session_id = seed_session(db_path)

        event_data = {"nodeType": "VISUALIZATION", "position": {"x": 50, "y": 75}}

        resp = client.post(
            "/api/log/events",
            data=json.dumps({
                "session_id": session_id,
                "events": [{
                    "event_type": "NODE_ADDED",
                    "node_id": "VIS-node-1",
                    "edge_id": None,
                    "event_time": "2025-03-08 14:05:00",
                    "event_data": event_data
                }]
            }),
            content_type="application/json"
        )

        assert resp.status_code == 200

        conn = sqlite3.connect(db_path)
        row = conn.execute(
            "SELECT event_data FROM interaction_event WHERE session_id = ?",
            (session_id,)
        ).fetchone()
        conn.close()

        stored = json.loads(row[0])
        assert stored["nodeType"] == "VISUALIZATION"
        assert stored["position"]["x"] == 50

    def test_events_without_event_type_are_skipped(self, app_and_db):
        client, db_path = app_and_db
        session_id = seed_session(db_path)

        resp = client.post(
            "/api/log/events",
            data=json.dumps({
                "session_id": session_id,
                "events": [
                    {"event_time": "2025-03-08 14:06:00"},
                    {"event_type": "SESSION_STARTED", "event_time": "2025-03-08 14:06:01"}
                ]
            }),
            content_type="application/json"
        )

        assert resp.status_code == 200
        assert resp.get_json()["inserted"] == 1


class TestListSessions:

    def test_returns_sessions_with_event_counts(self, app_and_db):
        client, db_path = app_and_db
        session_id = seed_session(db_path, workflow_id=1)

        conn = sqlite3.connect(db_path)
        conn.executemany(
            "INSERT INTO interaction_event (session_id, event_type, event_time) VALUES (?,?,?)",
            [
                (session_id, "NODE_ADDED", "2025-03-08 14:01:00"),
                (session_id, "EDGE_CREATED", "2025-03-08 14:02:00")
            ]
        )
        conn.commit()
        conn.close()

        resp = client.get("/api/log/sessions")
        assert resp.status_code == 200

        body = resp.get_json()
        assert body["total"] >= 1

        session = next(s for s in body["sessions"] if s["session_id"] == session_id)
        assert session["event_count"] == 2
        assert session["workflow_id"] == 1

    def test_filter_by_workflow_id(self, app_and_db):
        client, db_path = app_and_db
        s1 = seed_session(db_path, workflow_id=1)
        s2 = seed_session(db_path, workflow_id=2)

        resp = client.get("/api/log/sessions?workflow_id=2")
        assert resp.status_code == 200

        body = resp.get_json()
        ids = [s["session_id"] for s in body["sessions"]]
        assert s2 in ids
        assert s1 not in ids

    def test_filter_by_user_id(self, app_and_db):
        client, db_path = app_and_db
        session_id = seed_session(db_path, user_id=1)

        resp = client.get("/api/log/sessions?user_id=1")
        assert resp.status_code == 200

        body = resp.get_json()
        assert any(s["session_id"] == session_id for s in body["sessions"])

    def test_empty_db_returns_empty_list(self, app_and_db):
        client, _ = app_and_db

        resp = client.get("/api/log/sessions")
        assert resp.status_code == 200

        body = resp.get_json()
        assert body["total"] == 0
        assert body["sessions"] == []


class TestGetSessionEvents:

    def _insert_events(self, db_path, session_id, event_specs):
        conn = sqlite3.connect(db_path)
        conn.executemany(
            "INSERT INTO interaction_event (session_id, event_type, node_id, edge_id, event_time, event_data) VALUES (?,?,?,?,?,?)",
            [
                (session_id, et, nid, eid, t, json.dumps(d) if d else None)
                for et, nid, eid, t, d in event_specs
            ]
        )
        conn.commit()
        conn.close()

    def test_returns_events_in_time_order(self, app_and_db):
        client, db_path = app_and_db
        session_id = seed_session(db_path)

        self._insert_events(db_path, session_id, [
            ("NODE_MOVED", "nodeA", None, "2025-03-08 14:03:00", None),
            ("NODE_ADDED", "nodeA", None, "2025-03-08 14:01:00", {"nodeType": "VISUALIZATION"}),
            ("EDGE_CREATED", None, "edge-1", "2025-03-08 14:02:00", None),
        ])

        resp = client.get(f"/api/log/session/{session_id}/events")
        assert resp.status_code == 200

        body = resp.get_json()
        types = [e["event_type"] for e in body["events"]]
        assert types == ["NODE_ADDED", "EDGE_CREATED", "NODE_MOVED"]

    def test_pagination_with_limit_and_offset(self, app_and_db):
        client, db_path = app_and_db
        session_id = seed_session(db_path)

        specs = [
            ("NODE_ADDED", f"node{i}", None, f"2025-03-08 14:0{i}:00", None)
            for i in range(1, 6)
        ]
        self._insert_events(db_path, session_id, specs)

        resp = client.get(f"/api/log/session/{session_id}/events?limit=2&offset=0")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["total_events"] == 5
        assert len(body["events"]) == 2

        resp2 = client.get(f"/api/log/session/{session_id}/events?limit=2&offset=2")
        body2 = resp2.get_json()
        assert len(body2["events"]) == 2

        resp3 = client.get(f"/api/log/session/{session_id}/events?limit=2&offset=4")
        body3 = resp3.get_json()
        assert len(body3["events"]) == 1

    def test_filter_by_event_type(self, app_and_db):
        client, db_path = app_and_db
        session_id = seed_session(db_path)

        self._insert_events(db_path, session_id, [
            ("NODE_ADDED", "nodeA", None, "2025-03-08 14:01:00", None),
            ("NODE_EXECUTED", "nodeA", None, "2025-03-08 14:02:00", None),
            ("NODE_ADDED", "nodeB", None, "2025-03-08 14:03:00", None),
        ])

        resp = client.get(f"/api/log/session/{session_id}/events?type=NODE_ADDED")
        assert resp.status_code == 200

        body = resp.get_json()
        assert body["total_events"] == 2
        assert all(e["event_type"] == "NODE_ADDED" for e in body["events"])

    def test_event_data_parsed_back_to_dict(self, app_and_db):
        client, db_path = app_and_db
        session_id = seed_session(db_path)

        payload = {"nodeType": "DATA_LOADING", "position": {"x": 120, "y": 200}}
        self._insert_events(db_path, session_id, [
            ("NODE_ADDED", "nodeA", None, "2025-03-08 14:01:00", payload),
        ])

        resp = client.get(f"/api/log/session/{session_id}/events")
        body = resp.get_json()

        event_data = body["events"][0]["event_data"]
        assert isinstance(event_data, dict)
        assert event_data["nodeType"] == "DATA_LOADING"
        assert event_data["position"]["x"] == 120

    def test_session_with_no_events(self, app_and_db):
        client, db_path = app_and_db
        session_id = seed_session(db_path)

        resp = client.get(f"/api/log/session/{session_id}/events")
        assert resp.status_code == 200

        body = resp.get_json()
        assert body["total_events"] == 0
        assert body["events"] == []
        assert body["session_id"] == session_id