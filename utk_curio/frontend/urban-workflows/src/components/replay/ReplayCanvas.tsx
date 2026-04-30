import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Controls,
  Node,
  Edge,
  MarkerType,
  useReactFlow,
  NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { getAllNodeTypes } from '../../registry';
import UniversalBox from '../UniversalBox';
import BiDirectionalEdge from '../edges/BiDirectionalEdge';
import UniDirectionalEdge from '../edges/UniDirectionalEdge';
import { EdgeType } from '../../constants';
import {
  ReplayEngineState,
  ReplayNode,
  ReplayEdge,
} from '../../replay/ReplayTypes';

const AMBER = '#f59e0b';
const AMBER_GLOW = 'rgba(245,158,11,0.22)';
const EDGE_NORM = '#4b5563';
const BG_MID = '#1E1F23';
const BG_DARK = '#111113';
const BORDER = '#2a2b30';

const ET_CFG: Record<string, { icon: string; label: string; bg: string; text: string }> = {
  SESSION_STARTED:     { icon: '●', label: 'Session started',   bg: '#1e293b', text: '#94a3b8' },
  SESSION_RESTORED:    { icon: '⏮', label: 'Session restored',  bg: '#1e293b', text: '#94a3b8' },
  NODE_ADDED:          { icon: '+', label: 'Node added',        bg: '#052e16', text: '#4ade80' },
  NODE_REMOVED:        { icon: '−', label: 'Node removed',      bg: '#450a0a', text: '#f87171' },
  NODE_MOVED:          { icon: '↕', label: 'Node moved',        bg: '#172554', text: '#93c5fd' },
  EDGE_CREATED:        { icon: '→', label: 'Edge created',      bg: '#3b0764', text: '#e879f9' },
  EDGE_REMOVED:        { icon: '✕', label: 'Edge removed',      bg: '#431407', text: '#fdba74' },
  PARAM_CHANGED:       { icon: '⚙', label: 'Param changed',     bg: '#422006', text: '#fbbf24' },
  NODE_EXECUTED:       { icon: '▶', label: 'Node executed',     bg: '#2e1065', text: '#c4b5fd' },
  EXECUTION_COMPLETED: { icon: '✓', label: 'Execution done',    bg: '#022c22', text: '#34d399' },
};

function et(type: string) {
  return ET_CFG[type] ?? { icon: '·', label: type, bg: '#1f2937', text: '#9ca3af' };
}

function ReplayNodeWrapper(props: NodeProps) {
  const dimmed = props.data?._dimmed === true;
  const changed = props.data?._changed === true;

  return (
    <div
      style={{
        position: 'relative',
        opacity: dimmed ? 0.42 : 1,
        transition: 'opacity 0.2s ease',
        outline: changed ? `2.5px solid ${AMBER}` : 'none',
        outlineOffset: '2px',
        borderRadius: '8px',
        boxShadow: changed ? `0 0 0 5px ${AMBER_GLOW}` : 'none',
      }}
    >
      <UniversalBox {...props} isConnectable={false} />
    </div>
  );
}

function buildNodeTypes() {
  const types: Record<string, any> = {};
  for (const desc of getAllNodeTypes()) {
    if (desc.adapter) {
      types[desc.id] = ReplayNodeWrapper;
    }
  }
  return types;
}

const REPLAY_NODE_TYPES = buildNodeTypes();

const REPLAY_EDGE_TYPES = {
  [EdgeType.BIDIRECTIONAL_EDGE]: BiDirectionalEdge,
  [EdgeType.UNIDIRECTIONAL_EDGE]: UniDirectionalEdge,
};

export interface ReplayCallbacks {
  outputCallback: (...args: any[]) => void;
  interactionsCallback: (...args: any[]) => void;
  propagationCallback: (...args: any[]) => void;
  pythonInterpreter: any;
}

function toRFNode(rn: ReplayNode, cbacks: ReplayCallbacks): Node {
  return {
    id: rn.id,
    type: rn.type ?? 'default',
    position: rn.position,
    data: {
      ...rn.data,

      nodeId: rn.data.nodeId ?? rn.id,
      nodeType: rn.type ?? rn.data.nodeType ?? '',
      input: rn.data.input ?? '',
      source: rn.data.source ?? '',
      output: rn.data.output ?? '',
      code: rn.data.code ?? rn.data.defaultCode ?? '',
      defaultCode: rn.data.defaultCode ?? rn.data.code ?? '',

      ...cbacks,

      replayMode: true,
      replayChanged: rn._changed,
      _changed: rn._changed,
      _dimmed: rn._dimmed,
    },
    draggable: false,
    selectable: true,
    connectable: false,
    style: {
      background: 'transparent',
      border: 'none',
      padding: 0,
    },
  };
}

function toRFEdge(re: ReplayEdge): Edge {
  const changed = re._changed === true;

  return {
    id: re.id,
    source: re.source,
    target: re.target,
    sourceHandle: re.sourceHandle ?? undefined,
    targetHandle: re.targetHandle ?? undefined,
    type: re.type ?? 'default',
    animated: changed,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: changed ? AMBER : EDGE_NORM,
      width: 18,
      height: 18,
    },
    style: {
      stroke: changed ? AMBER : EDGE_NORM,
      strokeWidth: changed ? 2.5 : 1.5,
    },
  };
}

interface ReplayCanvasProps {
  engineState: ReplayEngineState;
  replayCallbacks: ReplayCallbacks;
  onClose?: () => void;
}

export const ReplayCanvas: React.FC<ReplayCanvasProps> = ({
  engineState,
  replayCallbacks,
  onClose,
}) => {
  const {
    currentGraph,
    cursor,
    events,
    loading,
    error,
    loaded,
  } = engineState;

  const { fitView } = useReactFlow();
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentGraph.nodes.length === 0) return;

    const id = setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
    }, 60);

    return () => clearTimeout(id);
  }, [cursor, currentGraph.nodes.length, fitView]);

  useEffect(() => {
    if (!timelineRef.current || cursor === 0) return;

    const el = timelineRef.current.querySelector(`[data-idx="${cursor - 1}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [cursor]);

  const callbacksRef = useRef(replayCallbacks);

  useEffect(() => {
    callbacksRef.current = replayCallbacks;
  }, [replayCallbacks]);

  // Ref holds current preview edges so the output callback can read them without stale closures.
  const replayEdgesRef = useRef(currentGraph.edges);

  // Local node state so preview executions can push outputs to downstream nodes.
  const [localNodes, setLocalNodes] = useState<Node[]>([]);

  // When a node produces output, find downstream nodes via preview edges and update them directly.
  const replayOutputCallback = useCallback((nodeId: string, output: string) => {
    const affected = replayEdgesRef.current
      .filter(e => e.source === nodeId && !(e.sourceHandle === 'in/out' && e.targetHandle === 'in/out'))
      .map(e => e.target);
    setLocalNodes(nds => nds.map(n =>
      affected.includes(n.id) ? { ...n, data: { ...n.data, input: output, source: nodeId } } : n
    ));
    callbacksRef.current.outputCallback(nodeId, output);
  }, []);

  // Sync local nodes and the edge ref whenever the replay cursor moves to a new step.
  useEffect(() => {
    replayEdgesRef.current = currentGraph.edges;
    const cbs: ReplayCallbacks = { ...callbacksRef.current, outputCallback: replayOutputCallback };
    setLocalNodes(currentGraph.nodes.map(n => toRFNode(n, cbs)));
  }, [currentGraph, replayOutputCallback]);

  const rfEdges = useMemo(
    () => currentGraph.edges.map(toRFEdge),
    [currentGraph.edges]
  );

  const total = events.length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'transparent',
      }}
    >
      <style>{`
        .replay-transparent-flow,
        .replay-transparent-flow .react-flow,
        .replay-transparent-flow .react-flow__renderer,
        .replay-transparent-flow .react-flow__pane,
        .replay-transparent-flow .react-flow__viewport {
          background: transparent !important;
        }

        .replay-transparent-flow .react-flow__pane,
        .replay-transparent-flow .react-flow__controls {
          pointer-events: all !important;
        }
      `}</style>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
          background: 'transparent',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '7px 14px',
            background: BG_MID,
            flexShrink: 0,
            borderTop: 'none',
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: AMBER,
              color: '#111',
              fontWeight: 800,
              fontSize: '11px',
              padding: '3px 9px',
              borderRadius: '5px',
              letterSpacing: '0.5px',
              whiteSpace: 'nowrap',
            }}
          >
            ◷ REPLAY MODE
          </span>

          <span
            style={{
              color: '#e5e7eb',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}
          >
            Step {cursor} / {total}
          </span>

          <span style={{ width: '1px', height: '18px', background: '#374151' }} />

          <span
            style={{
              color: '#9ca3af',
              fontSize: '12px',
              whiteSpace: 'nowrap',
            }}
          >
            Interactive preview — nodes are runnable
          </span>

          {loaded && (
            <span
              style={{
                marginLeft: 'auto',
                color: AMBER,
                fontSize: '10px',
                fontFamily: 'monospace',
              }}
            >
              {currentGraph.nodes.length} nodes · {currentGraph.edges.length} edges
            </span>
          )}
        </div>

        <div
          className="replay-transparent-flow"
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            background: 'transparent',
          }}
        >
          {loading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.30)',
                color: '#e5e7eb',
                fontSize: '14px',
              }}
            >
              Loading session…
            </div>
          )}

          {error && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.55)',
                color: '#f87171',
                fontSize: '13px',
                padding: '20px',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  Failed to load session
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                  {error}
                </div>
              </div>
            </div>
          )}

          {loaded && !loading && !error && cursor === 0 && events.length > 0 && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 6,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'rgba(17,17,19,0.78)',
                border: `1px solid rgba(245,158,11,0.55)`,
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                borderRadius: '10px',
                padding: '12px 18px',
                color: '#e5e7eb',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <span style={{ color: AMBER, fontSize: '16px' }}>⏸</span>
              Replay preview is paused. Press Play to start.
            </div>
          )}

          <ReactFlow
            nodeTypes={REPLAY_NODE_TYPES}
            edgeTypes={REPLAY_EDGE_TYPES}
            nodes={localNodes}
            edges={rfEdges}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
            panOnDrag={true}
            zoomOnScroll={true}
            zoomOnPinch={true}
            fitView={false}
            minZoom={0.05}
            maxZoom={1.5}
            attributionPosition="bottom-left"
          >
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>

      <div
        style={{
          width: '260px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          background: BG_DARK,
          borderLeft: `1px solid ${BORDER}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 12px 10px 14px',
            background: BG_MID,
            borderBottom: `1px solid ${BORDER}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#e5e7eb',
                fontSize: '13px',
                fontWeight: 800,
                minWidth: 0,
              }}
            >
              <span style={{ color: AMBER, fontSize: '15px' }}>◷</span>
              <span style={{ whiteSpace: 'nowrap' }}>Event Timeline</span>
            </div>

            {onClose && (
              <button
                onClick={onClose}
                title="Close replay"
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 800,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                }}
              >
                × Close
              </button>
            )}
          </div>

          <div
            style={{
              marginTop: '5px',
              marginLeft: '23px',
              color: '#6b7280',
              fontSize: '10px',
              fontFamily: 'monospace',
            }}
          >
            {events.length} events
          </div>
        </div>

        <div
          ref={timelineRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '10px 0',
            scrollbarWidth: 'thin',
            scrollbarColor: '#374151 transparent',
          }}
        >
          {events.length === 0 && (
            <div
              style={{
                padding: '20px 12px',
                color: '#6b7280',
                fontSize: '12px',
                textAlign: 'center',
              }}
            >
              Load a session
            </div>
          )}

          {events.map((ev, idx) => {
            const isCurrent = idx === cursor - 1;
            const isPast = idx < cursor - 1;
            const cfg = et(ev.event_type);

            return (
              <div
                key={ev.event_id}
                data-idx={idx}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '8px 14px',
                  background: isCurrent ? 'rgba(245,158,11,0.10)' : 'transparent',
                  borderLeft: `3px solid ${isCurrent ? AMBER : 'transparent'}`,
                  opacity: isPast ? 0.68 : 1,
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: '26px',
                    display: 'flex',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {idx < events.length - 1 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '25px',
                        bottom: '-13px',
                        left: '50%',
                        width: '1px',
                        transform: 'translateX(-50%)',
                        borderLeft: `1px dashed ${AMBER}`,
                        opacity: 0.55,
                      }}
                    />
                  )}

                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '999px',
                      border: `1.5px solid ${isCurrent ? AMBER : '#4b5563'}`,
                      background: isCurrent ? AMBER : BG_DARK,
                      color: isCurrent ? '#111' : '#e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 800,
                      fontFamily: 'monospace',
                      zIndex: 1,
                    }}
                  >
                    {idx + 1}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 0, paddingTop: '2px' }}>
                  <div
                    style={{
                      color: '#e5e7eb',
                      fontSize: '12px',
                      fontWeight: isCurrent ? 800 : 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {cfg.label}
                  </div>

                  <div
                    style={{
                      marginTop: '3px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: isCurrent ? 'rgba(245,158,11,0.18)' : cfg.bg,
                      color: isCurrent ? AMBER : cfg.text,
                      border: isCurrent ? `1px solid ${AMBER}` : '1px solid transparent',
                      borderRadius: '4px',
                      padding: '1px 5px',
                      fontSize: '9px',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      maxWidth: '100%',
                    }}
                  >
                    <span>{cfg.icon}</span>
                    <span>{ev.event_type.replace(/_/g, ' ')}</span>
                  </div>

                  {isCurrent && ev.event_time && (
                    <div
                      style={{
                        marginTop: '3px',
                        color: AMBER,
                        fontSize: '9px',
                        fontFamily: 'monospace',
                      }}
                    >
                      {ev.event_time.slice(11, 19)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ReplayCanvas;