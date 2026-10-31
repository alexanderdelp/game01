/**
 * Referenz-Server für geteilte Welten (M11). Ohne Abhängigkeiten, Node ≥ 18.
 *   GET  /worlds/:seed/events          → { events }
 *   POST /worlds/:seed/events {events} → führt zusammen (Duplikate werden erkannt) → { count }
 *   GET  /worlds/:seed/live            → Server-Sent Events: Live-Nachrichten der anderen Spieler (M12)
 *   POST /worlds/:seed/live {msg}      → an alle verbundenen Spieler der Welt weiterleiten
 * Start: node server/sync-server.mjs [port]   (Daten in ./data/, per DATA_DIR änderbar)
 * Spiel verbinden: https://…/game01/?seed=<seed>&sync=http://<host>:<port>
 */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
    worlds.set(seed, new Map(events.map((e) => [key(e), e])));
  }
  return worlds.get(seed);
}

const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' });
  res.end(JSON.stringify(body));
};

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

createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const m = /^\/worlds\/([^/]+)\/events$/.exec(path);
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const lm = /^\/worlds\/([^/]+)\/live$/.exec(path);
  if (lm) return liveRoute(req, res, decodeURIComponent(lm[1]));
  if (!m) return send(res, 404, { error: 'not found' });
  const seed = decodeURIComponent(m[1]);
  const w = world(seed);
  if (req.method === 'GET') return send(res, 200, { events: [...w.values()].sort((a, b) => a.t - b.t) });
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
}).listen(port, () => console.log(`sync-server läuft auf :${port}`));
