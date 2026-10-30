import { expect, test, type Page } from '@playwright/test';
import { open, state, waitReady } from './helpers';

type Npc = { id: string; x: number; y: number; role: string; name: string };
const npcs = (page: Page) => page.evaluate(() => (window as unknown as { __game: { npcs: Npc[] } }).__game.npcs.map((n) => ({ ...n })));

test('M3: NPCs erscheinen, wandern und lassen sich ansprechen', async ({ page }) => {
  const errors = await open(page, 'test');
  // R3: Es gibt NPCs in der Nähe, und mindestens einer bewegt sich.
  await expect.poll(async () => (await npcs(page)).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const before = await npcs(page);
  await page.waitForTimeout(8000);
  const after = await npcs(page);
  const moved = after.filter((a) => {
    const b = before.find((n) => n.id === a.id);
    return b && Math.hypot(a.x - b.x, a.y - b.y) > 8;
  });
  expect(moved.length).toBeGreaterThan(0);

  // R5: Zum nächsten NPC teleportieren und ansprechen (NPCs laufen weiter, daher mehrere Versuche).
  let dialog: unknown = null;
  for (let attempt = 0; attempt < 6 && !dialog; attempt++) {
    const p = (await state(page)).player;
    const list = await npcs(page);
    const target = list.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    await page.evaluate(([x, y]) => {
      const g = (window as unknown as { __game: { teleport(tx: number, ty: number): void } }).__game;
      g.teleport(Math.floor(x / 32), Math.floor(y / 32));
    }, [target.x, target.y]);
    await page.keyboard.press('e');
    dialog = await page.evaluate(() => (window as unknown as { __game: { dialog: unknown } }).__game.dialog);
    if (!dialog) await page.waitForTimeout(500);
  }
  expect(dialog).not.toBeNull();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m3-dialog.png' });
  await page.keyboard.press('e');
  expect(await page.evaluate(() => (window as unknown as { __game: { dialog: unknown } }).__game.dialog)).toBeNull();

  expect(errors).toEqual([]);
});
