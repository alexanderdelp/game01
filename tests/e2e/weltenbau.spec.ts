import { expect, test } from '@playwright/test';
import { G, open, saveAndReload, shot, skipCreation, talkTo, tp, waitReady, watchErrors } from './helpers';

// Modul Weltenbau: NPCs, Orte, Geheimnisse, Weltzustand, lebendige Welt, Fraktionstreue.
// Erzeugung (Reiche, Orte, NPCs, Simulation, Wetter, Karawanen, Ereignisprotokoll) prüfen die Unit-Tests m3, m8–m10, m15.

type Town = { id: number; name: string; tx: number; ty: number; capital: boolean; realm: number };
type State = { chests: string[]; discovered: Record<string, string>; prosperity: Record<string, number>; reputation: Record<string, number> };
type Npc = { id: string; x: number; y: number };

test('M3: NPCs wandern und lassen sich ansprechen (R3, R5)', async ({ page }) => {
  const errors = await open(page, 'test');
  await expect.poll(() => G<number>(page, 'g.npcs.length'), { timeout: 15_000 }).toBeGreaterThan(0);
  const before = await G<Npc[]>(page, 'g.npcs.map((n) => ({ ...n }))');
  const moved = () =>
    G<number>(page, `g.npcs.filter((a) => { const b = ${JSON.stringify(before)}.find((n) => n.id === a.id); return b && Math.hypot(a.x - b.x, a.y - b.y) > 8; }).length`);
  await expect.poll(moved, { timeout: 30_000, intervals: [500] }).toBeGreaterThan(0);

  await talkTo(page, { id: before[0].id });
  await shot(page, 'm3-dialog');
  await page.keyboard.press('e');
  expect(await G<unknown>(page, 'g.dialog')).toBeNull();
  expect(errors).toEqual([]);
});

test('M8/M15: Hauptstadt ohne Gegner, Treueschwur, Händler mit Gruß, Rivale verweigert (M8 R3, M15 R3)', async ({ page }) => {
  const errors = await open(page, 'test');
  const towns = await G<Town[]>(page, 'g.meta.settlements');
  const rivals = await G<number[]>(page, 'g.meta.rivals');
  const capA = towns.find((t) => t.capital)!;
  const capRival = towns.find((t) => t.capital && t.realm === rivals[capA.realm])!;

  await tp(page, capA.tx + 1, capA.ty + 1);
  await expect.poll(() => G<string>(page, 'g.town'), { timeout: 10_000 }).toBe(capA.name);
  expect(await G<number>(page, `g.enemies.filter((e) => Math.hypot(e.x / 32 - ${capA.tx}, e.y / 32 - ${capA.ty}) < 12).length`)).toBe(0);
  await shot(page, 'm8-town');

  // Herrscher: Treue schwören
  const d = await talkTo(page, { role: 'ruler' }, (x) => x.name.includes('Herrscher'));
  expect(d.choices?.[0]).toBe('Treue schwören');
  await shot(page, 'm15-ruler');
  await page.keyboard.press('1');
  expect(await G<number | null>(page, 'g.pledge()')).toBe(capA.realm);

  // Händler im eigenen Reich: grüßt den Gefolgsmann und verkauft einen Trank
  await G(page, 'g.hero.shards = 50');
  const md = await talkTo(page, { role: 'merchant' }, (x) => x.choices?.length === 3);
  expect(md.text).toContain('Gefolgsmann');
  await shot(page, 'm8-merchant');
  const potions = await G<number>(page, 'g.hero.potions');
  await page.keyboard.press('1');
  expect(await G<number>(page, 'g.hero.potions')).toBe(potions + 1);
  expect(await G<number>(page, 'g.hero.shards')).toBeLessThan(50);
  await page.keyboard.press('e');

  // Hauptstadt des Rivalen: Händler verweigert den Handel
  await tp(page, capRival.tx, capRival.ty + 1);
  const rd = await talkTo(page, { role: 'merchant' });
  expect(rd.text).toContain('Feinde');
  expect(rd.choices).toBeUndefined();
  await shot(page, 'm15-refused');
  expect(errors).toEqual([]);
});

test('M8: Truhe öffnen, Obelisk lesen, Chronik (R4)', async ({ page }) => {
  const errors = await open(page, 'test');
  const chest = await G<{ id: string; tx: number; ty: number }>(
    page,
    `(() => { const s = g.spawn; for (let r = 0; r < 40; r++) for (let cy = Math.floor(s.ty / 16) - r; cy <= Math.floor(s.ty / 16) + r; cy++) for (let cx = Math.floor(s.tx / 16) - r; cx <= Math.floor(s.tx / 16) + r; cx++) { const p = g.meta.chunkPoi(cx, cy); if (p && p.kind === 'chest') return p; } return null; })()`,
  );
  await tp(page, chest.tx, chest.ty + 1);
  await page.keyboard.press('e');
  await expect.poll(() => G<string[]>(page, 'g.state().chests')).toContain(chest.id);
  expect(await G<number>(page, 'g.pickups')).toBeGreaterThan(0);
  await shot(page, 'm8-chest');

  const ob = await G<{ tx: number; ty: number }>(page, 'g.meta.obelisks[0]');
  await tp(page, ob.tx, ob.ty + 1);
  await page.keyboard.press('e');
  await expect.poll(() => G<number>(page, '(g.hero.chronicle ?? []).length')).toBe(1);
  await shot(page, 'm8-obelisk');
  await page.keyboard.press('e');
  await page.keyboard.press('b');
  expect(await G<boolean>(page, 'g.chronicleOpen')).toBe(true);
  await shot(page, 'm8-chronicle');
  await page.keyboard.press('b');
  expect(errors).toEqual([]);
});

test('M9: Ort entdecken, Wohlstand, Rabatt, Speichern, Schnellreise (R2–R5)', async ({ page }) => {
  const errors = await open(page, 'persist-world');
  const town = await G<Town>(page, 'g.meta.settlements[0]');
  await tp(page, town.tx, town.ty + 2);
  await expect.poll(async () => (await G<State>(page, 'g.state()')).discovered['town:0'], { timeout: 10_000 }).toBe('Testheld');

  // 10 erledigte Quests für den Ort → Statue, Ansehen
  for (let i = 0; i < 10; i++) await G(page, `g.recordQuest(${town.tx}, ${town.ty})`);
  const st = await G<State>(page, 'g.state()');
  expect(st.prosperity['0']).toBe(10);
  expect(Object.values(st.reputation)[0]).toBeGreaterThanOrEqual(100);
  await shot(page, 'm9-statue');

  // Händlerrabatt
  const d = await talkTo(page, { role: 'merchant' }, (x) => !!x.choices?.length);
  expect(d.choices![0]).toContain('−');
  await page.keyboard.press('e');

  // Neuladen: Zustand bleibt
  await saveAndReload(page);
  const st2 = await G<State>(page, 'g.state()');
  expect(st2.prosperity['0']).toBe(10);
  expect(st2.discovered['town:0']).toBe('Testheld');

  // Schnellreise über die Karte (auch M22 R3)
  const sp = await G<{ tx: number; ty: number }>(page, 'g.spawn');
  await tp(page, sp.tx, sp.ty);
  await expect.poll(() => G<boolean>(page, 'g.mapReady'), { timeout: 30_000 }).toBe(true);
  await page.keyboard.press('m');
  await shot(page, 'm9-map');
  expect(await G<boolean>(page, "g.clickPanel('travel-0')")).toBe(true);
  await expect
    .poll(async () => {
      const p = await G<{ x: number; y: number }>(page, '({ ...g.player })');
      return Math.hypot(p.x / 32 - town.tx, p.y / 32 - town.ty);
    }, { timeout: 10_000 })
    .toBeLessThan(5);
  expect(errors).toEqual([]);
});

test('M10: Karawane steht dort, wo die Simulation sie sieht, und handelt (R2, R3)', async ({ page }) => {
  const errors = await open(page, 'test');
  // Wetterwechsel selbst prüft m10.test.ts; hier nur: das Spiel kennt das aktuelle Wetter
  expect(await G<string>(page, 'g.weather')).not.toBe('');
  const n = await G<number>(page, 'g.caravans.length');
  expect(n).toBeGreaterThan(0);
  // Eine Karawane wählen, die gerade unterwegs ist (am Ziel rasten sie kurz)
  const ci = await G<number>(page, 'g.caravans.findIndex((_, i) => !g.caravanAt(i).resting)');
  expect(ci).toBeGreaterThanOrEqual(0);
  const p0 = await G<{ tx: number; ty: number }>(page, `g.caravanAt(${ci})`);
  await tp(page, p0.tx, p0.ty);
  await expect.poll(() => G<number>(page, `g.npcs.filter((n) => n.id === 'car${ci}').length`), { timeout: 25_000 }).toBe(1);
  const c = await talkTo(page, { id: `car${ci}` }, (d) => d.choices?.length === 3);
  expect(c.choices).toHaveLength(3);
  await shot(page, 'm10-caravan');
  expect(errors).toEqual([]);
});

test('M10: Nach Abwesenheit erscheinen Neuigkeiten (R6)', async ({ page }) => {
  // Testmodus: Weltzeit = EPOCH + 1000 Tage + Mittag. Zuletzt gesehen 6 Stunden davor.
  const EPOCH = Date.UTC(2026, 0, 1);
  const DAY = 24 * 60_000;
  const seen = EPOCH + 1000 * DAY + DAY / 2 - 6 * 3_600_000;
  await page.addInitScript((t) => localStorage.setItem('game01:seen:news-test', JSON.stringify(t)), seen);
  const errors = watchErrors(page);
  await page.goto('/?seed=news-test&test=1');
  await skipCreation(page);
  await waitReady(page);
  await expect.poll(() => G<boolean>(page, 'g.newsOpen'), { timeout: 10_000 }).toBe(true);
  await shot(page, 'm10-news');
  expect(errors).toEqual([]);
});
