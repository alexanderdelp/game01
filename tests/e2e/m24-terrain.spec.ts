import { expect, test } from '@playwright/test';
import { hold, open, state } from './helpers';

type G = {
  sightHidden: number; ready: boolean; chunksLoaded: number;
  teleport(tx: number, ty: number): void;
  findCliff(): { tx: number; ty: number } | null;
  seesTile(tx: number, ty: number): boolean;
  enemies: { x: number; y: number; seen?: boolean }[];
};
const game = (p: import('@playwright/test').Page) => p.evaluate(() => (window as unknown as { __game: G }).__game);

test('M24: Klippen versperren den Weg, Sichtschatten verdeckt Gelände und Gegner', async ({ page }) => {
  const errors = await open(page, 'test');
  await page.setViewportSize({ width: 1280, height: 720 });

  // R3: unter einer Felswand nach oben laufen – man kommt nicht hinauf
  const cliff = await page.evaluate(() => (window as unknown as { __game: G }).__game.findCliff());
  expect(cliff).not.toBeNull();
  await page.evaluate(([tx, ty]) => (window as unknown as { __game: G }).__game.teleport(tx, ty), [cliff!.tx, cliff!.ty]);
  await expect.poll(async () => (await game(page)).chunksLoaded, { timeout: 20_000 }).toBeGreaterThan(8);
  await page.waitForTimeout(500);
  const before = (await state(page)).player;
  await hold(page, 'w', 1500);
  const after = (await state(page)).player;
  expect(after.y).toBeGreaterThan(cliff!.ty * 32 - 2);
  expect(before.y - after.y).toBeLessThan(32);

  // R6: Sichtschatten über verdecktem Gelände (am Fuß einer Felswand sieht man nicht hinauf)
  await expect.poll(async () => (await game(page)).sightHidden, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(([tx, ty]) => (window as unknown as { __game: G }).__game.seesTile(tx, ty), [cliff!.tx, cliff!.ty])).toBe(true);
  // Gegner sind genau dann sichtbar, wenn ihre Kachel sichtbar ist
  const g = await game(page);
  for (const e of g.enemies) {
    const seen = await page.evaluate(([x, y]) => (window as unknown as { __game: G }).__game.seesTile(Math.floor(x / 32), Math.floor((y - 4) / 32)), [e.x, e.y]);
    expect(e.seen).toBe(seen);
  }
  await page.screenshot({ path: 'screenshots/m24-klippe.png' });
  expect(errors).toEqual([]);
});
