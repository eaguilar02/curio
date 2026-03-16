import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { EventBuffer } from './EventBuffer';
import { EventInterceptor } from './EventInterceptor';
import { LogEvent, LoggingContextValue } from './types';

const LoggingContext = createContext<LoggingContextValue>({
  sessionId: null,
  capture: () => undefined,
});

interface LoggingProviderProps {
  children: React.ReactNode;
  workflowId?: number | null;
  userId?: number;
}

export function LoggingProvider({
  children,
  workflowId = null,
  userId = 1,
}: LoggingProviderProps): JSX.Element {

  const [sessionId, setSessionId] = useState<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const buffer = EventBuffer.getInstance();
    buffer.setSessionIdGetter(() => sessionId);

    fetch('http://localhost:5002/api/log/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        workflow_id: workflowId,
      }),
    })
      .then(r => r.json())
      .then((data: { session_id: number }) => {
        setSessionId(data.session_id);

        buffer.setSessionIdGetter(() => data.session_id);

        EventInterceptor.getInstance().capture({
          event_type: 'SESSION_STARTED',
          node_id: null,
          event_time: EventInterceptor.now(),
          event_data: {
            userAgent: navigator.userAgent,
            workflowId: workflowId,
          },
        });

        buffer.flush();
      })
      .catch(err => {
        console.error('[LoggingContext] failed to start session:', err);
      });
  }, []);

  useEffect(() => {
    EventBuffer.getInstance().setSessionIdGetter(() => sessionId);
  }, [sessionId]);

  const capture = (event: LogEvent) => {
    EventInterceptor.getInstance().capture(event);
  };

  return (
    <LoggingContext.Provider value={{ sessionId, capture }}>
      {children}
    </LoggingContext.Provider>
  );
}

export function useLogging(): LoggingContextValue {
  return useContext(LoggingContext);
}