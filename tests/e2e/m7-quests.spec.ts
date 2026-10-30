import { expect, test, type Page } from '@playwright/test';
import { open, waitReady } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;

test('M7: Quest annehmen, Fortschritt, Abgeben, Speichern (R3–R5)', async ({ page }) => {
  const errors = await open(page, 'test');
  // NPC mit Angebot finden (Marker "!")
  await expect.poll(() => G<number>(page, "Object.values(g.markers).filter((m) => m === '!').length"), { timeout: 20_000 }).toBeGreaterThan(0);
  let accepted = false;
  for (let attempt = 0; attempt < 8 && !accepted; attempt++) {
    const npc = await G<{ x: number; y: number }>(page, "(() => { const id = Object.keys(g.markers).find((k) => g.markers[k] === '!'); return { ...g.npcs.find((n) => n.id === id) }; })()");
    await page.evaluate(([x, y]) => (window as unknown as { __game: { teleport(a: number, b: number): void } }).__game.teleport(Math.floor(x / 32), Math.floor(y / 32)), [npc.x, npc.y]);
    await page.keyboard.press('e');
    const d = await G<{ choices?: string[] } | null>(page, 'g.dialog');
    if (d?.choices) {
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'screenshots/m7-offer.png' });
      await page.keyboard.press('1');
      accepted = true;
    } else {
      if (d) await page.keyboard.press('e');
      await page.waitForTimeout(500);
    }
  }
  expect(accepted).toBe(true);
  expect(await G<number>(page, 'g.quests.active.length')).toBe(1);
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'screenshots/m7-tracker.png' });

  // Questlog
  await page.keyboard.press('l');
  expect(await G<boolean>(page, 'g.questLogOpen')).toBe(true);
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/m7-log.png' });
  await page.keyboard.press('l');

  // Fortschritt künstlich erfüllen und beim Auftraggeber abgeben
  await G(page, 'g.quests.active[0].objective.done = g.quests.active[0].objective.count');
  const q = await G<{ giverTx: number; giverTy: number; type: string; reward: { xp: number } }>(page, '({ ...g.quests.active[0], type: g.quests.active[0].objective.type })');
  const shards0 = await G<number>(page, 'g.hero.shards');
  if (q.type !== 'deliver') {
    // Auftraggeber steht in der Nähe seines Zuhauses; zu ihm teleportieren und reden
    for (let attempt = 0; attempt < 8; attempt++) {
      const giver = await G<{ x: number; y: number } | null>(page, `(() => { const id = g.quests.active[0]?.giverId; const n = g.npcs.find((n) => n.id === id); return n ? { ...n } : null; })()`);
      if (!giver) break;
      await page.evaluate(([x, y]) => (window as unknown as { __game: { teleport(a: number, b: number): void } }).__game.teleport(Math.floor(x / 32), Math.floor(y / 32)), [giver.x, giver.y]);
      await page.keyboard.press('e');
      if ((await G<number>(page, 'g.quests.active.length')) === 0) break;
      await page.keyboard.press('e');
      await page.waitForTimeout(400);
    }
    expect(await G<number>(page, 'g.quests.active.length')).toBe(0);
    expect(await G<number>(page, 'g.hero.shards')).toBeGreaterThan(shards0);
  }

  // Neue Quest annehmen und Neuladen überstehen
  await G(page, 'g.quests.active.push({ id: "q:test", giverId: "x", giverName: "Test", giverTx: 0, giverTy: 0, title: "Testquest", text: "t", objective: { type: "kill", kind: "slime", count: 3, done: 1 }, reward: { xp: 1, shards: 1, item: false } })');
  await page.keyboard.press('q'); // löst Speichern aus (dirty) – zusätzlich warten
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await waitReady(page);
  expect(await G<string>(page, 'g.quests.active.map((q) => q.id).join(",")')).toContain('q:test');
  expect(errors).toEqual([]);
});
