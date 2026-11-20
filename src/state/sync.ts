import { load, save } from '../game/save';
import { eventKey, type WorldEvent, type WorldState } from './worldState';

export type SyncStatus = 'aus' | 'verbinde' | 'verbunden' | 'fehler';

/** Öffentlicher Sync-Server (Cloudflare, `server/cloudflare/`), mit dem veröffentlichte Spiele standardmäßig abgleichen. */
export const DEFAULT_SYNC_URL = 'https://game01-sync.alexanderdelp.workers.dev';

/**
 * Sync-Adresse: ?sync=<URL> übernimmt und merkt sie, ?sync=off schaltet dauerhaft ab, ?sync=on zurück zum Standard.
 * Ohne Angabe gilt die gemerkte Wahl, sonst der öffentliche Server – außer im Testmodus und lokal (Entwicklung, Vorschau, automatische Tests).
 */
export function syncUrlFromLocation(search = location.search, useDefault = import.meta.env.PROD && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)): string | null {
  const params = new URLSearchParams(search);
  const p = params.get('sync');
  if (p === 'off') {
    save('sync:url', 'off');
    return null;
  }
  if (p === 'on') save('sync:url', null);
  else if (p) {
    save('sync:url', p);
    return p;
  }
  const stored = load<string>('sync:url');
  if (stored === 'off') return null;
  if (stored) return stored;
  return useDefault && params.get('test') !== '1' ? DEFAULT_SYNC_URL : null;
}

/** Gleicht das Ereignisprotokoll regelmäßig mit einem Sync-Server ab (siehe server/sync-server.mjs). */
export class SyncClient {
  status: SyncStatus = 'verbinde';
  lastSync = 0;
  /** Ereignisse, die der Server schon hat – nur neue werden gesendet */
  private readonly known = new Set<string>();
  /** Stand beim Server: Beim Abruf kommen nur Ereignisse danach (spart gelesene Zeilen im kostenlosen Tarif) */
  private cursor = 0;
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
      const outgoing = this.state.events.filter((e) => !this.known.has(eventKey(e)));
      if (outgoing.length) {
        const post = await fetch(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: outgoing }) });
        if (!post.ok) throw new Error(`sync ${post.status}`);
        for (const e of outgoing) this.known.add(eventKey(e));
      }
      const res = await fetch(`${this.endpoint}?since=${this.cursor}`);
      if (!res.ok) throw new Error(`sync ${res.status}`);
      const { events, cursor } = (await res.json()) as { events: WorldEvent[]; cursor?: number };
      // Server ohne Cursor (alt) liefert immer alles; ist der Cursor kleiner geworden (Server neu), beim nächsten Mal alles holen
      if (typeof cursor === 'number') this.cursor = cursor < this.cursor ? 0 : cursor;
      for (const e of events) this.known.add(eventKey(e));
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
