export type EventType =
  | "NODE_ADDED"
  | "NODE_REMOVED"
  | "NODE_MOVED"
  | "EDGE_CREATED"
  | "EDGE_REMOVED"
  | "PARAM_CHANGED"
  | "NODE_EXECUTED"
  | "EXECUTION_COMPLETED"
  | "SESSION_STARTED"
  | "SESSION_RESTORED";


export interface NodeAddedData {
  nodeType: string;          
  position: { x: number; y: number };
  label?: string;
}

export interface NodeRemovedData {
  nodeType?: string;
  label?: string;
}

export interface NodeMovedData {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface EdgeCreatedData {
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface EdgeRemovedData {
  sourceNodeId: string;
  targetNodeId: string;
}

export interface ParamChangedData {
  paramName: string;         
  oldValue: unknown;         
  newValue: unknown;         
  widgetType?: string;        
}

export interface NodeExecutedData {
  executionId?: string;      
  triggerSource?: string;    
}

export interface ExecutionCompletedData {
  executionId?: string;
  success: boolean;
  durationMs?: number;
  error?: string;
  outputPath?: string;
}

export interface SessionStartedData {
  userAgent: string;
  workflowId?: number | null;
}

export interface SessionRestoredData {
  nodeCount: number;
  edgeCount: number;
}

export type AnyEventData =
  | NodeAddedData
  | NodeRemovedData
  | NodeMovedData
  | EdgeCreatedData
  | EdgeRemovedData
  | ParamChangedData
  | NodeExecutedData
  | ExecutionCompletedData
  | SessionStartedData
  | SessionRestoredData;


export interface LogEvent {
  event_type: EventType;
  node_id: string | null;
  event_time: string;
  event_data: AnyEventData;
}

export interface LogEventsBatchRequest {
  session_id: number;        
  events: LogEvent[];
}

export interface LoggingContextValue {
  sessionId: number | null;
  capture: (event: LogEvent) => void;
  startNewSession: (newName: string) => Promise<void>;
}