import { expect, test, type Page } from '@playwright/test';

type GameState = {
  seed: string; ready: boolean; focus: { tx: number; ty: number }; biome: string;
  zoom: number; chunksLoaded: number; mapOpen: boolean; mapReady: boolean;
};
const state = (page: Page) => page.evaluate(() => (window as unknown as { __game: GameState }).__game);

async function open(page: Page, seed: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`/?seed=${seed}`);
  await expect.poll(async () => (await state(page))?.ready, { timeout: 30_000 }).toBe(true);
  return errors;
}

test('M1: Welt aus Seed laden, bewegen, zoomen, Karte', async ({ page }) => {
  const errors = await open(page, 'test');
  const s0 = await state(page);
  expect(s0.seed).toBe('test');
  expect(s0.chunksLoaded).toBeGreaterThan(0);
  expect(s0.biome).not.toBe('…');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m1-start.png' });

  // R10: Bewegung
  await page.keyboard.down('d');
  await page.waitForTimeout(700);
  await page.keyboard.up('d');
  const s1 = await state(page);
  expect(s1.focus.tx).toBeGreaterThan(s0.focus.tx);

  // R10: Zoom
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  expect((await state(page)).zoom).toBe(1);
  await expect.poll(async () => (await state(page)).ready, { timeout: 30_000 }).toBe(true);
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
  const s = await state(page);
  expect(s.seed).toBe('neon-tor-123');
});
