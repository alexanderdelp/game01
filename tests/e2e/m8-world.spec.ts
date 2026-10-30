import { expect, test, type Page } from '@playwright/test';
import { open, waitReady } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;
const tp = async (page: Page, tx: number, ty: number) => {
  await G(page, `g.teleport(${tx}, ${ty})`);
  await page.waitForTimeout(300);
  await waitReady(page);
};

test('M8: Stadt, Händler, Truhe, Obelisk, Chronik, Karte (R3–R5)', async ({ page }) => {
  const errors = await open(page, 'test');
  // Stadt besuchen
  const town = await G<{ name: string; tx: number; ty: number }>(page, 'g.meta.settlements.find((s) => s.capital)');
  await tp(page, town.tx + 1, town.ty + 1);
  await expect.poll(() => G<string>(page, 'g.town'), { timeout: 10_000 }).toBe(town.name);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/m8-town.png' });
  expect(await G<number>(page, 'g.enemies.filter((e) => Math.hypot(e.x / 32 - ' + town.tx + ', e.y / 32 - ' + town.ty + ') < 12).length')).toBe(0);

  // Händler: Trank kaufen
  await G(page, 'g.hero.shards = 50');
  const merchant = await G<{ x: number; y: number } | null>(page, "(() => { const m = g.npcs.find((n) => n.role === 'merchant'); return m ? { ...m } : null; })()");
  expect(merchant).not.toBeNull();
  let traded = false;
  for (let i = 0; i < 6 && !traded; i++) {
    const m = await G<{ x: number; y: number }>(page, "({ ...g.npcs.find((n) => n.role === 'merchant') })");
    await G(page, `g.teleport(${Math.floor(m.x / 32)}, ${Math.floor(m.y / 32)})`);
    await page.keyboard.press('e');
    const d = await G<{ choices?: string[] } | null>(page, 'g.dialog');
    if (d?.choices?.length === 3) {
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'screenshots/m8-merchant.png' });
      const potions = await G<number>(page, 'g.hero.potions');
      await page.keyboard.press('1');
      expect(await G<number>(page, 'g.hero.potions')).toBe(potions + 1);
      expect(await G<number>(page, 'g.hero.shards')).toBe(40);
      traded = true;
    } else if (d) await page.keyboard.press('e');
  }
  expect(traded).toBe(true);
  await page.keyboard.press('e');

  // Truhe in der Nähe des Startpunkts finden und öffnen
  const chest = await G<{ id: string; tx: number; ty: number }>(page, `(() => { const s = g.spawn; for (let r = 0; r < 40; r++) for (let cy = Math.floor(s.ty / 16) - r; cy <= Math.floor(s.ty / 16) + r; cy++) for (let cx = Math.floor(s.tx / 16) - r; cx <= Math.floor(s.tx / 16) + r; cx++) { const p = g.meta.chunkPoi(cx, cy); if (p && p.kind === 'chest') return p; } return null; })()`);
  await tp(page, chest.tx, chest.ty + 1);
  await page.keyboard.press('e');
  await expect.poll(() => G<string[]>(page, 'g.state().chests')).toContain(chest.id);
  expect(await G<number>(page, 'g.pickups')).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/m8-chest.png' });

  // Obelisk lesen → Chronik
  const ob = await G<{ tx: number; ty: number }>(page, 'g.meta.obelisks[0]');
  await tp(page, ob.tx, ob.ty + 1);
  await page.keyboard.press('e');
  await expect.poll(() => G<number>(page, '(g.hero.chronicle ?? []).length')).toBe(1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m8-obelisk.png' });
  await page.keyboard.press('e');
  await page.keyboard.press('b');
  expect(await G<boolean>(page, 'g.chronicleOpen')).toBe(true);
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/m8-chronicle.png' });
  await page.keyboard.press('b');

  // Karte mit Reichen
  await expect.poll(() => G<boolean>(page, 'g.mapReady'), { timeout: 30_000 }).toBe(true);
  await page.keyboard.press('m');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m8-map.png' });
  await page.keyboard.press('m');
  expect(errors).toEqual([]);
});
