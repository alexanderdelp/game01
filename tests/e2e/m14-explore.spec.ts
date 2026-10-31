import { expect, test, type Page } from '@playwright/test';
import { open, waitReady } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;

test('M14: Ruine mit Wächter, Ruinentruhe mit seltenem Fund (R3)', async ({ page }) => {
  const errors = await open(page, 'test');
  const r = await G<{ tx: number; ty: number }>(page, 'g.meta.ruins[0]');
  await G(page, `g.teleport(${r.tx + 2}, ${r.ty + 2})`);
  await waitReady(page);
  await expect.poll(() => G<number>(page, "g.enemies.filter((e) => e.id.startsWith('g')).length"), { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/m14-ruin.png' });
  // Truhe ist versiegelt, solange der Wächter lebt
  await G(page, `g.teleport(${r.tx + 2}, ${r.ty + 2})`);
  await page.keyboard.press('e');
  await expect.poll(() => G<string>(page, "g.dialog?.text ?? ''")).toContain('Wächter');
  await page.keyboard.press('e');
  // Wächter besiegen, Truhe öffnen
  const gid = await G<string>(page, "g.enemies.find((e) => e.id.startsWith('g')).id");
  expect(await G<boolean>(page, `g.killEnemy('${gid}')`)).toBe(true);
  await G(page, `g.teleport(${r.tx + 2}, ${r.ty + 2})`);
  await page.keyboard.press('e');
  await expect.poll(() => G<string[]>(page, 'g.state().chests')).toContain(`ruinchest:${r.tx + 2},${r.ty + 1}`);
  // Beute einsammeln: ein seltener oder epischer Gegenstand
  for (let i = 0; i < 8; i++) {
    const pos = await G<{ x: number; y: number }[]>(page, 'g.pickupPos.map((p) => ({ ...p }))');
    if (!pos.length) break;
    await G(page, `g.teleport(${Math.floor(pos[0].x / 32)}, ${Math.floor(pos[0].y / 32)})`);
    await page.waitForTimeout(700);
  }
  const rarities = await G<string[]>(page, 'g.hero.inventory.map((i) => i.rarity)');
  expect(rarities.some((x) => x === 'rare' || x === 'epic')).toBe(true);
  await page.screenshot({ path: 'screenshots/m14-loot.png' });
  expect(errors).toEqual([]);
});
