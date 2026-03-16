import { EventBuffer } from './EventBuffer';
import {
  LogEvent,
  EventType,
  NodeAddedData,
  NodeRemovedData,
  NodeMovedData,
  EdgeCreatedData,
  EdgeRemovedData,
} from './types';

type RFNode = {
  id: string;
  type?: string;
  data?: { label?: string };
  position: { x: number; y: number };
};

type RFEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

type NodeChange =
  | { type: 'add'; item: RFNode }
  | { type: 'remove'; id: string }
  | { type: 'position'; id: string; position?: { x: number; y: number } }
  | { type: string; [key: string]: unknown };

type EdgeChange =
  | { type: 'add'; item: RFEdge }
  | { type: 'remove'; id: string }
  | { type: string; [key: string]: unknown };

export class EventInterceptor {
  private static instance: EventInterceptor | null = null;
  private buffer: EventBuffer;
  private lastPositions: Map<string, { x: number; y: number }> = new Map();

  private constructor() {
    this.buffer = EventBuffer.getInstance();
  }

  public static getInstance(): EventInterceptor {
    if (!EventInterceptor.instance) {
      EventInterceptor.instance = new EventInterceptor();
    }
    return EventInterceptor.instance;
  }

  public capture(event: LogEvent): void {
    this.buffer.enqueue(event);
  }

  public static now(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  public handleNodeChanges(changes: NodeChange[], nodes: RFNode[]): void {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    for (const change of changes) {
      switch (change.type) {

        case 'add': {
          const addChange = change as { type: 'add'; item: RFNode };
          const node = addChange.item;
          this.lastPositions.set(node.id, node.position);

          const data: NodeAddedData = {
            nodeType: node.type ?? 'unknown',
            position: node.position,
            label: node.data?.label ?? undefined,
          };

          this.capture({
            event_type: 'NODE_ADDED',
            node_id: node.id,
            event_time: EventInterceptor.now(),
            event_data: data,
          });
          break;
        }

        case 'remove': {
          const removeChange = change as { type: 'remove'; id: string };
          const existingNode = nodeMap.get(removeChange.id);
          this.lastPositions.delete(removeChange.id);

          const data: NodeRemovedData = {
            nodeType: existingNode?.type ?? undefined,
            label: existingNode?.data?.label ?? undefined,
          };

          this.capture({
            event_type: 'NODE_REMOVED',
            node_id: removeChange.id,
            event_time: EventInterceptor.now(),
            event_data: data,
          });
          break;
        }

        case 'position': {
          const posChange = change as {
            type: 'position';
            id: string;
            position?: { x: number; y: number };
          };

          if (!posChange.position) break;

          const from = this.lastPositions.get(posChange.id) ?? posChange.position;
          const to = posChange.position;

          if (Math.abs(from.x - to.x) < 2 && Math.abs(from.y - to.y) < 2) break;

          this.lastPositions.set(posChange.id, to);

          const data: NodeMovedData = { from, to };

          this.capture({
            event_type: 'NODE_MOVED',
            node_id: posChange.id,
            event_time: EventInterceptor.now(),
            event_data: data,
          });
          break;
        }

        default:
          break;
      }
    }
  }

  public handleEdgeChanges(changes: EdgeChange[], edges: RFEdge[]): void {
    const edgeMap = new Map(edges.map(e => [e.id, e]));

    for (const change of changes) {
      switch (change.type) {

        case 'add': {
          const addChange = change as { type: 'add'; item: RFEdge };
          const edge = addChange.item;
          this.captureEdgeCreated(edge);
          break;
        }

        case 'remove': {
          const removeChange = change as { type: 'remove'; id: string };
          const edge = edgeMap.get(removeChange.id);
          if (!edge) break;

          const data: EdgeRemovedData = {
            sourceNodeId: edge.source,
            targetNodeId: edge.target,
          };

          this.capture({
            event_type: 'EDGE_REMOVED',
            node_id: null,
            event_time: EventInterceptor.now(),
            event_data: data,
          });
          break;
        }

        default:
          break;
      }
    }
  }

  public captureEdgeCreated(edge: RFEdge): void {
    const data: EdgeCreatedData = {
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    };

    this.capture({
      event_type: 'EDGE_CREATED',
      node_id: null,
      event_time: EventInterceptor.now(),
      event_data: data,
    });
  }
}