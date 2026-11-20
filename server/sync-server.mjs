/**
 * Referenz-Server für geteilte Welten (M11). Ohne Abhängigkeiten, Node ≥ 18.
 *   GET  /worlds/:seed/events?since=N  → { events, cursor } – nur Ereignisse nach Cursor N (ohne since: alle)
 *   POST /worlds/:seed/events {events} → führt zusammen (Duplikate werden erkannt) → { count }
 *   GET  /worlds/:seed/live            → WebSocket oder Server-Sent Events: Live-Nachrichten der anderen Spieler (M12)
 *   POST /worlds/:seed/live {msg}      → an alle verbundenen Spieler der Welt weiterleiten
 * Start: node server/sync-server.mjs [port]   (Daten in ./data/, per DATA_DIR änderbar)
 * Spiel verbinden: https://…/game01/?seed=<seed>&sync=http://<host>:<port>
 */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const dir = process.env.DATA_DIR ?? 'data';
mkdirSync(dir, { recursive: true });
const worlds = new Map();
/** Live-Verbindungen je Welt (Server-Sent Events) */
const live = new Map();

const key = (e) => `${e.pid ?? e.by}|${e.t}|${e.type}|${e.id ?? (e.tx !== undefined ? `${e.tx},${e.ty}` : `${e.town},${e.realm}`)}`;
const safe = (seed) => seed.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);

function world(seed) {
  if (!worlds.has(seed)) {
    const file = join(dir, `${safe(seed)}.json`);
    const events = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
    // Map behält die Einfügereihenfolge: Cursor = Anzahl bereits gelieferter Ereignisse
    worlds.set(seed, new Map(events.map((e) => [key(e), e])));
  }
  return worlds.get(seed);
}

const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' });
  res.end(JSON.stringify(body));
};

/** Text-Rahmen an einen WebSocket (Server → Client, unmaskiert). */
function wsFrame(text) {
  const data = Buffer.from(text);
  const n = data.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), Buffer.from([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255])]);
  return Buffer.concat([head, data]);
}

/** Minimaler WebSocket (RFC 6455) für den Live-Kanal: Textnachrichten, Ping, Schließen. */
function liveSocket(req, socket, seed) {
  const key = req.headers['sec-websocket-key'];
  if (!key) return socket.destroy();
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  if (!live.has(seed)) live.set(seed, new Set());
  const clients = live.get(seed);
  const self = { write: (s) => socket.write(wsFrame(s.startsWith('data: ') ? s.slice(6).trimEnd() : s)), ws: true };
  clients.add(self);
  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const op = buf[0] & 15;
      let len = buf[1] & 127;
      let off = 2;
      if (len === 126) [len, off] = [buf.readUInt16BE(2), 4];
      else if (len === 127) [len, off] = [Number(buf.readBigUInt64BE(2)), 10];
      if (len > 20_000) return socket.destroy();
      const masked = buf[1] & 128;
      const end = off + (masked ? 4 : 0) + len;
      if (buf.length < end) return;
      const payload = buf.subarray(end - len, end);
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= buf[off + (i & 3)];
      buf = buf.subarray(end);
      if (op === 8) return socket.end(Buffer.from([0x88, 0]));
      if (op === 9) socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload]));
      if (op === 1) for (const c of clients) if (c !== self) c.write(`data: ${payload.toString().replace(/\n/g, ' ')}\n\n`);
    }
  });
  const drop = () => clients.delete(self);
  socket.on('close', drop);
  socket.on('error', drop);
}

function liveRoute(req, res, seed) {
  if (!live.has(seed)) live.set(seed, new Set());
  const clients = live.get(seed);
  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'access-control-allow-origin': '*' });
    res.write(': verbunden\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return;
  }
  let body = '';
  req.on('data', (c) => {
    body += c;
    if (body.length > 20_000) req.destroy();
  });
  req.on('end', () => {
    for (const c of clients) c.write(`data: ${body.replace(/\n/g, ' ')}\n\n`);
    send(res, 200, { ok: true, clients: clients.size });
  });
}

const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const m = /^\/worlds\/([^/]+)\/events$/.exec(path);
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const lm = /^\/worlds\/([^/]+)\/live$/.exec(path);
  if (lm) return liveRoute(req, res, decodeURIComponent(lm[1]));
  if (!m) return send(res, 404, { error: 'not found' });
  const seed = decodeURIComponent(m[1]);
  const w = world(seed);
  if (req.method === 'GET') {
    const since = Math.max(0, Math.floor(Number(new URL(req.url, 'http://x').searchParams.get('since'))) || 0);
    return send(res, 200, { cursor: w.size, events: [...w.values()].slice(since) });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  let body = '';
  req.on('data', (c) => {
    body += c;
    if (body.length > 2_000_000) req.destroy();
  });
  req.on('end', () => {
    try {
      const { events } = JSON.parse(body);
      let added = 0;
      for (const e of Array.isArray(events) ? events : []) {
        if (typeof e?.t !== 'number' || typeof e?.type !== 'string') continue;
        const k = key(e);
        if (!w.has(k)) {
          w.set(k, e);
          added++;
        }
      }
      if (added) writeFileSync(join(dir, `${safe(seed)}.json`), JSON.stringify([...w.values()]));
      send(res, 200, { count: w.size, added });
    } catch {
      send(res, 400, { error: 'bad json' });
    }
  });
});
server.on('upgrade', (req, socket) => {
  const lm = /^\/worlds\/([^/]+)\/live$/.exec(new URL(req.url, 'http://x').pathname);
  if (!lm || req.headers.upgrade?.toLowerCase() !== 'websocket') return socket.destroy();
  liveSocket(req, socket, decodeURIComponent(lm[1]));
});
server.listen(port, () => console.log(`sync-server läuft auf :${port}`));
