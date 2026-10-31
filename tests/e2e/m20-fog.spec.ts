import { expect, test, type Page } from '@playwright/test';
import { open, waitReady } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;

test('M20: Fog of War – nur Erkundetes ist bekannt, bleibt gespeichert', async ({ page }) => {
  const errors = await open(page, 'nebel-test');
  const s = await G<{ tx: number; ty: number }>(page, '({ ...g.spawn })');
  await expect.poll(() => G<boolean>(page, `g.fogKnows(${s.tx}, ${s.ty})`)).toBe(true);
  const far = { tx: s.tx + 900, ty: s.ty - 400 };
  expect(await G<boolean>(page, `g.fogKnows(${far.tx}, ${far.ty})`)).toBe(false);
  expect(await G<number>(page, 'g.fogFraction()')).toBeLessThan(0.01);
  await page.keyboard.press('m');
  await expect.poll(() => G<boolean>(page, 'g.mapReady'), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/m20-map.png' });
  await page.keyboard.press('m');
  // Woanders hin: wird aufgedeckt und überlebt das Neuladen
  const shore = await G<{ tx: number; ty: number } | null>(page, 'g.findShore()');
  expect(shore).not.toBeNull();
  await G(page, `g.teleport(${shore!.tx}, ${shore!.ty})`);
  await expect.poll(() => G<boolean>(page, `g.fogKnows(${shore!.tx}, ${shore!.ty})`)).toBe(true);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'screenshots/m20-minimap.png' });
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await waitReady(page);
  expect(await G<boolean>(page, `g.fogKnows(${shore!.tx}, ${shore!.ty})`)).toBe(true);
  expect(errors).toEqual([]);
});
