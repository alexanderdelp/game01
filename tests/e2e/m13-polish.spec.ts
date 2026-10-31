import { expect, test, type Page } from '@playwright/test';
import { skipCreation, waitReady } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;

test('M13: Titelbildschirm, neue Welt, Weiterspielen (R2) und Hinweise (R4)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect.poll(() => G<string>(page, 'g.scene'), { timeout: 30_000 }).toBe('title');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m13-title.png' });
  await G(page, "g.titleStart('titel-test')");
  await expect.poll(() => G<string>(page, 'g.scene')).not.toBe('title');
  await skipCreation(page);
  await waitReady(page);
  expect(page.url()).toContain('seed=titel-test');
  await expect.poll(() => G<number>(page, 'g.tipsShown'), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: 'screenshots/m13-tips.png' });
  // Zurück zum Titel: Welt steht unter "Weiterspielen"
  await page.keyboard.press('h');
  expect(await G<boolean>(page, 'g.menuOpen')).toBe(true);
  expect(await G<boolean>(page, "g.clickPanel('menu-11')")).toBe(true);
  await expect.poll(() => G<string>(page, 'g.scene')).toBe('title');
  await page.screenshot({ path: 'screenshots/m13-title2.png' });
  await G(page, "g.titleStart('titel-test')");
  await expect.poll(() => G<string>(page, 'g.scene')).toBe('world');
  await waitReady(page);
  // Hinweise nur beim ersten Mal
  await page.waitForTimeout(1500);
  expect(await G<number>(page, 'g.tipsShown')).toBe(0);
  expect(errors).toEqual([]);
});

test.describe('Touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('M13: Menü und Aktionsknopf (R1)', async ({ page }) => {
    await page.goto('/?seed=touch-menu');
    await skipCreation(page);
    await waitReady(page);
    // ☰ steht links neben "Karte" oben rechts
    await page.screenshot({ path: 'screenshots/m13-mobile.png' });
    await G(page, "g.clickPanel('action')");
    await page.keyboard.press('h');
    expect(await G<boolean>(page, 'g.menuOpen')).toBe(true);
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'screenshots/m13-menu.png' });
    expect(await G<boolean>(page, "g.clickPanel('menu-0')")).toBe(true);
    expect(await G<boolean>(page, 'g.panelOpen')).toBe(true);
    expect(await G<boolean>(page, 'g.menuOpen')).toBe(false);
    // Musik ausschalten bleibt gespeichert (R3)
    await page.keyboard.press('c');
    await page.keyboard.press('h');
    expect(await G<boolean>(page, "g.clickPanel('menu-10')")).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('game01:audio'))).toBe('false');
  });
});
