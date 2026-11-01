import { expect, test } from '@playwright/test';
import { G, hold, open, saveAndReload, shot, state, tp, walk } from './helpers';

// Modul Welt: Laden aus dem Seed, Bewegung, Grenzen, Höhen/Sicht, Fog of War.
// Generierung, Kollision, Höhen und Sicht selbst prüfen die Unit-Tests (world, m2, m19, m20, m24, m26).

test('M1/M2: Welt aus Seed, Zoom, Karte, Laufen in alle Richtungen (M1 R7–R10, M2 R1/R2)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors = await open(page, 'test');
  const s0 = await state(page);
  expect(s0.seed).toBe('test');
  expect(s0.chunksLoaded).toBeGreaterThan(0);
  expect(s0.biome).not.toBe('…');

  // Laufen: mindestens zwei Richtungen müssen frei sein (Bäume können einzelne blockieren)
  let moved = 0;
  for (const [key, facing] of [['d', 'right'], ['s', 'down'], ['a', 'left'], ['w', 'up']] as const) {
    if ((await walk(page, key, 10, 5_000)) > 10) moved++;
    expect((await state(page)).player.facing).toBe(facing);
  }
  expect(moved).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await state(page)).player.moving).toBe(false);

  // Zoom (R10) und Weltkarte (R8)
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  // M27: fester Ausschnitt – bei 1280 × 720 ist Zoom 2 das Minimum (höchstens 32 × 18 Kacheln)
  expect((await state(page)).zoom).toBe(2);
  await shot(page, 'm1-zoom1');
  await expect.poll(async () => (await state(page)).mapReady, { timeout: 30_000 }).toBe(true);
  await page.keyboard.press('m');
  await expect.poll(async () => (await state(page)).mapOpen).toBe(true);
  await shot(page, 'm1-map');
  await page.keyboard.press('m');
  await expect.poll(async () => (await state(page)).mapOpen).toBe(false);
  expect(errors).toEqual([]);
});

test('M2/M20: Wasser ist eine Grenze; Position und Erkundetes überstehen das Neuladen (M2 R3/R6, M20 R2)', async ({ page }) => {
  const errors = await open(page, 'nebel-test');
  const s = await G<{ tx: number; ty: number }>(page, '({ ...g.spawn })');
  await expect.poll(() => G<boolean>(page, `g.fogKnows(${s.tx}, ${s.ty})`)).toBe(true);
  expect(await G<boolean>(page, `g.fogKnows(${s.tx + 900}, ${s.ty - 400})`)).toBe(false);
  expect(await G<number>(page, 'g.fogFraction()')).toBeLessThan(0.01);

  // Ans Ufer: dort wird es aufgedeckt, nach rechts (Wasser) geht es nicht weiter
  const shore = await G<{ tx: number; ty: number } | null>(page, 'g.findShore()');
  expect(shore).not.toBeNull();
  await tp(page, shore!.tx, shore!.ty);
  await expect.poll(() => G<boolean>(page, `g.fogKnows(${shore!.tx}, ${shore!.ty})`)).toBe(true);
  await hold(page, 'd', 30);
  expect((await state(page)).player.facing).toBe('right');
  expect((await state(page)).focus.tx).toBe(shore!.tx);
  await shot(page, 'm2-shore');

  // Ein Stück zurück laufen, dann speichern und neu laden
  await hold(page, 'a', 10);
  const before = (await state(page)).player;
  await saveAndReload(page);
  const after = (await state(page)).player;
  expect(Math.abs(after.x - before.x)).toBeLessThan(3);
  expect(Math.abs(after.y - before.y)).toBeLessThan(3);
  expect(await G<boolean>(page, `g.fogKnows(${shore!.tx}, ${shore!.ty})`)).toBe(true);
  expect(errors).toEqual([]);
});

test('M24: Klippen versperren den Weg, Sichtschatten verdeckt Gelände und Gegner (R6)', async ({ page }) => {
  const errors = await open(page, 'test');
  const cliff = await G<{ tx: number; ty: number } | null>(page, 'g.findCliff()');
  expect(cliff).not.toBeNull();
  await tp(page, cliff!.tx, cliff!.ty);
  await expect.poll(async () => (await state(page)).chunksLoaded, { timeout: 20_000 }).toBeGreaterThan(8);

  // Unter der Felswand nach oben laufen – man kommt nicht hinauf
  const before = (await state(page)).player;
  await hold(page, 'w', 30);
  expect((await state(page)).player.facing).toBe('up');
  const after = (await state(page)).player;
  expect(after.y).toBeGreaterThan(cliff!.ty * 32 - 2);
  expect(before.y - after.y).toBeLessThan(32);

  // Am Fuß der Wand sieht man nicht hinauf; Gegner sind genau dann sichtbar, wenn ihre Kachel sichtbar ist
  await expect.poll(() => G<number>(page, 'g.sightHidden'), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await G<boolean>(page, `g.seesTile(${cliff!.tx}, ${cliff!.ty})`)).toBe(true);
  const mismatch = await G<number>(page, 'g.enemies.filter((e) => e.seen !== g.seesTile(Math.floor(e.x / 32), Math.floor((e.y - 4) / 32))).length');
  expect(mismatch).toBe(0);
  await shot(page, 'm24-klippe');
  expect(errors).toEqual([]);
});
