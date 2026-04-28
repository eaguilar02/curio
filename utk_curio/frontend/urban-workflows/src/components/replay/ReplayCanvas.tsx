import React, { useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Node,
  Edge,
  MarkerType,
  BackgroundVariant,
  useReactFlow,
  NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  ReplayEngineState,
  ReplayNode,
  ReplayEdge,
} from '../../replay/ReplayTypes';
import { getAllNodeTypes } from '../../registry';
import UniversalBox from '../UniversalBox';

const CHANGED_BORDER = '#f59e0b';
const NORMAL_BORDER  = '#94a3b8';
const DIMMED_BORDER  = '#cbd5e1';

const NO_OP = () => {};

function ReplayNodeWrapper(props: NodeProps) {
  const dimmed = props.data?._dimmed === true;
  return (
    <div style={{ position: 'relative', opacity: dimmed ? 0.45 : 1, transition: 'opacity 0.2s' }}>
      <UniversalBox {...props} isConnectable={false} />
      {/* Transparent overlay blocks all clicks so replay stays read-only */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'default' }} />
    </div>
  );
}

function toRFNode(rn: ReplayNode): Node {
  return {
    id:       rn.id,
    type:     rn.type ?? 'default',
    position: rn.position,
    data: {
      ...rn.data,
      nodeId:               rn.data.nodeId ?? rn.id,
      nodeType:             rn.type ?? rn.data.nodeType,
      outputCallback:       NO_OP,
      propagationCallback:  NO_OP,
      interactionsCallback: NO_OP,
      _changed:             rn._changed,
      _dimmed:              rn._dimmed,
    },
    draggable:   false,
    selectable:  true,
    connectable: false,
    style: { background: 'transparent', border: 'none', padding: 0 },
  };
}

function toRFEdge(re: ReplayEdge): Edge {
  const changed = re._changed === true;
  return {
    id:           re.id,
    source:       re.source,
    target:       re.target,
    sourceHandle: re.sourceHandle ?? undefined,
    targetHandle: re.targetHandle ?? undefined,
    type:         'default',
    animated:     changed,
    markerEnd:    {
      type:  MarkerType.ArrowClosed,
      color: changed ? CHANGED_BORDER : NORMAL_BORDER,
      width: 18,
      height: 18,
    },
    style: {
      stroke:      changed ? CHANGED_BORDER : NORMAL_BORDER,
      strokeWidth: changed ? 2.5 : 1.5,
    },
  };
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  SESSION_STARTED:      '● Session started',
  SESSION_RESTORED:     '⏮ Session restored',
  NODE_ADDED:           '+ Node added',
  NODE_REMOVED:         '− Node removed',
  NODE_MOVED:           '↕ Node moved',
  EDGE_CREATED:         '→ Edge created',
  EDGE_REMOVED:         '✕ Edge removed',
  PARAM_CHANGED:        '⚙ Param changed',
  NODE_EXECUTED:        '▶ Node executed',
  EXECUTION_COMPLETED:  '✓ Execution done',
};

interface ReplayCanvasProps {
  engineState: ReplayEngineState;
}

export const ReplayCanvas: React.FC<ReplayCanvasProps> = ({ engineState }) => {
  const {
    currentGraph,
    cursor,
    events,
    loading,
    error,
    loaded,
    lastAppliedEvent,
  } = engineState;

  const { fitView } = useReactFlow();
  const nodeTypes = useMemo(() => {
    const types: Record<string, any> = {};
    for (const desc of getAllNodeTypes()) {
      types[desc.id] = ReplayNodeWrapper;
    }
    return types;
  }, []);

  // Refit view on every step so all nodes stay in frame
  useEffect(() => {
    if (currentGraph.nodes.length === 0) return;
    const id = setTimeout(() => fitView({ padding: 0.25, duration: 300 }), 50);
    return () => clearTimeout(id);
  }, [cursor, currentGraph.nodes.length, fitView]);

  const rfNodes: Node[] = useMemo(
    () => currentGraph.nodes.map(toRFNode),
    [currentGraph.nodes]
  );

  const rfEdges: Edge[] = useMemo(
    () => currentGraph.edges.map(toRFEdge),
    [currentGraph.edges]
  );

  const stepLabel   = `Step ${cursor} of ${events.length}`;
  const eventLabel  = lastAppliedEvent
    ? (EVENT_TYPE_LABELS[lastAppliedEvent.event_type] ?? lastAppliedEvent.event_type)
    : cursor === 0 ? 'Before first event' : 'End of session';
  const nodeLabel   = lastAppliedEvent?.node_id
    ? `· ${lastAppliedEvent.node_id.slice(0, 22)}`
    : '';
  const timeLabel   = lastAppliedEvent?.event_time ?? '';

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      width:         '100%',
      height:        '100%',
      overflow:      'hidden',
    }}>
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        '10px',
        padding:    '7px 14px',
        background: '#1E1F23',
        flexShrink: 0,
      }}>
        <span style={{
          background:   '#f59e0b',
          color:        '#fff',
          fontWeight:   700,
          fontSize:     '11px',
          padding:      '2px 8px',
          borderRadius: '4px',
          letterSpacing: '0.5px',
        }}>
          REPLAY
        </span>
        <span style={{ color: '#94a3b8', fontSize: '12px' }}>
        Preview Mode — Interactions Disabled
        </span>
        {loaded && (
          <span style={{
            marginLeft: '16px',
            color:      '#94a3b8',
            fontSize:   '11px',
            fontFamily: 'monospace',
          }}>
            {events.length} events · {engineState.snapshots.length} snapshots
          </span>
        )}
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && (
          <div style={{
            position:       'absolute', inset: 0,
            display:        'flex', alignItems: 'center', justifyContent: 'center',
            background:     'rgba(248,250,252,0.9)',
            zIndex:         10,
            fontSize:       '14px',
            color:          '#64748b',
            fontFamily:     'Arial, sans-serif',
          }}>
            Loading session…
          </div>
        )}

        {error && (
          <div style={{
            position:   'absolute', inset: 0,
            display:    'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.9)',
            zIndex:     10,
            color:      '#dc2626',
            fontSize:   '13px',
            padding:    '20px',
            textAlign:  'center',
          }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: '8px' }}>Failed to load session</div>
              <div style={{ fontFamily: 'monospace', fontSize: '11px' }}>{error}</div>
            </div>
          </div>
        )}

        {loaded && !loading && !error && cursor === 0 && events.length > 0 && (
          <div style={{
            position:   'absolute', inset: 0,
            display:    'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(2, 2, 2, 0.67)',
            zIndex:     5,
            color:      '#94a3b8',
            fontSize:   '14px',
            pointerEvents: 'none',
          }}>
            Press ▶ Play or → To Start Replay Preview 
          </div>
        )}

        {/* Persistent read-only watermark */}
        <div style={{
          position:      'absolute',
          top:           12,
          right:         12,
          zIndex:        20,
          pointerEvents: 'none',
          display:       'flex',
          alignItems:    'center',
          gap:           '6px',
          background:    'rgba(245,158,11,0.15)',
          border:        '1px solid rgba(245,158,11,0.4)',
          borderRadius:  '6px',
          padding:       '4px 10px',
          backdropFilter:'blur(4px)',
        }}>
          <span style={{ fontSize: '10px', color: '#f59e0b' }}>●</span>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.5px' }}>
            REPLAY — READ ONLY
          </span>
        </div>

        <ReactFlow
          nodeTypes={nodeTypes}
          nodes={rfNodes}
          edges={rfEdges}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          panOnDrag={true}
          zoomOnScroll={true}
          zoomOnPinch={true}
          fitView={true}
          fitViewOptions={{ padding: 0.25, duration: 200 }}
          attributionPosition="bottom-left"
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="#e2e8f0"
            gap={20}
            size={1}
          />
        </ReactFlow>
      </div>

      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          '10px',
        padding:      '5px 14px 5px 60px',
        background:   '#f1f5f9',
        borderTop:    '1px solid #e2e8f0',
        flexShrink:   0,
        fontSize:     '11px',
        fontFamily:   'monospace',
        color:        '#64748b',
        minHeight:    '28px',
      }}>
        <span style={{fontWeight: 700, color: '#374151', marginLeft: '0' }}>{stepLabel}</span>
        <span style={{
          background:   lastAppliedEvent ? '#fefce8' : 'transparent',
          border:       lastAppliedEvent ? '1px solid #f59e0b' : 'none',
          borderRadius: '3px',
          padding:      lastAppliedEvent ? '1px 6px' : '0',
          color:        lastAppliedEvent ? '#92400e' : '#94a3b8',
        }}>
          {eventLabel}
        </span>
        {nodeLabel && <span style={{ color: '#94a3b8' }}>{nodeLabel}</span>}
        {timeLabel && (
          <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>{timeLabel}</span>
        )}
      </div>
    </div>
  );
};

export default ReplayCanvas;