import { EventInterceptor } from './EventInterceptor';

export interface GraphState {
  nodes: any[];
  edges: any[];
}

interface SnapshotResponse {
  snapshot_id: number;
  event_count: number;
}

const SNAPSHOT_INTERVAL = 25;
const SNAPSHOT_URL = 'http://localhost:5002/api/log/snapshot';

export class SnapshotManager {
  private static instance: SnapshotManager | null = null;

  private eventsFlushedTotal: number = 0;
  private latestSnapshotId: number | null = null;
  private snapshotInFlight: boolean = false;

  private getGraphState: () => GraphState | null = () => null;
  private getSessionId: () => number | null = () => null;

  private constructor() {}

  public static getInstance(): SnapshotManager {
    if (!SnapshotManager.instance) {
      SnapshotManager.instance = new SnapshotManager();
    }
    return SnapshotManager.instance;
  }

  public setGraphStateGetter(getter: () => GraphState | null): void {
    this.getGraphState = getter;
  }

  public setSessionIdGetter(getter: () => number | null): void {
    this.getSessionId = getter;
  }

  public onEventsFlushed(insertedCount: number): void {
    if (insertedCount <= 0) return;

    const prevTotal = this.eventsFlushedTotal;
    this.eventsFlushedTotal += insertedCount;

    const prevMark = Math.floor(prevTotal / SNAPSHOT_INTERVAL);
    const newMark  = Math.floor(this.eventsFlushedTotal / SNAPSHOT_INTERVAL);

    if (newMark > prevMark && !this.snapshotInFlight) {
      console.debug(
        `[SnapshotManager] boundary crossed at total=${this.eventsFlushedTotal} → taking snapshot`
      );
      this.takeSnapshot();
    }
  }

  public consumeLatestSnapshotId(): number | null {
    const id = this.latestSnapshotId;
    this.latestSnapshotId = null;
    return id;
  }

  public takeSnapshot(forcedByUnload: boolean = false): void {
    const sessionId  = this.getSessionId();
    const graphState = this.getGraphState();

    if (sessionId === null) {
      console.warn('[SnapshotManager] takeSnapshot skipped: no session_id');
      return;
    }
    if (!graphState) {
      console.warn('[SnapshotManager] takeSnapshot skipped: graph state not available');
      return;
    }
    if (this.snapshotInFlight && !forcedByUnload) {
      console.warn('[SnapshotManager] takeSnapshot skipped: already in flight');
      return;
    }

    this.snapshotInFlight = true;

    const body = {
      session_id:    sessionId,
      event_count:   this.eventsFlushedTotal,
      graph_json:    JSON.stringify(graphState),
      snapshot_time: EventInterceptor.now(),
    };

    if (forcedByUnload && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
      navigator.sendBeacon(SNAPSHOT_URL, blob);
      this.snapshotInFlight = false;
      console.debug('[SnapshotManager] unload snapshot sent via sendBeacon');
      return;
    }

    fetch(SNAPSHOT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SnapshotResponse>;
      })
      .then(data => {
        this.latestSnapshotId = data.snapshot_id;
        console.debug(
          `[SnapshotManager] saved snapshot_id=${data.snapshot_id} at event_count=${data.event_count}`
        );
      })
      .catch(err => {
        console.error('[SnapshotManager] POST /api/log/snapshot failed:', err);
      })
      .finally(() => {
        this.snapshotInFlight = false;
      });
  }

  public reset(): void {
    this.eventsFlushedTotal  = 0;
    this.latestSnapshotId    = null;
    this.snapshotInFlight    = false;
    SnapshotManager.instance = null;
  }
}