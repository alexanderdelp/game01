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
  const hasRare = async () => (await G<string[]>(page, 'g.hero.inventory.map((i) => i.rarity)')).some((x) => x === 'rare' || x === 'epic');
  for (let i = 0; i < 20 && !(await hasRare()); i++) {
    const pos = await G<{ x: number; y: number }[]>(page, 'g.pickupPos.map((p) => ({ ...p }))');
    if (!pos.length) break;
    const p = pos[i % pos.length];
    await G(page, `g.teleport(${Math.floor(p.x / 32)}, ${Math.floor(p.y / 32)})`);
    await page.waitForTimeout(800);
  }
  expect(await hasRare()).toBe(true);
  await page.screenshot({ path: 'screenshots/m14-loot.png' });
  expect(errors).toEqual([]);
});

test('Splitterblitz trifft Gegner aus der Ferne', async ({ page }) => {
  const errors = await open(page, 'test');
  const e = await G<{ tx: number; ty: number }>(page, "g.findEnemy('slime')");
  await G(page, `g.teleport(${e.tx - 5}, ${e.ty})`);
  await waitReady(page);
  await expect.poll(() => G<number>(page, 'g.enemies.length'), { timeout: 15_000 }).toBeGreaterThan(0);
  let hit = false;
  for (let i = 0; i < 12 && !hit; i++) {
    const t = await G<{ id: string; x: number; y: number; hp: number } | null>(page, `(() => { const p = g.player; const e = [...g.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; return e ? { ...e } : null; })()`);
    if (!t) break;
    // Auf gleiche Höhe, 4 Kacheln links davon, nach rechts schauen, zaubern
    await G(page, `g.teleport(${Math.floor(t.x / 32) - 4}, ${Math.floor(t.y / 32)})`);
    await page.keyboard.press('d');
    await expect.poll(() => G<number>(page, 'g.spellCooldown')).toBe(0);
    await page.keyboard.press('k');
    await expect.poll(() => G<number>(page, 'g.spellCooldown')).toBeGreaterThan(0);
    await page.waitForTimeout(900);
    const after = await G<{ id: string; hp: number }[]>(page, 'g.enemies.map((e) => ({ ...e }))');
    const x = after.find((a) => a.id === t.id);
    hit = !x || x.hp < t.hp;
    if (i === 0) await page.screenshot({ path: 'screenshots/m14-spell.png' });
  }
  expect(hit).toBe(true);
  expect(errors).toEqual([]);
});
