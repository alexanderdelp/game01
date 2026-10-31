import { expect, test, type Page } from '@playwright/test';
import { open } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;

const QUEST = (giverId: string, tx: number, ty: number) =>
  `g.quests.active.splice(0, 9, { id: "q:m16", giverId: "${giverId}", giverName: "Testgeber", giverTx: ${tx}, giverTy: ${ty}, title: "Testquest", text: "t", objective: { type: "kill", kind: "slime", count: 1, done: 1 }, reward: { xp: 1, shards: 1, item: false } })`;

test('M16: Hinweise bleiben stehen, Pfeil nur auf geladene NPCs, Minimap (R1, R3, R4)', async ({ page }) => {
  const errors = await open(page, 'test');
  // R1: Erster Hinweis bleibt ohne Eingabe länger als 5 s stehen, Klick zeigt den nächsten
  await expect.poll(() => G<string>(page, 'g.bannerTitle'), { timeout: 10_000 }).toContain('Willkommen');
  await page.waitForTimeout(6000);
  expect(await G<string>(page, 'g.bannerTitle')).toContain('Willkommen');
  await page.mouse.click(400, 300);
  await expect.poll(() => G<string>(page, 'g.bannerTitle')).toContain('Gelbes !');

  // R4: Minimap
  await expect.poll(() => G<boolean>(page, 'g.minimap'), { timeout: 20_000 }).toBe(true);

  // R3a: abgabebereite Quest bei einem geladenen NPC → Pfeil zeigt auf ihn, er bleibt stehen
  await expect.poll(() => G<number>(page, 'g.npcs.length'), { timeout: 20_000 }).toBeGreaterThan(0);
  const npc = await G<{ id: string; x: number; y: number }>(page, '({ ...g.npcs[0] })');
  await G(page, QUEST(npc.id, Math.floor(npc.x / 32), Math.floor(npc.y / 32)));
  await expect.poll(() => G<string>(page, 'g.questPointer')).toBe('npc');
  const p0 = await G<{ x: number; y: number }>(page, `({ ...g.npcs.find((n) => n.id === "${npc.id}") })`);
  await page.waitForTimeout(4000);
  const p1 = await G<{ x: number; y: number }>(page, `({ ...g.npcs.find((n) => n.id === "${npc.id}") })`);
  expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeLessThan(2);
  await page.screenshot({ path: 'screenshots/m16-npc-arrow.png' });

  // R3b: Questgeber weit weg (nicht geladen) → kein Pfeil, nur Gebiet
  const f = await G<{ tx: number; ty: number }>(page, '({ ...g.focus })');
  await G(page, QUEST('fern-weg', f.tx + 400, f.ty + 150));
  await expect.poll(() => G<string>(page, 'g.questPointer')).toBe('area');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m16-area.png' });
  expect(errors).toEqual([]);
});

test.describe('Handy', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('M16: Minimap unter den Knöpfen (R4)', async ({ page }) => {
    const errors = await open(page, 'test');
    await expect.poll(() => G<boolean>(page, 'g.minimap'), { timeout: 20_000 }).toBe(true);
    const f = await G<{ tx: number; ty: number }>(page, '({ ...g.focus })');
    await G(page, QUEST('fern-weg', f.tx - 300, f.ty - 200));
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/m16-mobile.png' });
    expect(errors).toEqual([]);
  });
});
