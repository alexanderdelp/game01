import { expect, test, type Page } from '@playwright/test';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;

test('Kampf-Arena: startet ohne Welt, Gegner per Knopf, Werte live einstellbar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?arena=1');
  await expect.poll(() => G<string>(page, 'g.scene'), { timeout: 30_000 }).toBe('arena');
  await expect.poll(() => G<number>(page, 'g.enemies.length')).toBe(1);
  // Gegner per Knopf
  await page.getByRole('button', { name: 'Räuber' }).click();
  await page.getByRole('button', { name: 'Drohne' }).click();
  await expect.poll(() => G<number>(page, 'g.enemies.length')).toBe(3);
  // Regler: Lauftempo verdoppeln wirkt sofort
  await G(page, "g.arenaTune('move.speed', 300)");
  const x0 = await G<number>(page, 'g.player.x');
  await page.keyboard.down('a');
  await page.waitForTimeout(400);
  await page.keyboard.up('a');
  expect(await G<number>(page, 'g.player.x')).toBeLessThan(x0);
  await page.keyboard.press('Space');
  await expect.poll(() => G<number>(page, 'g.attacks')).toBe(1);
  // Werte kopieren zeigt den Code-Ausschnitt
  await page.getByRole('button', { name: 'Werte kopieren' }).click();
  await expect(page.locator('#arena-code')).toContainText('speed: 300');
  await expect(page.locator('#arena-stats')).toContainText('Hiebe 1');
  await page.screenshot({ path: 'screenshots/arena.png' });
  // Einstellungen bleiben nach Neuladen erhalten
  await page.reload();
  await expect.poll(() => G<string>(page, 'g.scene'), { timeout: 30_000 }).toBe('arena');
  await expect(page.locator('#arena-panel input[data-id="move.speed"]')).toHaveValue('300');
  expect(errors).toEqual([]);
});
