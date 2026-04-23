import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ReactFlowProvider } from 'reactflow';

import { ReplayEngine } from '../../replay/ReplayEngine';
import { ReplayEngineState, SessionSummary, EMPTY_STATE } from '../../replay/ReplayTypes';
import { ReplayCanvas } from './ReplayCanvas';
import { ReplayControls } from './ReplayControls';

const API_BASE = 'http://localhost:5002';

interface ReplayPageProps {
  onRestore?: (nodes: any[], edges: any[]) => void;
}

export const ReplayPage: React.FC<ReplayPageProps> = ({ onRestore }) => {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsErr, setSessionsErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [engineState, setEngineState] = useState<ReplayEngineState>(EMPTY_STATE);

  const engineRef = useRef<ReplayEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new ReplayEngine(newState => setEngineState(newState));
  }
  const engine = engineRef.current;

  useEffect(() => {
    fetch(`${API_BASE}/api/log/sessions?limit=100`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        const sessions: SessionSummary[] = (data.sessions ?? []);
        setSessions(sessions);
        if (sessions.length > 0 && selectedId === null) {
          setSelectedId(sessions[0].session_id);
        }
      })
      .catch(err => {
        setSessionsErr('Could not load sessions: ' + err.message);
      });
  }, []);

  const handleLoad = useCallback(() => {
    if (selectedId === null) return;
    engine.loadSession(selectedId);
  }, [engine, selectedId]);

  function sessionLabel(s: SessionSummary): string {
    const date = s.session_start.slice(0, 16);
    const evts = s.event_count;
    const state = s.session_end === null ? ' [open]'
      : s.session_end === 'AUTO_CLOSED' ? ' [auto-closed]'
      : '';
    return `#${s.session_id} | ${date} | ${evts} events${state}`;
  }

  // Group sessions by workflow_name
  const grouped = sessions.reduce<Record<string, SessionSummary[]>>((acc, s) => {
    const key = s.workflow_name ?? 'Unnamed';
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      fontFamily: 'Arial, sans-serif',
      background: '#f4f6f8',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '9px 18px',
        background: '#1E1F23',
        color: '#fff',
        flexShrink: 0,
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }}>
        <span style={{ fontSize: '15px', fontWeight: 700 }}>🎞 Session Replay</span>

        {sessionsErr ? (
          <span style={{ color: '#fca5a5', fontSize: '12px' }}>{sessionsErr}</span>
        ) : (
          <select
            value={selectedId ?? ''}
            onChange={e => setSelectedId(e.target.value ? parseInt(e.target.value, 10) : null)}
            style={{
              padding: '4px 10px',
              borderRadius: '5px',
              border: 'none',
              fontSize: '12px',
              minWidth: '320px',
              background: '#fff',
              color: '#1e3a5f',
              fontFamily: 'monospace',
            }}
          >
            <option value="">— select a session —</option>
            {Object.entries(grouped).map(([name, group]) => (
              <optgroup key={name} label={name}>
                {group.map(s => (
                  <option key={s.session_id} value={s.session_id}>
                    {sessionLabel(s)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        <button
          onClick={handleLoad}
          disabled={selectedId === null || engineState.loading}
          style={{
            padding: '5px 18px',
            background: '#f59e0b',
            color: '#fff',
            border: 'none',
            borderRadius: '5px',
            cursor: selectedId === null ? 'not-allowed' : 'pointer',
            opacity: selectedId === null ? 0.5 : 1,
            fontWeight: 700,
            fontSize: '12px',
          }}
        >
          {engineState.loading ? 'Loading…' : 'Load'}
        </button>

        {engineState.loaded && (
          <span style={{ color: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' }}>
            {engineState.events.length} events ·{' '}
            {engineState.snapshots.length} snapshots ·{' '}
            cursor {engineState.cursor}
          </span>
        )}

        <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: '11px' }}>
          
        </span>
      </div>

      <div style={{
        display: 'flex',
        flex: 1,
        gap: '12px',
        padding: '12px',
        minHeight: 0,
        overflow: 'hidden',
      }}>
        <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          <ReactFlowProvider>
            <ReplayCanvas engineState={engineState} />
          </ReactFlowProvider>
        </div>

        <div style={{
          width: '300px',
          flexShrink: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <ReplayControls engine={engine} engineState={engineState} onRestore={onRestore} />
        </div>
      </div>
    </div>
  );
};

export default ReplayPage;