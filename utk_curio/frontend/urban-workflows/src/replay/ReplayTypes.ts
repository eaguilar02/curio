export interface ReplayEvent {
  event_id:     number;
  event_type:   string;
  node_id:      string | null;
  edge_id:      string | null;
  event_time:   string;
  event_data:   any;
  snapshot_ref: number | null;
}

export interface ReplaySnapshot {
  snapshot_id:   number;
  session_id:    number;
  event_count:   number;
  snapshot_time: string;
  graph_json:    string;
}

export interface SessionSummary {
  session_id:    number;
  user_id:       number | null;
  workflow_id:   number | null;
  workflow_name: string | null;
  session_start: string;
  session_end:   string | null;
  event_count:   number;
}

export interface ReplayNode {
  id:        string;
  type?:     string;
  position:  { x: number; y: number };
  data:      Record<string, any>;
  _changed?: boolean;
  _dimmed?:  boolean;
}

export interface ReplayEdge {
  id:            string;
  source:        string;
  target:        string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?:         string;
  _changed?:     boolean;
}

export interface GraphState {
  nodes: ReplayNode[];
  edges: ReplayEdge[];
}

export interface ReplayEngineState {
  events:           ReplayEvent[];
  snapshots:        ReplaySnapshot[];
  cursor:           number;
  currentGraph:     GraphState;
  loading:          boolean;
  error:            string | null;
  loaded:           boolean;
  lastAppliedEvent: ReplayEvent | null;
}

export const EMPTY_STATE: ReplayEngineState = {
  events:           [],
  snapshots:        [],
  cursor:           0,
  currentGraph:     { nodes: [], edges: [] },
  loading:          false,
  error:            null,
  loaded:           false,
  lastAppliedEvent: null,
};