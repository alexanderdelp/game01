import { expect, test, type Page } from '@playwright/test';
import { open, skipCreation, waitReady } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;
type State = { chests: string[]; discovered: Record<string, string>; prosperity: Record<string, number>; reputation: Record<string, number> };

test('M9: Orte wachsen, Ansehen, Speichern, Schnellreise (R2–R5)', async ({ page }) => {
  const errors = await open(page, 'persist-world');
  const town = await G<{ name: string; tx: number; ty: number }>(page, 'g.meta.settlements[0]');
  await G(page, `g.teleport(${town.tx}, ${town.ty + 2})`);
  await waitReady(page);
  await expect.poll(async () => (await G<State>(page, 'g.state()')).discovered['town:0'], { timeout: 10_000 }).toBe('Testheld');

  // 10 erledigte Quests für den Ort → Statue
  for (let i = 0; i < 10; i++) await G(page, `g.recordQuest(${town.tx}, ${town.ty})`);
  const st = await G<State>(page, 'g.state()');
  expect(st.prosperity['0']).toBe(10);
  expect(Object.values(st.reputation)[0]).toBeGreaterThanOrEqual(100);
  await page.keyboard.press('e');
  await page.keyboard.press('e');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'screenshots/m9-statue.png' });

  // Händlerrabatt
  let discount = false;
  for (let i = 0; i < 6 && !discount; i++) {
    const m = await G<{ x: number; y: number } | null>(page, "(() => { const m = g.npcs.find((n) => n.role === 'merchant'); return m ? { ...m } : null; })()");
    if (!m) break;
    await G(page, `g.teleport(${Math.floor(m.x / 32)}, ${Math.floor(m.y / 32)})`);
    await page.keyboard.press('e');
    const d = await G<{ choices?: string[] } | null>(page, 'g.dialog');
    discount = !!d?.choices?.[0]?.includes('−');
    await page.keyboard.press('e');
  }
  expect(discount).toBe(true);

  // Neuladen: Zustand bleibt
  await page.waitForTimeout(2200);
  await page.reload();
  await skipCreation(page);
  await waitReady(page);
  const st2 = await G<State>(page, 'g.state()');
  expect(st2.prosperity['0']).toBe(10);
  expect(st2.discovered['town:0']).toBe('Testheld');

  // Schnellreise über die Karte
  const sp = await G<{ tx: number; ty: number }>(page, 'g.spawn');
  await G(page, `g.teleport(${sp.tx}, ${sp.ty})`);
  await waitReady(page);
  await expect.poll(() => G<boolean>(page, 'g.mapReady'), { timeout: 30_000 }).toBe(true);
  await page.keyboard.press('m');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/m9-map.png' });
  expect(await G<boolean>(page, "g.clickPanel('travel-0')")).toBe(true);
  await expect
    .poll(async () => {
      const p = await G<{ x: number; y: number }>(page, '({ ...g.player })');
      return Math.hypot(p.x / 32 - town.tx, p.y / 32 - town.ty);
    }, { timeout: 10_000 })
    .toBeLessThan(5);
  expect(errors).toEqual([]);
});
