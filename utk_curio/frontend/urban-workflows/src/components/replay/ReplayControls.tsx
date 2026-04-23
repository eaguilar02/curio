import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ReplayEngine }        from '../../replay/ReplayEngine';
import { ReplayEngineState, ReplayEvent }   from '../../replay/ReplayTypes';

const PLAY_INTERVAL_MS = 800;

const ET_COLOUR: Record<string, { bg: string; text: string }> = {
  SESSION_STARTED:     { bg: '#ede9fe', text: '#4c1d95' },
  SESSION_RESTORED:    { bg: '#e0f2fe', text: '#0c4a6e' },
  NODE_ADDED:          { bg: '#d1fae5', text: '#065f46' },
  NODE_REMOVED:        { bg: '#fee2e2', text: '#7f1d1d' },
  NODE_MOVED:          { bg: '#dbeafe', text: '#1e3a8a' },
  EDGE_CREATED:        { bg: '#fce7f3', text: '#831843' },
  EDGE_REMOVED:        { bg: '#ffedd5', text: '#7c2d12' },
  PARAM_CHANGED:       { bg: '#fef9c3', text: '#713f12' },
  NODE_EXECUTED:       { bg: '#ede9fe', text: '#3730a3' },
  EXECUTION_COMPLETED: { bg: '#ccfbf1', text: '#134e4a' },
};

function etStyle(type: string) {
  return ET_COLOUR[type] ?? { bg: '#f1f5f9', text: '#475569' };
}

interface ReplayControlsProps {
  engine:      ReplayEngine;
  engineState: ReplayEngineState;
  onRestore?:  (nodes: any[], edges: any[]) => void;
}

export const ReplayControls: React.FC<ReplayControlsProps> = ({ engine, engineState, onRestore }) => {
  const { cursor, events, loaded, loading } = engineState;
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  const stopPlay = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsPlaying(false);
  }, []);

  const startPlay = useCallback(() => {
    if (engine.atEnd) return;
    setIsPlaying(true);
    timerRef.current = setInterval(() => {
      const advanced = engine.stepForward();
      if (!advanced) stopPlay();
    }, PLAY_INTERVAL_MS);
  }, [engine, stopPlay]);

  useEffect(() => {
    if (engine.atEnd && isPlaying) stopPlay();
  }, [cursor, engine.atEnd, isPlaying, stopPlay]);

  useEffect(() => () => stopPlay(), [stopPlay]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${cursor - 1}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [cursor]);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
    if (e.key === 'ArrowRight') { stopPlay(); engine.stepForward(); }
    if (e.key === 'ArrowLeft')  { stopPlay(); engine.stepBackward(); }
    if (e.key === ' ')          { e.preventDefault(); isPlaying ? stopPlay() : startPlay(); }
    if (e.key === 'Home')       { stopPlay(); engine.seekToStart(); }
    if (e.key === 'End')        { stopPlay(); engine.seekToEnd(); }
  }, [engine, isPlaying, startPlay, stopPlay]);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const dis     = !loaded || loading;
  const total   = events.length;
  const current = events[cursor - 1] as ReplayEvent | undefined;

  const btnBase = (disabled: boolean): React.CSSProperties => ({
    padding:      '5px 11px',
    fontSize:     '14px',
    borderRadius: '5px',
    border:       'none',
    cursor:       disabled ? 'not-allowed' : 'pointer',
    opacity:      disabled ? 0.38 : 1,
    background:   '#1e3a5f',
    color:        '#fff',
    transition:   'opacity 0.15s',
    lineHeight:   1,
  });

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      gap:           '10px',
      padding:       '12px',
      background:    '#ffffff',
      border:        '1.5px solid #e2e8f0',
      borderRadius:  '10px',
      fontFamily:    'Arial, sans-serif',
    }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <button
          onClick={() => { stopPlay(); engine.seekToStart(); }}
          disabled={dis || engine.atStart}
          style={btnBase(dis || engine.atStart)}
          title="Skip to start (Home)"
        >⏮</button>

        <button
          onClick={() => { stopPlay(); engine.stepBackward(); }}
          disabled={dis || engine.atStart}
          style={btnBase(dis || engine.atStart)}
          title="Step backward (←)"
        >◀</button>

        <button
          onClick={() => isPlaying ? stopPlay() : startPlay()}
          disabled={dis || engine.atEnd}
          style={{
            ...btnBase(dis || engine.atEnd),
            background: isPlaying ? '#dc2626' : '#f59e0b',
            padding:    '5px 16px',
            fontWeight: 700,
            fontSize:   '13px',
          }}
          title="Play / Pause (Space)"
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>

        <button
          onClick={() => { stopPlay(); engine.stepForward(); }}
          disabled={dis || engine.atEnd}
          style={btnBase(dis || engine.atEnd)}
          title="Step forward (→)"
        >▶▶</button>

        <button
          onClick={() => { stopPlay(); engine.seekToEnd(); }}
          disabled={dis || engine.atEnd}
          style={btnBase(dis || engine.atEnd)}
          title="Skip to end (End)"
        >⏭</button>

        <span style={{
          marginLeft: 'auto',
          fontSize:   '12px',
          fontWeight: 700,
          color:      '#374151',
          fontFamily: 'monospace',
          minWidth:   '70px',
          textAlign:  'right',
        }}>
          {cursor} / {total}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={total || 1}
        value={cursor}
        disabled={dis}
        onChange={e => { stopPlay(); engine.seekTo(parseInt(e.target.value, 10)); }}
        style={{ width: '100%', cursor: dis ? 'not-allowed' : 'pointer', accentColor: '#1a8f8a' }}
        title={`Seek to step (current: ${cursor})`}
      />

      {current && (() => {
        const s = etStyle(current.event_type);
        return (
          <div style={{
            display:    'flex',
            alignItems: 'center',
            gap:        '7px',
            fontSize:   '11px',
            fontFamily: 'monospace',
            flexWrap:   'wrap',
          }}>
            <span style={{
              background:   s.bg,
              color:        s.text,
              borderRadius: '3px',
              padding:      '2px 7px',
              fontWeight:   700,
              fontSize:     '10px',
            }}>
              {current.event_type.replace(/_/g, ' ')}
            </span>
            {current.node_id && (
              <span style={{ color: '#64748b' }}>{current.node_id.slice(0, 24)}</span>
            )}
            <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>{current.event_time}</span>
          </div>
        );
      })()}

      <div style={{
        display:  'flex',
        gap:      '14px',
        fontSize: '10px',
        color:    '#94a3b8',
        flexWrap: 'wrap',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{
            display:      'inline-block',
            width:        '11px', height: '11px',
            background:   '#fefce8',
            border:       '2px solid #f59e0b',
            borderRadius: '2px',
          }}/>
          Changed this step
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{
            display:      'inline-block',
            width:        '11px', height: '11px',
            background:   '#f8fafc',
            border:       '1px solid #cbd5e1',
            borderRadius: '2px',
            opacity:      0.5,
          }}/>
          Unchanged (dimmed)
        </span>
        <span style={{ marginLeft: 'auto', color: '#cbd5e1' }}>← → Space = controls</span>
      </div>

      <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '2px' }}/>

      <div style={{
        fontSize:  '11px',
        fontWeight: 600,
        color:     '#374151',
        marginBottom: '-4px',
      }}>
        All events ({total})
      </div>

      <div
        ref={listRef}
        style={{
          maxHeight:  '300px',
          overflowY:  'auto',
          border:     '1px solid #f1f5f9',
          borderRadius: '6px',
          background: '#fafafa',
        }}
      >
        {events.length === 0 && (
          <div style={{ padding: '12px', color: '#94a3b8', fontSize: '11px', textAlign: 'center' }}>
            {loaded ? 'No events in this session' : 'Load a session to see events'}
          </div>
        )}
        {events.map((ev, idx) => {
          const isCurrent = idx === cursor - 1;
          const isPast    = idx < cursor - 1;
          const s         = etStyle(ev.event_type);
          return (
            <div
              key={ev.event_id}
              data-idx={idx}
              onClick={() => { stopPlay(); engine.seekTo(idx + 1); }}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          '6px',
                padding:      '5px 8px',
                background:   isCurrent ? '#fefce8' : 'transparent',
                borderLeft:   `3px solid ${isCurrent ? '#f59e0b' : isPast ? '#e2e8f0' : 'transparent'}`,
                opacity:      isPast ? 0.55 : 1,
                cursor:       'pointer',
                borderBottom: '1px solid #f8fafc',
                fontSize:     '10px',
                fontFamily:   'monospace',
                transition:   'background 0.1s',
              }}
            >
              <span style={{ color: '#94a3b8', minWidth: '22px', textAlign: 'right' }}>
                {idx + 1}
              </span>
              <span style={{
                background:   s.bg,
                color:        s.text,
                borderRadius: '2px',
                padding:      '1px 4px',
                fontWeight:   700,
                fontSize:     '9px',
                whiteSpace:   'nowrap',
                flexShrink:   0,
              }}>
                {ev.event_type.replace('_', ' ')}
              </span>
              <span style={{
                color:        '#64748b',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
                flex:         1,
              }}>
                {ev.node_id ? ev.node_id.slice(0, 16) : '—'}
              </span>
            </div>
          );
        })}
      </div>

      <button
        disabled={!loaded || engineState.currentGraph.nodes.length === 0}
        style={{
          width:        '100%',
          padding:      '7px',
          fontSize:     '13px',
          fontWeight:   700,
          borderRadius: '6px',
          border:       'none',
          cursor:       (!loaded || engineState.currentGraph.nodes.length === 0) ? 'not-allowed' : 'pointer',
          opacity:      (!loaded || engineState.currentGraph.nodes.length === 0) ? 0.38 : 1,
          background:   '#1e3a5f',
          color:        '#fff',
        }}
        onClick={() => {
          if (!window.confirm(`Restore canvas to step ${cursor} of ${total}?\n\nThis will replace the current workflow.`)) return;
          onRestore?.(engineState.currentGraph.nodes, engineState.currentGraph.edges);
        }}
      >
        Restore to step {cursor}
      </button>

      {loading && (
        <div style={{ fontSize: '11px', color: '#1a8f8a', textAlign: 'center' }}>
          Loading…
        </div>
      )}
    </div>

  );
};

export default ReplayControls;