import React, { useEffect, useState } from 'react';
import { BoxLifecycleHook } from './types';
import { useLogging } from '../logging/LoggingContext';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5002';

interface InteractionEvent {

  event_id: number;
  session_id: number;
  event_type: string;
  node_id: string;
  event_time: string;
  event_data: string | Record<string, unknown>;
}

export const useTimeMachineLifecycle: BoxLifecycleHook = (_data, _boxState) => {
  const { sessionId } = useLogging();
  const [events, setEvents] = useState<InteractionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = (sid: number) => {
    fetch(`${BACKEND_URL}/api/log/session/${sid}/events?limit=500`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const eventsWithSession = (json.events || []).map((e: InteractionEvent) => ({
          ...e,
          session_id: json.session_id,
        }));
        setEvents(eventsWithSession);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (sessionId === null) return;
    fetchEvents(sessionId);
    const interval = setInterval(() => fetchEvents(sessionId), 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const headerStyle: React.CSSProperties = {
    display: 'flex', gap: '8px', padding: '4px 0 6px 0',
    borderBottom: '2px solid #555', fontWeight: 'bold', fontSize: '11px',
    textTransform: 'uppercase', letterSpacing: '0.05em', color: '#555',
  };

  const contentComponent = (
    <div style={{ padding: '8px', overflowY: 'auto', maxHeight: '400px', fontSize: '12px', fontFamily: 'monospace' }}>
      {loading && <p>Loading events...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {!loading && !error && (
        <>
          <div style={headerStyle}>
            <span style={{ minWidth: '140px' }}>Timestamp</span>
            <span style={{ minWidth: '80px' }}>Session</span>
            <span style={{ minWidth: '120px' }}>Event Type</span>
            <span style={{ minWidth: '120px' }}>Node Type</span>
            <span>Node ID</span>
          </div>
          {events.length === 0 && <p style={{ marginTop: '8px' }}>No events recorded yet.</p>}
          {events.map((evt) => {
            let nodeType = '';
            try {
              const data = typeof evt.event_data === 'string' ? JSON.parse(evt.event_data) : evt.event_data;
              nodeType = (data as Record<string, unknown>)?.nodeType as string ?? '';
            } catch {}
            return (
              <div key={evt.event_id} style={{ borderBottom: '1px solid #eee', padding: '4px 0', display: 'flex', gap: '8px' }}>
                <span style={{ color: '#888', minWidth: '140px' }}>{evt.event_time}</span>
                <span style={{ minWidth: '80px', color: '#666' }}>{evt.session_id ?? '—'}</span>
                <strong style={{ minWidth: '120px' }}>{evt.event_type}</strong>
                <span style={{ minWidth: '120px', color: '#666' }}>{nodeType}</span>
                {evt.node_id && <span style={{ color: '#aaa' }}>{evt.node_id}</span>}
              </div>
            );
          })}
        </>
      )}
    </div>
  );

  return { contentComponent };
};
