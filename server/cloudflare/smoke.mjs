// Rauchtest gegen einen laufenden Sync-Server: node server/cloudflare/smoke.mjs [URL]
const base = (process.argv[2] ?? 'http://localhost:8788').replace(/\/$/, '');
const seed = `smoke-${Date.now()}`;
const ev = `${base}/worlds/${seed}/events`;
const live = `${base}/worlds/${seed}/live`;
const ok = (c, m) => { if (!c) { console.error('FEHLER:', m); process.exit(1); } console.log('ok:', m); };

for (let i = 0; i < 60; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

const e1 = { t: 1, by: 'Ada', pid: 'a', type: 'sign', tx: 1, ty: 2, text: 'Hallo' };
let r = await (await fetch(ev, { method: 'POST', body: JSON.stringify({ events: [e1, e1, { bad: 1 }] }) })).json();
ok(r.added === 1 && r.count === 1, `Ereignis gespeichert, Duplikat erkannt (${JSON.stringify(r)})`);
r = await (await fetch(ev)).json();
ok(r.events.length === 1 && r.events[0].text === 'Hallo', 'Ereignis zurückgelesen');

const open = (n) => new Promise((res, rej) => { const w = new WebSocket(live.replace(/^http/, 'ws')); w.got = []; w.onmessage = (m) => w.got.push(m.data); w.onopen = () => res(w); w.onerror = () => rej(new Error(`ws ${n}`)); });
const a = await open('a'), b = await open('b');
a.send(JSON.stringify({ type: 'chat', pid: 'a', name: 'Ada', text: 'hi' }));
await fetch(live, { method: 'POST', body: JSON.stringify({ type: 'attack', pid: 'p' }) });
await new Promise((r) => setTimeout(r, 800));
ok(b.got.length === 2 && a.got.length === 1, `WebSocket-Weiterleitung (b: ${b.got.length}, a: ${a.got.length})`);
a.close(); b.close();
console.log('alles gut');
process.exit(0);
