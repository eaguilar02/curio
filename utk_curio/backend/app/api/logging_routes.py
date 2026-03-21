import sqlite3
import json
import logging
from datetime import datetime
from flask import request, jsonify

logger = logging.getLogger(__name__)


def register_logging_routes(bp, get_db_path):

    # =========================================================================
    # POST /api/log/session/start
    # =========================================================================
    @bp.route("/api/log/session/start", methods=["POST"])
    def start_logging_session():
        body = request.get_json(silent=True) or {}

        user_id       = body.get("user_id", 1)
        workflow_id   = body.get("workflow_id")
        session_start = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        db_path = get_db_path()
        try:
            conn = sqlite3.connect(db_path)
            cur  = conn.cursor()
            cur.execute(
                """INSERT INTO interaction_session (user_id, workflow_id, session_start)
                   VALUES (?, ?, ?)""",
                (user_id, workflow_id, session_start),
            )
            session_id = cur.lastrowid
            conn.commit()
            conn.close()
        except sqlite3.Error as e:
            logger.error("start_logging_session DB error: %s", e)
            return jsonify({"error": "Database error", "detail": str(e)}), 500

        logger.debug("start_logging_session: created session_id=%s", session_id)
        return jsonify({
            "session_id":    session_id,
            "user_id":       user_id,
            "workflow_id":   workflow_id,
            "session_start": session_start,
        }), 200


    # =========================================================================
    # POST /api/log/events
    # =========================================================================
    @bp.route("/api/log/events", methods=["POST"])
    def log_events():
        body = request.get_json(silent=True)

        if not body:
            return jsonify({"error": "Request body must be JSON"}), 400

        session_id   = body.get("session_id")
        events       = body.get("events", [])
        snapshot_ref = body.get("snapshot_ref")   # Week 4: optional batch-level ref

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

            node_id    = ev.get("node_id")
            edge_id    = ev.get("edge_id")
            event_time = ev.get("event_time") or \
                         datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            event_data = ev.get("event_data")

            if isinstance(event_data, dict):
                event_data = json.dumps(event_data)

            rows.append((
                session_id,
                event_type,
                node_id,
                edge_id,
                event_time,
                event_data,
                snapshot_ref,
            ))

        if not rows:
            return jsonify({"inserted": 0}), 200

        db_path = get_db_path()
        try:
            conn = sqlite3.connect(db_path)
            conn.executemany(
                """INSERT INTO interaction_event
                   (session_id, event_type, node_id, edge_id,
                    event_time, event_data, snapshot_ref)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                rows,
            )
            conn.commit()
            conn.close()
        except sqlite3.Error as e:
            logger.error("log_events DB error: %s", e)
            return jsonify({"error": "Database error", "detail": str(e)}), 500

        logger.debug(
            "log_events: inserted %d events for session %s (snapshot_ref=%s)",
            len(rows), session_id, snapshot_ref,
        )
        return jsonify({"inserted": len(rows)}), 200


    # =========================================================================
    # GET /api/log/sessions
    # =========================================================================
    @bp.route("/api/log/sessions", methods=["GET"])
    def list_sessions():
        workflow_id = request.args.get("workflow_id", type=int)
        user_id     = request.args.get("user_id",     type=int)
        limit       = request.args.get("limit",  50,  type=int)
        offset      = request.args.get("offset", 0,   type=int)

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
                f"SELECT COUNT(*) FROM interaction_session s {where_sql}", params
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

        return jsonify({"sessions": [dict(r) for r in rows], "total": total}), 200


    # =========================================================================
    # GET /api/log/session/<session_id>/events
    # =========================================================================
    @bp.route("/api/log/session/<int:session_id>/events", methods=["GET"])
    def get_session_events(session_id):
        limit      = request.args.get("limit",  200, type=int)
        offset     = request.args.get("offset", 0,   type=int)
        event_type = request.args.get("type",   None)

        type_clause  = "AND event_type = ?" if event_type else ""
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
                f"SELECT COUNT(*) FROM interaction_event "
                f"WHERE session_id = ? {type_clause}",
                params_count,
            ).fetchone()
            total = count_row[0] if count_row else 0

            rows = conn.execute(
                f"""
                SELECT event_id, event_type, node_id, edge_id,
                       event_time, event_data, snapshot_ref
                FROM   interaction_event
                WHERE  session_id = ? {type_clause}
                ORDER  BY event_time ASC, event_id ASC
                LIMIT  ? OFFSET ?
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

        return jsonify({
            "session_id":   session_id,
            "total_events": total,
            "events":       events,
        }), 200


    # =========================================================================
    # GET /api/log/session/<session_id>/snapshots   ← Week 5 NEW
    # =========================================================================
    @bp.route("/api/log/session/<int:session_id>/snapshots", methods=["GET"])
    def get_session_snapshots(session_id):
        """
        Returns all graph snapshots for a session sorted by event_count ASC.
        ReplayEngine.loadSession() calls this to find checkpoints for seekTo().
        """
        db_path = get_db_path()
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT snapshot_id, session_id, event_count,
                          snapshot_time, graph_json
                   FROM   graph_snapshot
                   WHERE  session_id = ?
                   ORDER  BY event_count ASC""",
                (session_id,),
            ).fetchall()
            conn.close()
        except sqlite3.Error as e:
            logger.error("get_session_snapshots DB error: %s", e)
            return jsonify({"error": "Database error", "detail": str(e)}), 500

        return jsonify({
            "session_id": session_id,
            "snapshots":  [dict(r) for r in rows],
        }), 200


    # =========================================================================
    # POST /api/log/snapshot
    # =========================================================================
    @bp.route("/api/log/snapshot", methods=["POST"])
    def save_snapshot():
        body = request.get_json(silent=True)
        if not body:
            return jsonify({"error": "Request body must be JSON"}), 400

        session_id  = body.get("session_id")
        event_count = body.get("event_count")
        graph_json  = body.get("graph_json")

        if session_id is None:
            return jsonify({"error": "Missing session_id"}), 400
        if event_count is None:
            return jsonify({"error": "Missing event_count"}), 400
        if graph_json is None:
            return jsonify({"error": "Missing graph_json"}), 400

        if isinstance(graph_json, dict):
            graph_json = json.dumps(graph_json)

        snapshot_time = body.get("snapshot_time") or \
                        datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        db_path = get_db_path()
        try:
            conn   = sqlite3.connect(db_path)
            cursor = conn.execute(
                """INSERT INTO graph_snapshot
                   (session_id, event_count, snapshot_time, graph_json)
                   VALUES (?, ?, ?, ?)""",
                (session_id, event_count, snapshot_time, graph_json),
            )
            snapshot_id = cursor.lastrowid
            conn.commit()
            conn.close()
        except sqlite3.Error as e:
            logger.error("save_snapshot DB error: %s", e)
            return jsonify({"error": "Database error", "detail": str(e)}), 500

        logger.debug(
            "save_snapshot: snapshot_id=%s session=%s event_count=%s",
            snapshot_id, session_id, event_count,
        )
        return jsonify({"snapshot_id": snapshot_id, "event_count": event_count}), 200


    # =========================================================================
    # POST /api/log/session/end
    # =========================================================================
    @bp.route("/api/log/session/end", methods=["POST"])
    def end_session():
        body        = request.get_json(silent=True) or {}
        session_id  = body.get("session_id")
        session_end = body.get("session_end") or \
                      datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        if session_id is None:
            return jsonify({"error": "Missing session_id"}), 400

        db_path = get_db_path()
        try:
            conn = sqlite3.connect(db_path)

            row = conn.execute(
                "SELECT session_id FROM interaction_session WHERE session_id = ?",
                (session_id,),
            ).fetchone()

            if not row:
                conn.close()
                return jsonify({"error": f"Session {session_id} not found"}), 404

            conn.execute(
                "UPDATE interaction_session SET session_end = ? WHERE session_id = ?",
                (session_end, session_id),
            )
            conn.commit()
            conn.close()
        except sqlite3.Error as e:
            logger.error("end_session DB error: %s", e)
            return jsonify({"error": "Database error", "detail": str(e)}), 500

        logger.debug("end_session: session_id=%s closed at %s", session_id, session_end)
        return jsonify({
            "closed":      True,
            "session_id":  session_id,
            "session_end": session_end,
        }), 200


    # =========================================================================
    # POST /api/log/sessions/cleanup
    # =========================================================================
    @bp.route("/api/log/sessions/cleanup", methods=["POST"])
    def cleanup_stale_sessions():
        hours = request.args.get("hours", 24, type=int)

        db_path = get_db_path()
        try:
            conn   = sqlite3.connect(db_path)
            cursor = conn.execute(
                """UPDATE interaction_session
                   SET    session_end = 'AUTO_CLOSED'
                   WHERE  session_end IS NULL
                   AND    session_start < datetime('now', ?)""",
                (f"-{hours} hours",),
            )
            closed_count = cursor.rowcount
            conn.commit()
            conn.close()
        except sqlite3.Error as e:
            logger.error("cleanup_stale_sessions DB error: %s", e)
            return jsonify({"error": "Database error", "detail": str(e)}), 500

        logger.info(
            "cleanup_stale_sessions: auto-closed %d sessions (cutoff: %dh)",
            closed_count, hours,
        )
        return jsonify({"closed": closed_count}), 200


# =============================================================================
# close_stale_sessions — module-level function called from routes.py on startup
# =============================================================================
def close_stale_sessions(db_path: str, hours: int = 24) -> int:
    try:
        conn   = sqlite3.connect(db_path)
        cursor = conn.execute(
            """UPDATE interaction_session
               SET    session_end = 'AUTO_CLOSED'
               WHERE  session_end IS NULL
               AND    session_start < datetime('now', ?)""",
            (f"-{hours} hours",),
        )
        closed_count = cursor.rowcount
        conn.commit()
        conn.close()

        if closed_count > 0:
            logger.info(
                "close_stale_sessions: auto-closed %d sessions on startup",
                closed_count,
            )
        return closed_count

    except Exception as e:
        logger.error("close_stale_sessions error: %s", e)
        return 0