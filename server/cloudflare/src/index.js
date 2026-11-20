/**
 * Sync-Server für geteilte Welten auf Cloudflare (Worker + Durable Object je Welt).
 * Gleiche Schnittstelle wie der Referenz-Server `server/sync-server.mjs`:
 *   GET  /worlds/:seed/events?since=N  → { events, cursor } – nur Ereignisse nach Cursor N (ohne since: alle)
 *   POST /worlds/:seed/events {events} → führt zusammen (Duplikate werden erkannt) → { count, added }
 *   GET  /worlds/:seed/live            → WebSocket (bevorzugt) oder Server-Sent Events
 *   POST /worlds/:seed/live {msg}      → an alle verbundenen Spieler der Welt weiterleiten
 * Live per WebSocket mit Hibernation: 20 Nachrichten zählen wie eine Anfrage (kostenloser Tarif).
 */
import { DurableObject } from 'cloudflare:workers';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const MAX_EVENTS_BODY = 2_000_000;
const MAX_LIVE_MSG = 20_000;
/** Obergrenze je Welt, damit eine einzelne Welt den Speicher nicht sprengt */
const MAX_EVENTS = 100_000;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });

/** Schlüssel eines Ereignisses (wie im Referenz-Server) – erkennt Duplikate beim Zusammenführen. */
export const key = (e) => `${e.pid ?? e.by}|${e.t}|${e.type}|${e.id ?? (e.tx !== undefined ? `${e.tx},${e.ty}` : `${e.town},${e.realm}`)}`;

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const path = new URL(req.url).pathname;
    if (path === '/') return new Response('Splitterwelten Sync-Server\n', { headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS } });
    const m = /^\/worlds\/([^/]+)\/(events|live)$/.exec(path);
    if (!m) return json({ error: 'not found' }, 404);
    let seed;
    try {
      seed = decodeURIComponent(m[1]);
    } catch {
      return json({ error: 'bad seed' }, 400);
    }
    if (!seed || seed.length > 64) return json({ error: 'bad seed' }, 400);
    const world = env.WORLD.get(env.WORLD.idFromName(seed));
    return world.fetch(req);
  },
};

/** Eine Welt: Ereignisprotokoll (SQLite) und Live-Kanal. */
export class World extends DurableObject {
  /** SSE-Verbindungen (nur Ausweichweg, hält das Objekt wach) */
  sse = new Set();

  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS events (k TEXT PRIMARY KEY, t REAL NOT NULL, e TEXT NOT NULL)');
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req) {
    const route = new URL(req.url).pathname.endsWith('/live') ? 'live' : 'events';
    if (route === 'events') {
      if (req.method === 'GET') return this.getEvents(new URL(req.url).searchParams.get('since'));
      if (req.method === 'POST') return this.postEvents(req);
      return json({ error: 'method' }, 405);
    }
    if (req.method === 'GET' && req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (req.method === 'GET') return this.openSse();
    if (req.method === 'POST') {
      const body = await req.text();
      if (body.length > MAX_LIVE_MSG) return json({ error: 'too large' }, 413);
      const n = this.broadcast(body.replace(/\n/g, ' '), null);
      return json({ ok: true, clients: n });
    }
    return json({ error: 'method' }, 405);
  }

  /** Cursor = rowid (Einfügereihenfolge, es wird nie gelöscht): Wer `since` mitschickt, liest nur neue Zeilen. */
  getEvents(since) {
    const sql = this.ctx.storage.sql;
    const from = Math.max(0, Math.floor(Number(since)) || 0);
    const rows = sql.exec('SELECT rowid AS c, e FROM events WHERE rowid > ? ORDER BY rowid', from).toArray();
    const cursor = rows.length ? rows[rows.length - 1].c : this.lastRowid();
    // Rohes JSON zusammensetzen, statt jedes Ereignis zu parsen
    return new Response(`{"cursor":${cursor},"events":[${rows.map((r) => r.e).join(',')}]}`, { headers: { 'content-type': 'application/json', ...CORS } });
  }

  /** Höchste rowid – liest nur eine Zeile (statt COUNT(*) über alle) und ist ohne Löschen zugleich die Anzahl. */
  lastRowid() {
    return this.ctx.storage.sql.exec('SELECT COALESCE(MAX(rowid), 0) AS n FROM events').one().n;
  }

  async postEvents(req) {
    const body = await req.text();
    if (body.length > MAX_EVENTS_BODY) return json({ error: 'too large' }, 413);
    let events;
    try {
      ({ events } = JSON.parse(body));
    } catch {
      return json({ error: 'bad json' }, 400);
    }
    const sql = this.ctx.storage.sql;
    let count = this.lastRowid();
    let added = 0;
    for (const e of Array.isArray(events) ? events : []) {
      if (count >= MAX_EVENTS) break;
      if (typeof e?.t !== 'number' || typeof e?.type !== 'string') continue;
      const res = sql.exec('INSERT OR IGNORE INTO events (k, t, e) VALUES (?, ?, ?)', key(e), e.t, JSON.stringify(e));
      if (res.rowsWritten > 0) {
        added++;
        count++;
      }
    }
    return json({ count, added });
  }

  openSse() {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    const client = { write: (s) => writer.write(enc.encode(s)).catch(() => this.sse.delete(client)) };
    this.sse.add(client);
    client.write(': verbunden\n\n');
    return new Response(readable, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', ...CORS } });
  }

  /** Nachricht an alle außer dem Absender; gibt die Zahl der Empfänger zurück. */
  broadcast(text, from) {
    let n = 0;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === from) continue;
      try {
        ws.send(text);
        n++;
      } catch {
        // Verbindung bereits geschlossen
      }
    }
    for (const c of this.sse) {
      c.write(`data: ${text}\n\n`);
      n++;
    }
    return n;
  }

  webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > MAX_LIVE_MSG) return;
    this.broadcast(msg, ws);
  }

  webSocketClose(ws, code) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      // schon zu
    }
  }
}
