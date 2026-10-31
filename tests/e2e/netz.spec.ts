import { expect, test } from '@playwright/test';
import { G, player, shot, syncServer, tp } from './helpers';

// Modul Netz: geteilte Welt per Link, Abgleich und Live-Spiel über den Referenz-Server (je Test eigener Server auf
// freiem Port). Zusammenführen, Teilen-Code und Live-Nachrichten prüfen m11.test.ts und m12.test.ts.

type State = { prosperity: Record<string, number> };
type R = { name: string; x: number; chat: string };

test('M11: Welt per Link teilen – Freund sieht Taten, Botschaft und Namen (R2, R3, R5)', async ({ browser }) => {
  const a = await player(browser, '/?seed=share-test&test=1', 'Ada');
  await G(a.page, "g.placeSign('Hallo von Ada!')");
  const town = await G<{ tx: number; ty: number }>(a.page, 'g.meta.settlements[0]');
  for (let i = 0; i < 10; i++) await G(a.page, `g.recordQuest(${town.tx}, ${town.ty})`);
  const link = await G<string>(a.page, 'g.shareLink()');
  expect(link).toContain('#w=');

  const b = await player(browser, link, 'Bo');
  await expect.poll(async () => (await G<State>(b.page, 'g.state()')).prosperity['0'], { timeout: 10_000 }).toBe(10);
  expect((await G<{ name: string }[]>(b.page, 'g.players()')).map((p) => p.name)).toContain('Ada');
  await expect.poll(() => G<boolean>(b.page, 'g.newsOpen')).toBe(true);
  await shot(b.page, 'm11-import');
  await b.page.keyboard.press('u');
  // Adas Botschaft steht am Startpunkt in Bos Welt
  const sp = await G<{ tx: number; ty: number }>(b.page, 'g.spawn');
  await tp(b.page, sp.tx, sp.ty);
  await b.page.keyboard.press('e');
  await expect.poll(() => G<string>(b.page, "g.dialog?.text ?? ''")).toContain('Hallo von Ada');
  await shot(b.page, 'm11-sign');
  if (process.env.SHOTS) {
    await tp(b.page, town.tx, town.ty + 2);
    await shot(b.page, 'm11-statue');
  }
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.close();
  await b.close();
});

test('M11: Automatischer Abgleich über den Referenz-Server (R4)', async ({ browser }) => {
  const server = await syncServer();
  try {
    const url = `/?seed=sync-test&test=1&sync=${server.url}`;
    const a = await player(browser, url, 'Ada');
    await G(a.page, "g.placeSign('Ada war hier')");
    await G(a.page, 'g.syncNow()');
    const b = await player(browser, url, 'Bo');
    await G(b.page, 'g.syncNow()');
    await expect.poll(() => G<string[]>(b.page, 'g.players().map((p) => p.name)'), { timeout: 15_000 }).toContain('Ada');
    expect(await G<string>(b.page, 'g.syncStatus()')).toBe('verbunden');
    await G(b.page, "g.placeSign('Bo grüßt zurück')");
    await G(b.page, 'g.syncNow()');
    await G(a.page, 'g.syncNow()');
    await expect.poll(() => G<string[]>(a.page, 'g.players().map((p) => p.name)'), { timeout: 15_000 }).toContain('Bo');
    await a.page.keyboard.press('g');
    await shot(a.page, 'm11-share');
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    await a.close();
    await b.close();
  } finally {
    server.stop();
  }
});

test('M12: Live – sehen, chatten, gemeinsam kämpfen (R2–R4)', async ({ browser }) => {
  const server = await syncServer();
  try {
    const url = `/?seed=live-test&test=1&sync=${server.url}`;
    const a = await player(browser, url, 'Ada');
    const b = await player(browser, url, 'Bo');
    await expect.poll(() => G<boolean>(a.page, 'g.liveConnected()')).toBe(true);
    await expect.poll(() => G<boolean>(b.page, 'g.liveConnected()')).toBe(true);
    const ada = async () => (await G<R[]>(b.page, 'g.remotes()')).find((r) => r.name === 'Ada');

    // R2: Bo sieht Ada, und Adas Bewegung kommt an
    await expect.poll(async () => !!(await ada()), { timeout: 15_000 }).toBe(true);
    const x0 = (await ada())!.x;
    const sp = await G<{ tx: number; ty: number }>(a.page, 'g.spawn');
    await G(a.page, `g.teleport(${sp.tx + 4}, ${sp.ty})`);
    await expect.poll(async () => (await ada())!.x, { timeout: 10_000 }).toBeGreaterThan(x0 + 60);

    // R4: Chat
    await G(a.page, "g.chat('Hallo Bo!')");
    await expect.poll(async () => (await ada())?.chat, { timeout: 10_000 }).toBe('Hallo Bo!');
    await shot(b.page, 'm12-together');

    // R3: Gemeinsamer Kampf – Adas Treffer schadet dem Gegner auch bei Bo
    const e = await G<{ tx: number; ty: number }>(a.page, "g.findEnemy('slime')");
    for (const p of [a.page, b.page]) await tp(p, e.tx - 3, e.ty);
    let hitId = '';
    await expect
      .poll(async () => {
        const t = await G<{ id: string; x: number; y: number; hp: number } | null>(a.page, '(() => { const p = g.player; const e = [...g.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; return e ? { ...e } : null; })()');
        if (!t) return '';
        await G(a.page, `g.teleport(${Math.floor((t.x - 24) / 32)}, ${Math.floor(t.y / 32)})`);
        await a.page.keyboard.press('d');
        const n = await G<number>(a.page, 'g.attacks');
        await a.page.keyboard.press('Space');
        await expect.poll(() => G<number>(a.page, 'g.attacks')).toBeGreaterThan(n);
        await expect.poll(() => G<boolean>(a.page, 'g.swinging')).toBe(false);
        const hit = await G<{ hp: number } | null>(a.page, `(() => { const e = g.enemies.find((x) => x.id === "${t.id}"); return e ? { hp: e.hp } : null; })()`);
        if (!hit || hit.hp < t.hp) hitId = t.id;
        return hitId;
      }, { timeout: 40_000, intervals: [0] })
      .not.toBe('');
    await expect
      .poll(() => G<boolean>(b.page, `(() => { const e = g.enemies.find((x) => x.id === "${hitId}"); return !e || e.hp < 24; })()`), { timeout: 10_000 })
      .toBe(true);
    await shot(a.page, 'm12-fight');
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    await a.close();
    await b.close();
  } finally {
    server.stop();
  }
});
