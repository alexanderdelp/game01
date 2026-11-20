import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncClient } from '../../src/state/sync';
import { WorldState, type WorldEvent, type WorldSave, type WorldStore } from '../../src/state/worldState';

const store: WorldStore = { load: () => null, save: (_: WorldSave) => {} };
const ev = (t: number, by: string): WorldEvent => ({ t, by, pid: by, type: 'sign', tx: t, ty: 0, text: by }) as WorldEvent;

/** Nachgebauter Server mit Cursor (wie server/sync-server.mjs); merkt sich die abgerufenen `since`-Werte. */
function fakeServer(log: WorldEvent[]) {
  const since: number[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      log.push(...(JSON.parse(String(init.body)) as { events: WorldEvent[] }).events);
      return new Response('{}');
    }
    const n = Number(new URL(url).searchParams.get('since'));
    since.push(n);
    return new Response(JSON.stringify({ cursor: log.length, events: log.slice(n) }));
  });
  return since;
}

afterEach(() => vi.unstubAllGlobals());

describe('SyncClient (Abruf ab Cursor)', () => {
  it('holt beim ersten Mal alles, danach nur Neues', async () => {
    const log = [ev(1, 'a'), ev(2, 'a')];
    const since = fakeServer(log);
    const fresh: WorldEvent[][] = [];
    const c = new SyncClient('https://x', new WorldState('s', store, 0, 'me'), (f) => fresh.push(f));
    await c.sync();
    log.push(ev(3, 'b'));
    await c.sync();
    await c.sync();
    expect(since).toEqual([0, 2, 3]);
    expect(fresh.map((f) => f.length)).toEqual([2, 1]);
    expect(c.status).toBe('verbunden');
  });

  it('holt nach einem Neustart des Servers (Cursor kleiner) wieder alles', async () => {
    const log = [ev(1, 'a'), ev(2, 'a'), ev(3, 'a')];
    const since = fakeServer(log);
    const c = new SyncClient('https://x', new WorldState('s', store, 0, 'me'), () => {});
    await c.sync();
    log.splice(0, 3, ev(9, 'z'));
    await c.sync();
    await c.sync();
    expect(since).toEqual([0, 3, 0]);
  });
});
