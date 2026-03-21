

import json
import pytest
from copy import deepcopy



def make_event(event_type, node_id=None, edge_id=None, event_data=None, event_id=1):
    return {
        "event_id":    event_id,
        "event_type":  event_type,
        "node_id":     node_id,
        "edge_id":     edge_id,
        "event_time":  "2026-03-17 14:00:00",
        "event_data":  event_data or {},
        "snapshot_ref": None,
    }

def make_node(node_id, node_type="DATA_LOADING", x=100, y=100, **extra_data):
    return {
        "id":       node_id,
        "type":     node_type,
        "position": {"x": x, "y": y},
        "data":     {"label": node_type, **extra_data},
        "_changed": False,
        "_dimmed":  False,
    }

def make_edge(edge_id, source, target):
    return {
        "id":      edge_id,
        "source":  source,
        "target":  target,
        "_changed": False,
    }

def apply_event(graph, event):
    """
    Python mirror of ReplayEngine.applyEvent (TypeScript).
    Pure function — never mutates input.
    """
    nodes = [dict(n, _changed=False, _dimmed=True)  for n in graph["nodes"]]
    edges = [dict(e, _changed=False)                for e in graph["edges"]]
    data  = event.get("event_data") or {}
    et    = event["event_type"]

    if et == "NODE_ADDED":
        new_node = {
            "id":       event["node_id"] or f"node-{event['event_id']}",
            "type":     data.get("nodeType", "default"),
            "position": data.get("position", {"x": 0, "y": 0}),
            "data":     {"label": data.get("label", data.get("nodeType", "")), **data},
            "_changed": True,
            "_dimmed":  False,
        }
        nodes = nodes + [new_node]

    elif et == "NODE_REMOVED":
        nid   = event["node_id"]
        nodes = [n for n in nodes if n["id"] != nid]
        edges = [e for e in edges if e["source"] != nid and e["target"] != nid]

    elif et == "NODE_MOVED":
        nid  = event["node_id"]
        to   = data.get("to") or data.get("position")
        if to and nid:
            nodes = [
                dict(n, position=to, _changed=True, _dimmed=False) if n["id"] == nid else n
                for n in nodes
            ]

    elif et == "EDGE_CREATED":
        eid  = event.get("edge_id") or f"edge-{event['event_id']}"
        if not any(e["id"] == eid for e in edges):
            new_edge = {
                "id":      eid,
                "source":  data.get("sourceNodeId", ""),
                "target":  data.get("targetNodeId", ""),
                "_changed": True,
            }
            edges = edges + [new_edge]
        src, tgt = data.get("sourceNodeId"), data.get("targetNodeId")
        nodes = [
            dict(n, _changed=True, _dimmed=False) if n["id"] in (src, tgt) else n
            for n in nodes
        ]

    elif et == "EDGE_REMOVED":
        src = data.get("sourceNodeId")
        tgt = data.get("targetNodeId")
        edges = [e for e in edges if not (e["source"] == src and e["target"] == tgt)]
        nodes = [
            dict(n, _changed=True, _dimmed=False) if n["id"] in (src, tgt) else n
            for n in nodes
        ]

    elif et == "PARAM_CHANGED":
        nid   = event["node_id"]
        pname = data.get("paramName")
        pval  = data.get("newValue")
        if nid and pname is not None:
            nodes = [
                dict(n, data={**n["data"], pname: pval}, _changed=True, _dimmed=False)
                if n["id"] == nid else n
                for n in nodes
            ]

    elif et == "NODE_EXECUTED":
        nid = event["node_id"]
        if nid:
            nodes = [
                dict(n, data={**n["data"], "_executing": True}, _changed=True, _dimmed=False)
                if n["id"] == nid else n
                for n in nodes
            ]

    elif et == "EXECUTION_COMPLETED":
        nid = event["node_id"]
        if nid:
            nodes = [
                dict(n,
                     data={**n["data"], "_executing": False, "_execSuccess": data.get("success", True)},
                     _changed=True, _dimmed=False)
                if n["id"] == nid else n
                for n in nodes
            ]

    else:  # SESSION_STARTED and unknown
        nodes = [dict(n, _changed=False, _dimmed=False) for n in nodes]
        edges = [dict(e, _changed=False) for e in edges]

    return {"nodes": nodes, "edges": edges}


def seek_to(events, snapshots, target_cursor):
    """Python mirror of ReplayEngine.seekTo"""
    target    = max(0, min(target_cursor, len(events)))
    base      = {"nodes": [], "edges": []}
    start_idx = 0

    for snap in reversed(snapshots):
        if snap["event_count"] <= target:
            parsed    = json.loads(snap["graph_json"])
            base      = {
                "nodes": [dict(n, _changed=False, _dimmed=False) for n in parsed.get("nodes", [])],
                "edges": [dict(e, _changed=False) for e in parsed.get("edges", [])],
            }
            start_idx = snap["event_count"]
            break

    graph = base
    for i in range(start_idx, target):
        graph = apply_event(graph, events[i])

    return graph



class TestApplyEvent:

    def test_node_added_creates_node(self):
        graph  = {"nodes": [], "edges": []}
        event  = make_event("NODE_ADDED", node_id="n1",
                            event_data={"nodeType": "DATA_LOADING",
                                        "position": {"x": 100, "y": 200}})
        result = apply_event(graph, event)
        assert len(result["nodes"]) == 1
        assert result["nodes"][0]["id"] == "n1"
        assert result["nodes"][0]["type"] == "DATA_LOADING"
        assert result["nodes"][0]["position"] == {"x": 100, "y": 200}

    def test_node_added_is_changed_not_dimmed(self):
        graph  = {"nodes": [], "edges": []}
        event  = make_event("NODE_ADDED", node_id="n1",
                            event_data={"nodeType": "X", "position": {"x": 0, "y": 0}})
        result = apply_event(graph, event)
        new_node = result["nodes"][0]
        assert new_node["_changed"] is True
        assert new_node["_dimmed"]  is False

    def test_existing_nodes_dimmed_on_new_add(self):
        graph  = {"nodes": [make_node("n0")], "edges": []}
        event  = make_event("NODE_ADDED", node_id="n1",
                            event_data={"nodeType": "X", "position": {"x": 0, "y": 0}})
        result = apply_event(graph, event)
        n0 = next(n for n in result["nodes"] if n["id"] == "n0")
        assert n0["_dimmed"] is True
        assert n0["_changed"] is False

    def test_node_removed_deletes_node(self):
        graph  = {"nodes": [make_node("n1"), make_node("n2")], "edges": []}
        event  = make_event("NODE_REMOVED", node_id="n1")
        result = apply_event(graph, event)
        assert len(result["nodes"]) == 1
        assert result["nodes"][0]["id"] == "n2"

    def test_node_removed_deletes_connected_edges(self):
        graph = {
            "nodes": [make_node("n1"), make_node("n2"), make_node("n3")],
            "edges": [
                make_edge("e1", "n1", "n2"),
                make_edge("e2", "n2", "n3"),
                make_edge("e3", "n1", "n3"),
            ],
        }
        result = apply_event(graph, make_event("NODE_REMOVED", node_id="n1"))
        # e1 and e3 both involve n1 — should be gone
        remaining_ids = {e["id"] for e in result["edges"]}
        assert remaining_ids == {"e2"}

    def test_node_moved_updates_position(self):
        graph  = {"nodes": [make_node("n1", x=10, y=10)], "edges": []}
        event  = make_event("NODE_MOVED", node_id="n1",
                            event_data={"to": {"x": 300, "y": 400}})
        result = apply_event(graph, event)
        assert result["nodes"][0]["position"] == {"x": 300, "y": 400}
        assert result["nodes"][0]["_changed"] is True

    def test_node_moved_fallback_position_key(self):
        """Older events may use 'position' instead of 'to'"""
        graph  = {"nodes": [make_node("n1")], "edges": []}
        event  = make_event("NODE_MOVED", node_id="n1",
                            event_data={"position": {"x": 50, "y": 50}})
        result = apply_event(graph, event)
        assert result["nodes"][0]["position"] == {"x": 50, "y": 50}

    def test_edge_created_adds_edge(self):
        graph  = {"nodes": [make_node("n1"), make_node("n2")], "edges": []}
        event  = make_event("EDGE_CREATED", edge_id="e1",
                            event_data={"sourceNodeId": "n1", "targetNodeId": "n2"})
        result = apply_event(graph, event)
        assert len(result["edges"]) == 1
        assert result["edges"][0]["source"] == "n1"
        assert result["edges"][0]["target"] == "n2"
        assert result["edges"][0]["_changed"] is True

    def test_edge_created_highlights_endpoint_nodes(self):
        graph  = {"nodes": [make_node("n1"), make_node("n2"), make_node("n3")], "edges": []}
        event  = make_event("EDGE_CREATED", edge_id="e1",
                            event_data={"sourceNodeId": "n1", "targetNodeId": "n2"})
        result = apply_event(graph, event)
        n1 = next(n for n in result["nodes"] if n["id"] == "n1")
        n2 = next(n for n in result["nodes"] if n["id"] == "n2")
        n3 = next(n for n in result["nodes"] if n["id"] == "n3")
        assert n1["_changed"] is True
        assert n2["_changed"] is True
        assert n3["_changed"] is False  # not involved
        assert n3["_dimmed"]  is True

    def test_edge_created_no_duplicates(self):
        existing_edge = make_edge("e1", "n1", "n2")
        graph  = {"nodes": [make_node("n1"), make_node("n2")],
                  "edges": [existing_edge]}
        event  = make_event("EDGE_CREATED", edge_id="e1",
                            event_data={"sourceNodeId": "n1", "targetNodeId": "n2"})
        result = apply_event(graph, event)
        assert len(result["edges"]) == 1  # no duplicate

    def test_edge_removed_removes_correct_edge(self):
        graph = {
            "nodes": [make_node("n1"), make_node("n2"), make_node("n3")],
            "edges": [make_edge("e1", "n1", "n2"), make_edge("e2", "n2", "n3")],
        }
        event  = make_event("EDGE_REMOVED",
                            event_data={"sourceNodeId": "n1", "targetNodeId": "n2"})
        result = apply_event(graph, event)
        assert len(result["edges"]) == 1
        assert result["edges"][0]["id"] == "e2"

    def test_param_changed_updates_node_data(self):
        graph  = {"nodes": [make_node("n1")], "edges": []}
        event  = make_event("PARAM_CHANGED", node_id="n1",
                            event_data={"paramName": "threshold",
                                        "oldValue": 0, "newValue": 42})
        result = apply_event(graph, event)
        assert result["nodes"][0]["data"]["threshold"] == 42
        assert result["nodes"][0]["_changed"] is True

    def test_node_executed_sets_flag(self):
        graph  = {"nodes": [make_node("n1")], "edges": []}
        event  = make_event("NODE_EXECUTED", node_id="n1",
                            event_data={"triggerSource": "prop_change"})
        result = apply_event(graph, event)
        assert result["nodes"][0]["data"]["_executing"] is True
        assert result["nodes"][0]["_changed"] is True

    def test_execution_completed_clears_executing(self):
        graph  = {"nodes": [make_node("n1", _executing=True)], "edges": []}
        event  = make_event("EXECUTION_COMPLETED", node_id="n1",
                            event_data={"success": True})
        result = apply_event(graph, event)
        assert result["nodes"][0]["data"]["_executing"]   is False
        assert result["nodes"][0]["data"]["_execSuccess"] is True

    def test_session_started_is_noop(self):
        graph = {
            "nodes": [make_node("n1"), make_node("n2")],
            "edges": [make_edge("e1", "n1", "n2")],
        }
        event  = make_event("SESSION_STARTED",
                            event_data={"userAgent": "test/1.0"})
        result = apply_event(graph, event)
        assert len(result["nodes"]) == 2
        assert len(result["edges"]) == 1
        assert all(not n["_changed"] for n in result["nodes"])
        assert all(not n["_dimmed"]  for n in result["nodes"])

    def test_pure_function_no_mutation(self):
        """applyEvent must NEVER mutate the input graph."""
        graph = {
            "nodes": [make_node("n1")],
            "edges": [],
        }
        original_nodes = deepcopy(graph["nodes"])
        event = make_event("NODE_ADDED", node_id="n2",
                           event_data={"nodeType": "X", "position": {"x": 0, "y": 0}})
        apply_event(graph, event)
        # Input is unchanged
        assert graph["nodes"] == original_nodes
        assert len(graph["nodes"]) == 1

    def test_unknown_event_type_is_noop(self):
        graph  = {"nodes": [make_node("n1")], "edges": []}
        event  = make_event("SOME_FUTURE_EVENT_TYPE")
        result = apply_event(graph, event)
        assert len(result["nodes"]) == 1
        assert result["nodes"][0]["_changed"] is False


# =============================================================================
# Tests: seekTo with snapshots
# =============================================================================

def _node_events(n):
    return [
        make_event("NODE_ADDED", node_id=f"node-{i}", event_id=i+1,
                   event_data={"nodeType": "DATA_LOADING",
                               "position": {"x": i*50, "y": 100}})
        for i in range(n)
    ]

class TestSeekTo:

    def test_seek_to_zero_returns_empty(self):
        result = seek_to(_node_events(10), [], 0)
        assert result["nodes"] == []
        assert result["edges"] == []

    def test_seek_to_end_has_all_nodes(self):
        events = _node_events(8)
        result = seek_to(events, [], 8)
        assert len(result["nodes"]) == 8

    def test_seek_to_middle(self):
        events = _node_events(10)
        result = seek_to(events, [], 5)
        assert len(result["nodes"]) == 5

    def test_seek_uses_snapshot(self):
        """
        Snapshot at event_count=5 means seekTo(8) loads 5 nodes from
        the snapshot and applies events[5], [6], [7] → 8 nodes total.
        """
        events   = _node_events(10)
        graph_5  = {"nodes": [], "edges": []}
        for i in range(5):
            graph_5 = apply_event(graph_5, events[i])

        snapshots = [{
            "snapshot_id":   1,
            "event_count":   5,
            "snapshot_time": "2026-03-17 14:05:00",
            "graph_json":    json.dumps(graph_5),
        }]

        result = seek_to(events, snapshots, 8)
        assert len(result["nodes"]) == 8

    def test_snapshot_after_target_is_ignored(self):
        """A snapshot at event_count=10 must not be used when target=5."""
        events = _node_events(15)
        snapshots = [{
            "snapshot_id":  1,
            "event_count":  10,
            "snapshot_time": "2026-03-17 14:10:00",
            "graph_json":   json.dumps({"nodes": [], "edges": []}),
        }]
        result = seek_to(events, snapshots, 5)
        assert len(result["nodes"]) == 5  # replayed from 0, not from snapshot

    def test_seek_multiple_snapshots_picks_nearest(self):
        """With snapshots at 10 and 25, seekTo(28) should use the one at 25."""
        events  = _node_events(35)

        graph_10 = {"nodes": [], "edges": []}
        for i in range(10):
            graph_10 = apply_event(graph_10, events[i])

        graph_25 = graph_10
        for i in range(10, 25):
            graph_25 = apply_event(graph_25, events[i])

        snapshots = [
            {"snapshot_id": 1, "event_count": 10,
             "snapshot_time": "T", "graph_json": json.dumps(graph_10)},
            {"snapshot_id": 2, "event_count": 25,
             "snapshot_time": "T", "graph_json": json.dumps(graph_25)},
        ]

        result = seek_to(events, snapshots, 28)
        assert len(result["nodes"]) == 28  # 25 from snap + 3 applied


# =============================================================================
# Integration: 30-event sequence (mirrors Week 4 test)
# =============================================================================

class TestIntegration:

    def _build_events(self):
        events = []
        for i in range(25):
            events.append(make_event(
                "NODE_ADDED", node_id=f"node-{i}", event_id=i+1,
                event_data={"nodeType": "DATA_LOADING",
                            "position": {"x": i*50, "y": 100}}
            ))
        for i in range(5):
            events.append(make_event(
                "PARAM_CHANGED", node_id="node-0", event_id=26+i,
                event_data={"paramName": "threshold",
                            "oldValue": i, "newValue": i+1}
            ))
        return events

    def test_after_25_events_25_nodes(self):
        events = self._build_events()
        graph  = {"nodes": [], "edges": []}
        for e in events[:25]:
            graph = apply_event(graph, e)
        assert len(graph["nodes"]) == 25

    def test_after_30_events_still_25_nodes(self):
        """PARAM_CHANGED doesn't add nodes."""
        events = self._build_events()
        graph  = {"nodes": [], "edges": []}
        for e in events:
            graph = apply_event(graph, e)
        assert len(graph["nodes"]) == 25

    def test_param_applied_after_all_30(self):
        """After 5 PARAM_CHANGED events on node-0, threshold should be 5."""
        events = self._build_events()
        graph  = {"nodes": [], "edges": []}
        for e in events:
            graph = apply_event(graph, e)
        n0 = next(n for n in graph["nodes"] if n["id"] == "node-0")
        assert n0["data"].get("threshold") == 5

    def test_seek_with_snapshot_at_25(self):
        events  = self._build_events()
        graph_25 = {"nodes": [], "edges": []}
        for e in events[:25]:
            graph_25 = apply_event(graph_25, e)

        snapshots = [{
            "snapshot_id":   1,
            "event_count":   25,
            "snapshot_time": "T",
            "graph_json":    json.dumps(graph_25),
        }]

        # seekTo(25) via snapshot should match step-by-step
        result_via_seek = seek_to(events, snapshots, 25)
        assert len(result_via_seek["nodes"]) == 25

        # seekTo(30) replays 5 more events
        result_30 = seek_to(events, snapshots, 30)
        assert len(result_30["nodes"]) == 25  # no new nodes added
        n0 = next(n for n in result_30["nodes"] if n["id"] == "node-0")
        assert n0["data"].get("threshold") == 5

    def test_step_backward_from_30_to_29(self):
        """
        Stepping backward from cursor=30 to 29 = seekTo(29).
        The snapshot at 25 is loaded, then events[25..28] applied.
        After events[25..28] (4 PARAM_CHANGED), threshold = 4.
        """
        events  = self._build_events()
        graph_25 = {"nodes": [], "edges": []}
        for e in events[:25]:
            graph_25 = apply_event(graph_25, e)

        snapshots = [{
            "snapshot_id":   1,
            "event_count":   25,
            "snapshot_time": "T",
            "graph_json":    json.dumps(graph_25),
        }]

        result = seek_to(events, snapshots, 29)  # cursor-1 = 29
        n0 = next(n for n in result["nodes"] if n["id"] == "node-0")
        assert n0["data"].get("threshold") == 4