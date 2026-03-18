import { LogEvent, LogEventsBatchRequest } from './types';
import { SnapshotManager } from './SnapshotManager';

const DEBOUNCED_EVENT_TYPES = new Set<string>(['NODE_MOVED', 'PARAM_CHANGED']);

const MAX_BATCH_SIZE    = 30;
const FLUSH_INTERVAL_MS = 2000;
const DEBOUNCE_MS       = 500;

const LOG_EVENTS_URL = 'http://localhost:5002/api/log/events';

export class EventBuffer {
  private static instance: EventBuffer | null = null;

  private queue: LogEvent[] = [];
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private getSessionId: () => number | null = () => null;

  private constructor() {
    this.startFlushTimer();
  }

  public static getInstance(): EventBuffer {
    if (!EventBuffer.instance) {
      EventBuffer.instance = new EventBuffer();
    }
    return EventBuffer.instance;
  }

  public setSessionIdGetter(getter: () => number | null): void {
    this.getSessionId = getter;
  }

  public enqueue(event: LogEvent): void {
    if (DEBOUNCED_EVENT_TYPES.has(event.event_type)) {
      this.debounce(event);
    } else {
      this.addToQueue(event);
    }
  }

  private debounce(event: LogEvent): void {
    const key = `${event.event_type}|${event.node_id ?? '_'}`;
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.addToQueue(event);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(key, timer);
  }

  private addToQueue(event: LogEvent): void {
    this.queue.push(event);
    if (this.queue.length >= MAX_BATCH_SIZE) {
      this.flush();
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, FLUSH_INTERVAL_MS);
  }

  public flush(): void {
    if (this.queue.length === 0) return;

    const sessionId = this.getSessionId();
    if (sessionId === null) {
      console.warn('[EventBuffer] flush skipped: sessionId not yet available');
      return;
    }

    const batch = this.queue.splice(0, this.queue.length);

    const snapshotRef = SnapshotManager.getInstance().consumeLatestSnapshotId();

    const body: LogEventsBatchRequest & { snapshot_ref?: number } = {
      session_id: sessionId,
      events:     batch,
      ...(snapshotRef !== null && { snapshot_ref: snapshotRef }),
    };

    fetch(LOG_EVENTS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
      .then(res => {
        if (!res.ok) {
          console.error(
            `[EventBuffer] POST /api/log/events returned ${res.status}`,
            batch
          );
          return;
        }
        return res.json().then(data => {
          const inserted = data.inserted ?? batch.length;
          console.debug(
            `[EventBuffer] flushed ${inserted} events (session ${sessionId})`
          );
          SnapshotManager.getInstance().onEventsFlushed(inserted);
        });
      })
      .catch(err => {
        console.error('[EventBuffer] network error — events dropped:', err, batch);
      });
  }

  public flushSync(): void {
    if (this.queue.length === 0) return;

    const sessionId = this.getSessionId();
    if (sessionId === null) return;

    const batch = this.queue.splice(0, this.queue.length);
    const body: LogEventsBatchRequest = {
      session_id: sessionId,
      events:     batch,
    };

    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
      navigator.sendBeacon(LOG_EVENTS_URL, blob);
      console.debug(`[EventBuffer] flushSync: ${batch.length} events via sendBeacon`);
    } else {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', LOG_EVENTS_URL, false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(body));
    }
  }

  public destroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.debounceTimers.forEach(t => clearTimeout(t));
    this.debounceTimers.clear();
    this.queue = [];
    EventBuffer.instance = null;
  }
}