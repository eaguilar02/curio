import {
  ReplayEngineState,
  ReplayEvent,
  ReplaySnapshot,
  GraphState,
  ReplayNode,
  ReplayEdge,
  EMPTY_STATE,
} from './ReplayTypes';

const API_BASE = 'http://localhost:5002';

export class ReplayEngine {
  private state: ReplayEngineState = { ...EMPTY_STATE, currentGraph: { nodes: [], edges: [] } };

  private readonly onChange: (state: ReplayEngineState) => void;

  constructor(onChange: (state: ReplayEngineState) => void) {
    this.onChange = onChange;
  }

  public getState(): ReplayEngineState {
    return this.state;
  }

  public get cursor(): number { return this.state.cursor; }
  public get totalEvents(): number { return this.state.events.length; }
  public get atStart(): boolean { return this.state.cursor === 0; }
  public get atEnd(): boolean { return this.state.cursor >= this.state.events.length; }
  public get progress(): number {
    return this.state.events.length === 0 ? 0
      : this.state.cursor / this.state.events.length;
  }

  public async loadSession(sessionId: number): Promise<void> {
    this.setState({ ...EMPTY_STATE, currentGraph: { nodes: [], edges: [] }, loading: true });

    try {
      const evRes = await fetch(
        `${API_BASE}/api/log/session/${sessionId}/events?limit=2000`
      );
      if (!evRes.ok) throw new Error(`Events fetch failed: HTTP ${evRes.status}`);
      const evData = await evRes.json();
      const events: ReplayEvent[] = (evData.events ?? []).sort(
        (a: ReplayEvent, b: ReplayEvent) => a.event_id - b.event_id
      );

      let snapshots: ReplaySnapshot[] = [];
      try {
        const snapRes = await fetch(
          `${API_BASE}/api/log/session/${sessionId}/snapshots`
        );
        if (snapRes.ok) {
          const snapData = await snapRes.json();
          snapshots = (snapData.snapshots ?? []).sort(
            (a: ReplaySnapshot, b: ReplaySnapshot) => a.event_count - b.event_count
          );
        }
      } catch {
        console.warn('[ReplayEngine] No snapshots found — will replay from event 0');
      }

      this.setState({
        events,
        snapshots,
        cursor: 0,
        currentGraph: { nodes: [], edges: [] },
        loading: false,
        error: null,
        loaded: true,
        lastAppliedEvent: null,
      });

      console.debug(
        `[ReplayEngine] session ${sessionId} loaded: ` +
        `${events.length} events, ${snapshots.length} snapshots`
      );

    } catch (err: any) {
      this.setState({
        ...EMPTY_STATE,
        currentGraph: { nodes: [], edges: [] },
        loading: false,
        error: err?.message ?? 'Failed to load session',
      });
    }
  }

  public stepForward(): boolean {
    const { cursor, events, currentGraph } = this.state;
    if (cursor >= events.length) return false;

    const event = events[cursor];
    const newGraph = ReplayEngine.applyEvent(currentGraph, event);

    this.setState({
      cursor: cursor + 1,
      currentGraph: newGraph,
      lastAppliedEvent: event,
    });
    return true;
  }

  public stepBackward(): boolean {
    if (this.state.cursor <= 0) return false;
    this.seekTo(this.state.cursor - 1);
    return true;
  }

  public seekTo(targetCursor: number): void {
    const { events, snapshots } = this.state;
    const target = Math.max(0, Math.min(targetCursor, events.length));

    let baseGraph: GraphState = { nodes: [], edges: [] };
    let startIdx = 0;

    for (let i = snapshots.length - 1; i >= 0; i--) {
      const snap = snapshots[i];
      if (snap.event_count <= target) {
        try {
          const parsed = JSON.parse(snap.graph_json) as GraphState;
          baseGraph = {
            nodes: (parsed.nodes ?? []).map(n => ({ ...n, _changed: false, _dimmed: false })),
            edges: (parsed.edges ?? []).map(e => ({ ...e, _changed: false })),
          };
          startIdx = snap.event_count;
          console.debug(
            `[ReplayEngine] seekTo(${target}): snapshot at event_count=${snap.event_count}`
          );
        } catch {
          console.warn('[ReplayEngine] Failed to parse snapshot graph_json — starting from 0');
        }
        break;
      }
    }

    let graph = baseGraph;
    let lastEvent: ReplayEvent | null = null;

    for (let i = startIdx; i < target; i++) {
      graph = ReplayEngine.applyEvent(graph, events[i]);
      lastEvent = events[i];
    }

    graph = ReplayEngine.applyHighlights(graph, lastEvent);

    this.setState({
      cursor: target,
      currentGraph: graph,
      lastAppliedEvent: lastEvent,
    });
  }

  public seekToStart(): void { this.seekTo(0); }
  public seekToEnd(): void { this.seekTo(this.state.events.length); }

  public static applyEvent(graph: GraphState, event: ReplayEvent): GraphState {
    let nodes: ReplayNode[] = graph.nodes.map(n => ({ ...n, _changed: false, _dimmed: true }));
    let edges: ReplayEdge[] = graph.edges.map(e => ({ ...e, _changed: false }));

    const data = event.event_data ?? {};

    switch (event.event_type) {
      case 'NODE_ADDED': {
        const newNode: ReplayNode = {
          id: event.node_id ?? `node-${event.event_id}`,
          type: data.nodeType ?? data.type ?? 'default',
          position: data.position ?? { x: 0, y: 0 },
          data: {
            label: data.label ?? data.nodeType ?? '',
            ...data,
          },
          _changed: true,
          _dimmed: false,
        };
        nodes = [...nodes, newNode];
        break;
      }

      case 'NODE_REMOVED': {
        const removedId = event.node_id;
        nodes = nodes.filter(n => n.id !== removedId);
        edges = edges.filter(
          e => e.source !== removedId && e.target !== removedId
        );
        break;
      }

      case 'NODE_MOVED': {
        const newPos = data.to ?? data.position;
        if (newPos && event.node_id) {
          nodes = nodes.map(n =>
            n.id === event.node_id
              ? { ...n, position: newPos, _changed: true, _dimmed: false }
              : n
          );
        }
        break;
      }

      case 'EDGE_CREATED': {
        const edgeId = event.edge_id ?? `edge-${event.event_id}`;
        if (!edges.find(e => e.id === edgeId)) {
          const newEdge: ReplayEdge = {
            id: edgeId,
            source: data.sourceNodeId ?? '',
            target: data.targetNodeId ?? '',
            sourceHandle: data.sourceHandle ?? null,
            targetHandle: data.targetHandle ?? null,
            type: 'default',
            _changed: true,
          };
          edges = [...edges, newEdge];
        }
        const src = data.sourceNodeId;
        const tgt = data.targetNodeId;
        nodes = nodes.map(n =>
          n.id === src || n.id === tgt
            ? { ...n, _changed: true, _dimmed: false }
            : n
        );
        break;
      }

      case 'EDGE_REMOVED': {
        const src = data.sourceNodeId;
        const tgt = data.targetNodeId;
        edges = edges.filter(e => !(e.source === src && e.target === tgt));
        nodes = nodes.map(n =>
          n.id === src || n.id === tgt
            ? { ...n, _changed: true, _dimmed: false }
            : n
        );
        break;
      }

      case 'PARAM_CHANGED': {
        if (event.node_id) {
          nodes = nodes.map(n =>
            n.id === event.node_id
              ? {
                  ...n,
                  data: { ...n.data, [data.paramName]: data.newValue },
                  _changed: true,
                  _dimmed: false,
                }
              : n
          );
        }
        break;
      }

      case 'NODE_EXECUTED': {
        if (event.node_id) {
          nodes = nodes.map(n =>
            n.id === event.node_id
              ? { ...n, data: { ...n.data, _executing: true }, _changed: true, _dimmed: false }
              : n
          );
        }
        break;
      }

      case 'EXECUTION_COMPLETED': {
        if (event.node_id) {
          nodes = nodes.map(n =>
            n.id === event.node_id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    _executing: false,
                    _execSuccess: data.success ?? true,
                    _execError: data.error ?? null,
                    _outputPath: (data as any).outputPath ?? n.data._outputPath ?? null,
                  },
                  _changed: true,
                  _dimmed: false,
                }
              : n
          );
        }
        break;
      }

      case 'SESSION_STARTED':
      default: {
        nodes = nodes.map(n => ({ ...n, _changed: false, _dimmed: false }));
        edges = edges.map(e => ({ ...e, _changed: false }));
        break;
      }
    }

    return { nodes: ReplayEngine.avoidOverlaps(nodes), edges };
  }

  private static readonly NODE_W = 290;
  private static readonly NODE_H = 150;
  private static readonly PADDING = 24;

  public static avoidOverlaps(nodes: ReplayNode[]): ReplayNode[] {
    if (nodes.length < 2) return nodes;
    const result = nodes.map(n => ({ ...n, position: { ...n.position } }));
    const W = ReplayEngine.NODE_W + ReplayEngine.PADDING;
    const H = ReplayEngine.NODE_H + ReplayEngine.PADDING;

    for (let iter = 0; iter < 10; iter++) {
      let moved = false;
      for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const a = result[i].position;
          const b = result[j].position;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const overlapX = W - Math.abs(dx);
          const overlapY = H - Math.abs(dy);
          if (overlapX > 0 && overlapY > 0) {
            const shift = overlapX < overlapY
              ? { x: (overlapX / 2 + 1) * Math.sign(dx || 1), y: 0 }
              : { x: 0, y: (overlapY / 2 + 1) * Math.sign(dy || 1) };
            result[i].position = { x: a.x - shift.x, y: a.y - shift.y };
            result[j].position = { x: b.x + shift.x, y: b.y + shift.y };
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return result;
  }

  public static applyHighlights(
    graph: GraphState,
    lastEvent: ReplayEvent | null
  ): GraphState {
    if (!lastEvent) {
      return {
        nodes: graph.nodes.map(n => ({ ...n, _changed: false, _dimmed: false })),
        edges: graph.edges.map(e => ({ ...e, _changed: false })),
      };
    }
    return graph;
  }

  private setState(patch: Partial<ReplayEngineState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }
}