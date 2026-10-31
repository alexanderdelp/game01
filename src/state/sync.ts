import { load, save } from '../game/save';
import type { WorldEvent, WorldState } from './worldState';

export type SyncStatus = 'aus' | 'verbinde' | 'verbunden' | 'fehler';

/** Sync-Adresse aus der URL (?sync=…) übernehmen bzw. gespeicherte verwenden; ?sync=off schaltet ab. */
export function syncUrlFromLocation(): string | null {
  const p = new URLSearchParams(location.search).get('sync');
  if (p === 'off') {
    save('sync:url', null);
    return null;
  }
  if (p) {
    save('sync:url', p);
    return p;
  }
  return load<string>('sync:url');
}

/** Gleicht das Ereignisprotokoll regelmäßig mit einem Sync-Server ab (siehe server/sync-server.mjs). */
export class SyncClient {
  status: SyncStatus = 'verbinde';
  lastSync = 0;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    readonly url: string,
    private readonly state: WorldState,
    private readonly onMerged: (fresh: WorldEvent[]) => void,
  ) {}

  private get endpoint(): string {
    return `${this.url.replace(/\/$/, '')}/worlds/${encodeURIComponent(this.state.seed)}/events`;
  }

  async sync(): Promise<void> {
    try {
      await fetch(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: this.state.events }) });
      const res = await fetch(this.endpoint);
      const { events } = (await res.json()) as { events: WorldEvent[] };
      const fresh = this.state.mergeIn(events);
      if (fresh.length) this.onMerged(fresh);
      this.status = 'verbunden';
      this.lastSync = Date.now();
    } catch {
      this.status = 'fehler';
    }
  }

  start(intervalMs = 10_000): void {
    void this.sync();
    this.timer = setInterval(() => void this.sync(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
