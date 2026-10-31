import { expect, test, type Page } from '@playwright/test';
import { open } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;

test('M22: Weltkarte zoomen und verschieben, feiner Ausschnitt ab 4×', async ({ page }) => {
  const errors = await open(page, 'karte-test');
  // Etwas erkunden, damit die Karte nicht nur Nebel zeigt
  const s = await G<{ tx: number; ty: number }>(page, '({ ...g.spawn })');
  for (const [dx, dy] of [[60, 0], [120, 30], [60, 80], [0, 60], [-60, 40]]) {
    await G(page, `g.teleport(${s.tx + dx}, ${s.ty + dy})`);
    await page.waitForTimeout(150);
  }
  await G(page, `g.teleport(${s.tx}, ${s.ty})`);
  await G(page, `g.fogReveal(${s.tx}, ${s.ty}, 700)`);
  await page.keyboard.press('m');
  await expect.poll(() => G<boolean>(page, 'g.mapReady'), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(300);
  expect(await G<number>(page, 'g.mapZoom')).toBe(1);
  await page.screenshot({ path: 'screenshots/m22-zoom1.png' });
  // Zoomen per Knopf und Tastatur
  expect(await G<boolean>(page, "g.clickPanel('map-zoom-in')")).toBe(true);
  await page.keyboard.press('+');
  expect(await G<number>(page, 'g.mapZoom')).toBe(4);
  await expect.poll(() => G<number>(page, 'g.mapDetail'), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m22-zoom4.png' });
  await G(page, 'g.mapZoomBy(1)');
  await G(page, 'g.mapZoomBy(1)');
  await G(page, 'g.mapZoomBy(1)');
  expect(await G<number>(page, 'g.mapZoom')).toBe(16);
  await expect.poll(() => G<number>(page, 'g.mapDetail'), { timeout: 15_000 }).toBe(2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m22-zoom16.png' });
  // Ziehen verschiebt, ohne die Welt zu zoomen
  const zoomBefore = await G<number>(page, 'g.zoom');
  await page.mouse.move(640, 380);
  await page.mouse.down();
  await page.mouse.move(500, 300, { steps: 5 });
  await page.mouse.up();
  await page.mouse.wheel(0, 200);
  await expect.poll(() => G<number>(page, 'g.mapZoom')).toBe(8);
  expect(await G<number>(page, 'g.zoom')).toBe(zoomBefore);
  await page.keyboard.press('m');
  expect(await G<boolean>(page, 'g.mapOpen')).toBe(false);
  expect(errors).toEqual([]);
});
