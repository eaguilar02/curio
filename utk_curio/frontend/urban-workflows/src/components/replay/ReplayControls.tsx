import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ReplayEngine }      from '../../replay/ReplayEngine';
import { ReplayEngineState } from '../../replay/ReplayTypes';

const PLAY_INTERVAL_MS = 800;

const C = {
  bgBtn:  '#2a2b30',
  border: '#374151',
  amber:  '#f59e0b',
  text:   '#e5e7eb',
};

interface ReplayControlsProps {
  engine:      ReplayEngine;
  engineState: ReplayEngineState;
  onRestore?:  (nodes: any[], edges: any[]) => void;
  horizontal?: boolean;
}

export const ReplayControls: React.FC<ReplayControlsProps> = ({
  engine,
  engineState,
  onRestore,
  horizontal,
}) => {
  const { cursor, events, loaded, loading } = engineState;
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const dis             = !loaded || loading;
  const total           = events.length;
  const restoreDisabled = !loaded || engineState.currentGraph.nodes.length === 0;

  const btn = (disabled: boolean, accent = false): React.CSSProperties => ({
    width:          accent ? '42px' : '36px',
    height:         accent ? '36px' : '32px',
    padding:        0,
    fontSize:       accent ? '15px' : '13px',
    borderRadius:   '8px',
    border:         `1px solid ${disabled ? '#30343c' : accent ? C.amber : '#4b5563'}`,
    cursor:         disabled ? 'not-allowed' : 'pointer',
    opacity:        disabled ? 0.35 : 1,
    background:     accent ? C.amber : C.bgBtn,
    color:          accent ? '#111' : '#fff',
    transition:     'opacity 0.15s',
    lineHeight:     1,
    flexShrink:     0,
    fontWeight:     accent ? 800 : 600,
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
  });

  const handleRestore = () => {
    if (!window.confirm(`Restore canvas to step ${cursor} of ${total}?`)) return;
    onRestore?.(engineState.currentGraph.nodes, engineState.currentGraph.edges);
  };

  if (horizontal) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', overflow: 'hidden' }}>
        <button onClick={() => { stopPlay(); engine.seekToStart(); }}
          disabled={dis || engine.atStart} style={btn(dis || engine.atStart)} title="Start (Home)">⏮</button>
        <button onClick={() => { stopPlay(); engine.stepBackward(); }}
          disabled={dis || engine.atStart} style={btn(dis || engine.atStart)} title="Back (←)">◀</button>
        <button onClick={() => isPlaying ? stopPlay() : startPlay()}
          disabled={dis || engine.atEnd} style={btn(dis || engine.atEnd, true)} title="Play/Pause (Space)">
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button onClick={() => { stopPlay(); engine.stepForward(); }}
          disabled={dis || engine.atEnd} style={btn(dis || engine.atEnd)} title="Forward (→)">▶</button>
        <button onClick={() => { stopPlay(); engine.seekToEnd(); }}
          disabled={dis || engine.atEnd} style={btn(dis || engine.atEnd)} title="End (End)">⏭</button>

        <span style={{
          marginLeft: '10px', fontSize: '12px', fontWeight: 800,
          color: C.text, fontFamily: 'monospace', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          Step <span style={{ color: C.amber }}>{cursor}</span> / {total}
        </span>

        <input
          type="range" min={0} max={total || 1} value={cursor} disabled={dis}
          onChange={e => { stopPlay(); engine.seekTo(parseInt(e.target.value, 10)); }}
          style={{ flex: 1, minWidth: '120px', cursor: dis ? 'not-allowed' : 'pointer', accentColor: C.amber }}
        />

        <button
          disabled={restoreDisabled}
          onClick={handleRestore}
          style={{
            minWidth: '96px', height: '34px', padding: '0 14px',
            borderRadius: '8px',
            border:       `1px solid ${restoreDisabled ? '#30343c' : C.amber}`,
            background:   'transparent',
            color:        restoreDisabled ? '#6b7280' : C.amber,
            fontSize:     '12px', fontWeight: 800,
            cursor:       restoreDisabled ? 'not-allowed' : 'pointer',
            whiteSpace:   'nowrap', flexShrink: 0,
          }}
        >
          ↻ Restore
        </button>
      </div>
    );
  }

  // Vertical (not currently used but kept for completeness)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button onClick={() => { stopPlay(); engine.seekToStart(); }}
          disabled={dis || engine.atStart} style={btn(dis || engine.atStart)}>⏮</button>
        <button onClick={() => { stopPlay(); engine.stepBackward(); }}
          disabled={dis || engine.atStart} style={btn(dis || engine.atStart)}>◀</button>
        <button onClick={() => isPlaying ? stopPlay() : startPlay()}
          disabled={dis || engine.atEnd} style={btn(dis || engine.atEnd, true)}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button onClick={() => { stopPlay(); engine.stepForward(); }}
          disabled={dis || engine.atEnd} style={btn(dis || engine.atEnd)}>▶</button>
        <button onClick={() => { stopPlay(); engine.seekToEnd(); }}
          disabled={dis || engine.atEnd} style={btn(dis || engine.atEnd)}>⏭</button>
        <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, fontFamily: 'monospace' }}>
          {cursor} / {total}
        </span>
      </div>
      <input type="range" min={0} max={total || 1} value={cursor} disabled={dis}
        onChange={e => { stopPlay(); engine.seekTo(parseInt(e.target.value, 10)); }}
        style={{ width: '100%', accentColor: C.amber }} />
      <button disabled={restoreDisabled} onClick={handleRestore} style={{
        borderRadius: '7px', border: `1px solid ${restoreDisabled ? '#30343c' : C.amber}`,
        background: 'transparent', color: restoreDisabled ? '#6b7280' : C.amber,
        fontSize: '12px', fontWeight: 800, padding: '8px', cursor: restoreDisabled ? 'not-allowed' : 'pointer',
      }}>
        ↻ Restore step {cursor}
      </button>
    </div>
  );
};

export default ReplayControls;