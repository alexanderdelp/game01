import { expect, test } from '@playwright/test';
import { hold, open, state, waitReady } from './helpers';

test('M2: Figur läuft, Kamera folgt, Animation passt (R1, R2)', async ({ page }) => {
  const errors = await open(page, 'test');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m2-start.png' });

  // In mindestens drei Richtungen muss Bewegung möglich sein (Bäume können einzelne blockieren).
  let moved = 0;
  for (const [key, facing] of [['d', 'right'], ['s', 'down'], ['a', 'left'], ['w', 'up']] as const) {
    const before = await state(page);
    await page.keyboard.down(key);
    await page.waitForTimeout(150);
    expect((await state(page)).player.facing).toBe(facing);
    expect((await state(page)).player.moving).toBe(true);
    await page.waitForTimeout(250);
    await page.keyboard.up(key);
    const after = await state(page);
    if (Math.hypot(after.player.x - before.player.x, after.player.y - before.player.y) > 10) moved++;
  }
  expect(moved).toBeGreaterThanOrEqual(3);
  await page.waitForTimeout(100);
  expect((await state(page)).player.moving).toBe(false);
  expect(errors).toEqual([]);
});

test('M2: Wasser ist eine Grenze (R3)', async ({ page }) => {
  await open(page, 'test');
  const shore = await page.evaluate(() => (window as unknown as { __game: { findShore(): { tx: number; ty: number } } }).__game.findShore());
  expect(shore).not.toBeNull();
  await page.evaluate(([tx, ty]) => (window as unknown as { __game: { teleport(x: number, y: number): void } }).__game.teleport(tx, ty), [shore!.tx, shore!.ty]);
  await page.waitForTimeout(500);
  await waitReady(page);
  await hold(page, 'd', 1200);
  const s = await state(page);
  expect(s.focus.tx).toBe(shore!.tx);
  await page.screenshot({ path: 'screenshots/m2-shore.png' });
});

test('M2: Position bleibt nach Neuladen erhalten (R6)', async ({ page }) => {
  await open(page, 'persist-test');
  await hold(page, 'd', 600);
  await hold(page, 's', 600);
  await page.waitForTimeout(2200);
  const before = (await state(page)).player;
  await page.reload();
  await waitReady(page);
  const after = (await state(page)).player;
  expect(Math.abs(after.x - before.x)).toBeLessThan(3);
  expect(Math.abs(after.y - before.y)).toBeLessThan(3);
});

test.describe('Touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('M2: virtueller Stick und Karten-Button (R8)', async ({ page }) => {
    await open(page, 'test');
    expect((await state(page)).zoom).toBe(1);
    const before = (await state(page)).player;
    // Ziehen nach rechts/unten: der Stick steuert in Zugrichtung.
    await page.mouse.move(200, 500);
    await page.mouse.down();
    await page.mouse.move(240, 500, { steps: 4 });
    await page.waitForTimeout(600);
    await page.mouse.move(200, 540, { steps: 4 });
    await page.waitForTimeout(600);
    await page.mouse.up();
    const after = (await state(page)).player;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(20);
    await page.screenshot({ path: 'screenshots/m2-mobile.png' });

    await page.touchscreen.tap(360, 25);
    await expect.poll(async () => (await state(page)).mapOpen).toBe(true);
  });
});
