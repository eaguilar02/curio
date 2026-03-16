import sqlite3
import json
import logging
from datetime import datetime
from flask import request, jsonify

logger = logging.getLogger(__name__)


def register_logging_routes(bp, get_db_path):
    @bp.route("/api/log/session/start", methods=["POST"])
    def start_logging_session():
        body = request.get_json(silent=True) or {}

        user_id = body.get("user_id", 1)
        workflow_id = body.get("workflow_id")
        session_start = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        db_path = get_db_path()
        try:
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO interaction_session (user_id, workflow_id, session_start)
                VALUES (?, ?, ?)
                """,
                (user_id, workflow_id, session_start),
            )
            session_id = cur.lastrowid
            conn.commit()
            conn.close()
        except sqlite3.Error as e:
            logger.error("start_logging_session DB error: %s", e)
            return jsonify({"error": "Database error", "detail": str(e)}), 500

        return jsonify(
            {
                "session_id": session_id,
                "user_id": user_id,
                "workflow_id": workflow_id,
                "session_start": session_start,
            }
        ), 200

    @bp.route("/api/log/events", methods=["POST"])
    def log_events():
        body = request.get_json(silent=True)

        if not body:
            return jsonify({"error": "Request body must be JSON"}), 400

        session_id = body.get("session_id")
        events = body.get("events", [])

        if session_id is None:
            return jsonify({"error": "Missing session_id"}), 400
        if not isinstance(events, list):
            return jsonify({"error": "events must be a list"}), 400
        if len(events) == 0:
            return jsonify({"inserted": 0}), 200

        rows = []
        for ev in events:
            event_type = ev.get("event_type")
            if not event_type:
                continue

            node_id = ev.get("node_id")
            edge_id = ev.get("edge_id")
            event_time = ev.get("event_time") or datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            event_data = ev.get("event_data")

            if isinstance(event_data, dict):
                event_data = json.dumps(event_data)

            rows.append((session_id, event_type, node_id, edge_id, event_time, event_data))

        if not rows:
            return jsonify({"inserted": 0}), 200

        db_path = get_db_path()
        try:
            conn = sqlite3.connect(db_path)
            conn.executemany(
                """
                INSERT INTO interaction_event
                (session_id, event_type, node_id, edge_id, event_time, event_data)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
            conn.commit()
            conn.close()
        except sqlite3.Error as e:
            logger.error("log_events DB error: %s", e)
            return jsonify({"error": "Database error", "detail": str(e)}), 500

        return jsonify({"inserted": len(rows)}), 200

    @bp.route("/api/log/sessions", methods=["GET"])
    def list_sessions():
        workflow_id = request.args.get("workflow_id", type=int)
        user_id = request.args.get("user_id", type=int)
        limit = request.args.get("limit", 50, type=int)
        offset = request.args.get("offset", 0, type=int)

        where_clauses = []
        params = []

        if workflow_id is not None:
            where_clauses.append("s.workflow_id = ?")
            params.append(workflow_id)

        if user_id is not None:
            where_clauses.append("s.user_id = ?")
            params.append(user_id)

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        db_path = get_db_path()
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row

            count_row = conn.execute(
                f"SELECT COUNT(*) FROM interaction_session s {where_sql}",
                params,
            ).fetchone()
            total = count_row[0] if count_row else 0

            rows = conn.execute(
                f"""
                SELECT
                    s.session_id,
                    s.user_id,
                    s.workflow_id,
                    s.session_start,
                    s.session_end,
                    COUNT(e.event_id) AS event_count
                FROM interaction_session s
                LEFT JOIN interaction_event e ON e.session_id = s.session_id
                {where_sql}
                GROUP BY s.session_id
                ORDER BY s.session_start DESC
                LIMIT ? OFFSET ?
                """,
                params + [limit, offset],
            ).fetchall()

            conn.close()
        except sqlite3.Error as e:
            logger.error("list_sessions DB error: %s", e)
            return jsonify({"error": "Database error", "detail": str(e)}), 500

        sessions = [dict(row) for row in rows]
        return jsonify({"sessions": sessions, "total": total}), 200

    @bp.route("/api/log/session/<int:session_id>/events", methods=["GET"])
    def get_session_events(session_id):
        limit = request.args.get("limit", 200, type=int)
        offset = request.args.get("offset", 0, type=int)
        event_type = request.args.get("type", None)

        type_clause = "AND event_type = ?" if event_type else ""
        params_count = [session_id]
        params_fetch = [session_id]

        if event_type:
            params_count.append(event_type)
            params_fetch.append(event_type)

        db_path = get_db_path()
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row

            count_row = conn.execute(
                f"SELECT COUNT(*) FROM interaction_event WHERE session_id = ? {type_clause}",
                params_count,
            ).fetchone()
            total = count_row[0] if count_row else 0

            rows = conn.execute(
                f"""
                SELECT event_id, event_type, node_id, edge_id, event_time, event_data
                FROM interaction_event
                WHERE session_id = ? {type_clause}
                ORDER BY event_time ASC, event_id ASC
                LIMIT ? OFFSET ?
                """,
                params_fetch + [limit, offset],
            ).fetchall()

            conn.close()
        except sqlite3.Error as e:
            logger.error("get_session_events DB error: %s", e)
            return jsonify({"error": "Database error", "detail": str(e)}), 500

        events = []
        for row in rows:
            ev = dict(row)
            if ev.get("event_data"):
                try:
                    ev["event_data"] = json.loads(ev["event_data"])
                except (json.JSONDecodeError, TypeError):
                    pass
            events.append(ev)

        return jsonify(
            {
                "session_id": session_id,
                "total_events": total,
                "events": events,
            }
        ), 200