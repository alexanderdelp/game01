/** Live-Zusammenspiel (M12): Nachrichtenformat, Mitspielerliste und Verbindung zum Sync-Server (SSE + POST). */
import type { Appearance } from '../character/lpc';
import type { Facing } from '../world/collision';

export type LiveMsg =
  | { type: 'state'; pid: string; name: string; x: number; y: number; facing: Facing; moving: boolean; hp: number; maxHp: number; look: Appearance; t: number }
  | { type: 'hit'; pid: string; enemy: string; dmg: number; x: number; y: number }
  | { type: 'kill'; pid: string; enemy: string; x: number; y: number }
  | { type: 'chat'; pid: string; name: string; text: string }
  | { type: 'attack'; pid: string };

export const CHAT_MAX = 60;
export const STALE_MS = 5000;

export interface Remote {
  pid: string;
  name: string;
  x: number;
  y: number;
  /** Zielposition (für weiche Bewegung) */
  tx: number;
  ty: number;
  facing: Facing;
  moving: boolean;
  hp: number;
  maxHp: number;
  look: Appearance;
  seen: number;
  chat?: { text: string; until: number };
}

/** Wertet eine eingehende Nachricht für die Mitspielerliste aus (rein, testbar). */
export function applyMsg(remotes: Map<string, Remote>, msg: LiveMsg, selfPid: string, now: number): Remote | null {
  if (msg.pid === selfPid) return null;
  if (msg.type === 'state') {
    const r = remotes.get(msg.pid);
    if (r) {
      Object.assign(r, { name: msg.name, tx: msg.x, ty: msg.y, facing: msg.facing, moving: msg.moving, hp: msg.hp, maxHp: msg.maxHp, look: msg.look, seen: now });
      return r;
    }
    const n: Remote = { pid: msg.pid, name: msg.name, x: msg.x, y: msg.y, tx: msg.x, ty: msg.y, facing: msg.facing, moving: msg.moving, hp: msg.hp, maxHp: msg.maxHp, look: msg.look, seen: now };
    remotes.set(msg.pid, n);
    return n;
  }
  if (msg.type === 'chat') {
    const r = remotes.get(msg.pid);
    if (r) r.chat = { text: msg.text.slice(0, CHAT_MAX), until: now + 6000 };
    return r ?? null;
  }
  return remotes.get(msg.pid) ?? null;
}

/** Entfernt Mitspieler ohne Meldung seit STALE_MS; gibt die entfernten IDs zurück. */
export function pruneStale(remotes: Map<string, Remote>, now: number): string[] {
  const gone: string[] = [];
  for (const [pid, r] of remotes) {
    if (now - r.seen > STALE_MS) {
      remotes.delete(pid);
      gone.push(pid);
    }
  }
  return gone;
}

/** Weiche Annäherung an die gemeldete Position. */
export function smoothStep(r: Remote, dt: number): void {
  const k = Math.min(1, dt * 12);
  const d = Math.hypot(r.tx - r.x, r.ty - r.y);
  if (d > 200) {
    r.x = r.tx;
    r.y = r.ty;
    return;
  }
  r.x += (r.tx - r.x) * k;
  r.y += (r.ty - r.y) * k;
}

/** Verbindung zum Live-Kanal des Sync-Servers. */
export class LiveSession {
  private es?: EventSource;
  connected = false;
  private queue: LiveMsg | null = null;
  private sending = false;

  constructor(
    private readonly url: string,
    private readonly seed: string,
    private readonly onMsg: (m: LiveMsg) => void,
  ) {}

  private get endpoint(): string {
    return `${this.url.replace(/\/$/, '')}/worlds/${encodeURIComponent(this.seed)}/live`;
  }

  start(): void {
    this.es = new EventSource(this.endpoint);
    this.es.onopen = () => (this.connected = true);
    this.es.onerror = () => (this.connected = false);
    this.es.onmessage = (ev) => {
      try {
        this.onMsg(JSON.parse(ev.data) as LiveMsg);
      } catch {
        // fehlerhafte Nachricht ignorieren
      }
    };
  }

  /** Sofort senden (Treffer, Chat). */
  send(msg: LiveMsg): void {
    void fetch(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(msg), keepalive: true }).catch(() => {});
  }

  /** Präsenz senden; überholte Zustände werden verworfen, solange noch gesendet wird. */
  sendState(msg: LiveMsg): void {
    this.queue = msg;
    if (this.sending) return;
    const next = this.queue;
    this.queue = null;
    this.sending = true;
    fetch(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) })
      .catch(() => {})
      .finally(() => {
        this.sending = false;
        if (this.queue) this.sendState(this.queue);
      });
  }

  stop(): void {
    this.es?.close();
  }
}
