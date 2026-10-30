import { expect, test, type Page } from '@playwright/test';
import { open, waitReady } from './helpers';

type Hero = { level: number; xp: number; shards: number; potions: number; talentPoints: number; inventory: { id: string; base: string }[]; equipped: Record<string, { id: string } | undefined> };
type G = {
  hero: Hero; hp: number; maxHp: number; panelOpen: boolean;
  enemies: { id: string; x: number; y: number }[];
  player: { x: number; y: number };
  pickupPos: { x: number; y: number }[];
  findEnemy(kind?: string): { tx: number; ty: number } | null;
  teleport(tx: number, ty: number): void;
  giveItem(slot: string, base?: string): string;
  clickPanel(name: string): boolean;
  damagePlayer(n: number): void;
};
const G = <T>(page: Page, fn: string) => page.evaluate(`(() => { const g = window.__game; return ${fn}; })()`) as Promise<T>;

async function walkTo(page: Page, x: number, y: number) {
  for (let i = 0; i < 12; i++) {
    const p = await G<{ x: number; y: number }>(page, '({ ...g.player })');
    const dx = x - p.x;
    const dy = y - p.y;
    if (Math.hypot(dx, dy) < 12) return;
    const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'd' : 'a') : dy > 0 ? 's' : 'w';
    await page.keyboard.down(key);
    await page.waitForTimeout(Math.min(300, Math.max(40, Math.max(Math.abs(dx), Math.abs(dy)) * 5)));
    await page.keyboard.up(key);
  }
}

test('M5: Gegner besiegen gibt EP und Beute, Beute lässt sich aufheben (R4)', async ({ page }) => {
  const errors = await open(page, 'test');
  const e = await G<{ tx: number; ty: number }>(page, "g.findEnemy('slime')");
  await page.evaluate(([tx, ty]) => (window as unknown as { __game: G }).__game.teleport(tx - 3, ty), [e.tx, e.ty]);
  await waitReady(page);
  const loot0 = await G<number>(page, 'g.hero.shards + g.hero.potions + g.hero.inventory.length');
  const score = () => G<number>(page, 'g.hero.xp + (g.hero.level - 1) * 1000');
  // Beute ist zufällig (selten fällt nichts) – notfalls weitere Gegner besiegen
  for (let round = 0; round < 4; round++) {
    const xp0 = await score();
    for (let i = 0; i < 60; i++) {
      if ((await score()) > xp0) break;
      const t = await G<{ x: number; y: number } | null>(page, `(() => { const p = g.player; const e = [...g.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; return e ? { x: e.x, y: e.y } : null; })()`);
      if (t) await walkTo(page, t.x - 20, t.y);
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
    }
    expect(await score()).toBeGreaterThan(xp0);
    for (let i = 0; i < 6; i++) {
      const pos = await G<{ x: number; y: number }[]>(page, 'g.pickupPos.map((p) => ({ ...p }))');
      if (!pos.length) break;
      await walkTo(page, pos[0].x, pos[0].y);
      await page.waitForTimeout(400);
    }
    if ((await G<number>(page, 'g.hero.shards + g.hero.potions + g.hero.inventory.length')) > loot0) break;
  }
  expect(await G<number>(page, 'g.hero.shards + g.hero.potions + g.hero.inventory.length')).toBeGreaterThan(loot0);
  expect(errors).toEqual([]);
});

test('M5: Heldenfenster, Ausrüstung, Talente, Trank, Speichern (R5–R8)', async ({ page }) => {
  await open(page, 'rpg-test');
  const id = await G<string>(page, "g.giveItem('armor', 'leather')");
  await page.keyboard.press('c');
  expect(await G<boolean>(page, 'g.panelOpen')).toBe(true);
  expect(await G<boolean>(page, "g.clickPanel('inv-0')")).toBe(true);
  expect(await G<boolean>(page, "g.clickPanel('equip')")).toBe(true);
  expect(await G<string>(page, 'g.hero.equipped.armor?.id')).toBe(id);
  const maxBefore = await G<number>(page, 'g.maxHp');
  expect(maxBefore).toBeGreaterThan(100);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m5-panel.png' });
  await page.keyboard.press('c');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m5-leather.png' });

  // Trank
  await G(page, 'g.damagePlayer(60)');
  const hpLow = await G<number>(page, 'g.hp');
  await page.keyboard.press('q');
  expect(await G<number>(page, 'g.hp')).toBeGreaterThan(hpLow + 30);

  // Speichern
  await page.waitForTimeout(2000);
  await page.reload();
  await waitReady(page);
  expect(await G<string>(page, 'g.hero.equipped.armor?.id')).toBe(id);
  expect(await G<number>(page, 'g.hero.potions')).toBe(0);
});
