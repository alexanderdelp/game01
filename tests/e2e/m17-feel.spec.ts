import { expect, test, type Page } from '@playwright/test';
import { open } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;

test('M17: Laufen während des Hiebs, schnelle Hieb-Folge ohne Vormerken (R2, R3)', async ({ page }) => {
  const errors = await open(page, 'test');
  // Einstiegshinweise wegklicken, damit nichts stört
  await page.mouse.click(10, 300);
  // R2: Während des Hiebs läuft die Figur weiter (gemessen in Spielzeit – der Testbrowser läuft gedrosselt).
  await page.keyboard.down('s');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await expect.poll(() => G<boolean>(page, 'g.swinging')).toBe(true);
  const y0 = await G<number>(page, 'g.player.y');
  let y1 = y0;
  while (await G<boolean>(page, 'g.swinging')) {
    y1 = await G<number>(page, 'g.player.y');
    await page.waitForTimeout(30);
  }
  await page.keyboard.up('s');
  expect(y1 - y0).toBeGreaterThan(4);

  // R3: Ein zweiter Druck mitten im Hieb wird nicht vorgemerkt; nach dem Hieb geht der nächste sofort.
  const a0 = await G<number>(page, 'g.attacks');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect.poll(() => G<boolean>(page, 'g.swinging')).toBe(false);
  await page.waitForTimeout(200);
  expect(await G<number>(page, 'g.attacks')).toBe(a0 + 1);
  await page.keyboard.press('Space');
  await expect.poll(() => G<number>(page, 'g.attacks')).toBe(a0 + 2);
  expect(errors).toEqual([]);
});
