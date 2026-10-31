import { expect, test, type Page } from '@playwright/test';
import { open, state, waitReady } from './helpers';

type G = {
  enemies: { id: string; kind: string; x: number; y: number; hp: number; state: string }[];
  hp: number; alive: boolean; attacks: number;
  player: { x: number; y: number };
  spawn: { tx: number; ty: number };
  findEnemy(kind?: string): { tx: number; ty: number; kind: string } | null;
  teleport(tx: number, ty: number): void;
  damagePlayer(n: number): void;
};
const enemyCount = (page: Page) => page.evaluate(() => (window as unknown as { __game: G }).__game.enemies.length);

async function goToEnemy(page: Page, kind?: string) {
  const e = await page.evaluate((k) => (window as unknown as { __game: G }).__game.findEnemy(k), kind);
  expect(e).not.toBeNull();
  await page.evaluate(([tx, ty]) => (window as unknown as { __game: G }).__game.teleport(tx - 3, ty), [e!.tx, e!.ty]);
  await waitReady(page);
  await expect.poll(() => enemyCount(page), { timeout: 15_000 }).toBeGreaterThan(0);
  return e!;
}

test('M4: Gegner angreifen und besiegen (R1, R3, R5)', async ({ page }) => {
  const errors = await open(page, 'test');
  await goToEnemy(page, 'slime');
  // Kämpfen: zum nächsten Gegner laufen und zuschlagen, bis einer verschwindet oder Schaden nimmt.
  let damaged = false;
  for (let i = 0; i < 40 && !damaged; i++) {
    const s = await page.evaluate(() => {
      const w = (window as unknown as { __game: G }).__game;
      const p = w.player;
      const e = [...w.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      return { p, e: e ? { ...e } : null };
    });
    if (!s.e) {
      damaged = true;
      break;
    }
    const dx = s.e.x - s.p.x;
    const dy = s.e.y - s.p.y;
    const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'd' : 'a') : dy > 0 ? 's' : 'w';
    await page.keyboard.down(key);
    await page.waitForTimeout(Math.hypot(dx, dy) > 40 ? 250 : 60);
    await page.keyboard.up(key);
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    if (i === 6) await page.screenshot({ path: 'screenshots/m4-fight.png' });
    const now = await page.evaluate(() => (window as unknown as { __game: G }).__game.enemies.map((e) => ({ ...e })));
    damaged = now.some((e) => e.hp < 24 * 1.25 && e.id === s.e!.id && e.hp < (s.e!.hp as number)) || !now.find((e) => e.id === s.e!.id);
  }
  expect(damaged).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __game: G }).__game.attacks)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('M4: Gegner greifen an, Spieler stirbt und erwacht am Startpunkt (R3, R4)', async ({ page }) => {
  await open(page, 'test');
  await goToEnemy(page, 'slime');
  // Immer wieder direkt neben den nächsten Gegner stellen: Gegner wandern, auf dem langsamen Testrechner
  // kann ein Hindernis dazwischen liegen
  await expect.poll(async () => page.evaluate(() => {
    const g = (window as unknown as { __game: G }).__game;
    const p = g.player;
    const e = [...g.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (e && g.hp >= 100) g.teleport(Math.floor(e.x / 32) - 1, Math.floor(e.y / 32));
    return g.hp;
  }), { timeout: 45_000, intervals: [3000] }).toBeLessThan(100);
  await page.screenshot({ path: 'screenshots/m4-hurt.png' });
  await page.evaluate(() => (window as unknown as { __game: G }).__game.damagePlayer(999));
  await page.evaluate(() => (window as unknown as { __game: G }).__game.damagePlayer(999));
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __game: G }).__game.alive)).toBe(false);
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __game: G }).__game.alive), { timeout: 10_000 }).toBe(true);
  const s = await state(page);
  const sp = await page.evaluate(() => (window as unknown as { __game: G }).__game.spawn);
  expect(Math.abs(Math.floor(s.player.x / 32) - sp.tx)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => (window as unknown as { __game: G }).__game.hp)).toBe(100);
});

test.describe('Touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('M4: Angriffsbutton (R7)', async ({ page }) => {
    await open(page, 'test');
    await page.touchscreen.tap(390 - 60, 844 - 90);
    await expect.poll(async () => page.evaluate(() => (window as unknown as { __game: G }).__game.attacks)).toBe(1);
    await page.screenshot({ path: 'screenshots/m4-mobile.png' });
  });
});
