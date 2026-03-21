import React, { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  MarkerType,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  ReplayEngineState,
  ReplayNode,
  ReplayEdge,
} from '../../replay/ReplayTypes';

const CHANGED_BORDER  = '#f59e0b';
const CHANGED_BG      = '#fefce8';
const CHANGED_SHADOW  = 'rgba(245, 158, 11, 0.35)';
const NORMAL_BORDER   = '#94a3b8';
const NORMAL_BG       = '#ffffff';
const DIMMED_BORDER   = '#cbd5e1';
const DIMMED_BG       = '#f8fafc';

function toRFNode(rn: ReplayNode): Node {
  const changed = rn._changed === true;
  const dimmed  = rn._dimmed  === true;
  const displayId = rn.id.length > 18 ? rn.id.slice(0, 18) + '…' : rn.id;
  const nodeType  = rn.type ?? 'node';

  return {
    id:       rn.id,
    type:     'default',
    position: rn.position,
    data: {
      label: (
        <div style={{ padding: '2px 0', textAlign: 'center' }}>
          <div style={{
            fontSize:     '9px',
            color:        changed ? '#92400e' : '#64748b',
            fontFamily:   'monospace',
            marginBottom: '3px',
            letterSpacing: '0.3px',
          }}>
            {nodeType.replace(/_/g, ' ')}
          </div>
          <div style={{
            fontSize:   '11px',
            fontWeight: 600,
            color:      changed ? '#78350f' : '#374151',
            fontFamily: 'monospace',
          }}>
            {displayId}
          </div>
          {rn.data._executing && (
            <div style={{ fontSize: '9px', color: '#7c3aed', marginTop: '2px' }}>
              ⟳ running
            </div>
          )}
          {rn.data._execSuccess === false && (
            <div style={{ fontSize: '9px', color: '#dc2626', marginTop: '2px' }}>
              ✕ failed
            </div>
          )}
          {rn.data._execSuccess === true && (
            <div style={{ fontSize: '9px', color: '#16a34a', marginTop: '2px' }}>
              ✓ done
            </div>
          )}
        </div>
      ),
    },
    draggable:   false,
    selectable:  true,
    connectable: false,
    style: {
      border:       changed ? `2.5px solid ${CHANGED_BORDER}` : `1px solid ${dimmed ? DIMMED_BORDER : NORMAL_BORDER}`,
      borderRadius: '8px',
      background:   changed ? CHANGED_BG : dimmed ? DIMMED_BG : NORMAL_BG,
      opacity:      dimmed ? 0.42 : 1,
      boxShadow:    changed ? `0 0 0 3px ${CHANGED_SHADOW}` : '0 1px 3px rgba(0,0,0,0.08)',
      transition:   'all 0.2s ease',
      minWidth:     '130px',
      cursor:       'default',
    },
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
      border:        '1.5px solid #e2e8f0',
      borderRadius:  '10px',
      overflow:      'hidden',
      background:    '#f8fafc',
    }}>
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        '10px',
        padding:    '7px 14px',
        background: '#1e3a5f',
        flexShrink: 0,
      }}>
        <span style={{
          background:   '#1a8f8a',
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
          Read-only — interactions disabled
        </span>
        {loaded && (
          <span style={{
            marginLeft: 'auto',
            color:      '#64748b',
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
            background: 'rgba(248,250,252,0.6)',
            zIndex:     5,
            color:      '#94a3b8',
            fontSize:   '14px',
            pointerEvents: 'none',
          }}>
            Press ▶ Play or → to start replay
          </div>
        )}

        <ReactFlow
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
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(node) => {
              const rn = currentGraph.nodes.find(n => n.id === node.id);
              if (rn?._changed) return CHANGED_BORDER;
              if (rn?._dimmed)  return DIMMED_BORDER;
              return NORMAL_BORDER;
            }}
            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0' }}
          />
        </ReactFlow>
      </div>

      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          '10px',
        padding:      '5px 14px',
        background:   '#f1f5f9',
        borderTop:    '1px solid #e2e8f0',
        flexShrink:   0,
        fontSize:     '11px',
        fontFamily:   'monospace',
        color:        '#64748b',
        minHeight:    '28px',
      }}>
        <span style={{ fontWeight: 700, color: '#374151' }}>{stepLabel}</span>
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