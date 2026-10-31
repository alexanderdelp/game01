import { expect, test } from '@playwright/test';
import { open, state, waitReady } from './helpers';

test('M1: Welt aus Seed laden, zoomen, Karte', async ({ page }) => {
  const errors = await open(page, 'test');
  const s0 = await state(page);
  expect(s0.seed).toBe('test');
  expect(s0.chunksLoaded).toBeGreaterThan(0);
  expect(s0.biome).not.toBe('…');

  // R10: Zoom
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  // M27: fester Ausschnitt – bei 1280 × 720 ist Zoom 2 das Minimum (höchstens 32 × 18 Kacheln)
  expect((await state(page)).zoom).toBe(2);
  await waitReady(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m1-zoom1.png' });

  // R8: Weltkarte
  await expect.poll(async () => (await state(page)).mapReady, { timeout: 30_000 }).toBe(true);
  await page.keyboard.press('m');
  expect((await state(page)).mapOpen).toBe(true);
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/m1-map.png' });
  await page.keyboard.press('m');
  expect((await state(page)).mapOpen).toBe(false);

  expect(errors).toEqual([]);
});

test('M1: anderer Seed per URL ergibt andere Welt (R7)', async ({ page }) => {
  await open(page, 'neon-tor-123');
  expect((await state(page)).seed).toBe('neon-tor-123');
});
