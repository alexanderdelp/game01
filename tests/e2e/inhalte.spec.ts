import { expect, test } from '@playwright/test';
import { G, frames, open, saveAndReload, shot, talkTo } from './helpers';

// Modul Inhalte: Quests und Gespräche im Spiel. Erzeugung, Fortschritt, Abbruch und Grenzen prüft m7.test.ts.

const QUEST = (giverId: string, tx: number, ty: number) =>
  `g.quests.active.splice(0, 9, { id: "q:m16", giverId: "${giverId}", giverName: "Testgeber", giverTx: ${tx}, giverTy: ${ty}, title: "Testquest", text: "t", objective: { type: "kill", kind: "slime", count: 1, done: 1 }, reward: { xp: 1, shards: 1, item: false } })`;

test('M7: Quest annehmen, Questlog, abgeben, Neuladen (R3, R5)', async ({ page }) => {
  const errors = await open(page, 'test');
  // NPC mit Angebot (Marker "!") ansprechen und annehmen
  await expect.poll(() => G<number>(page, "Object.values(g.markers).filter((m) => m === '!').length"), { timeout: 20_000 }).toBeGreaterThan(0);
  const giverId = await G<string>(page, "Object.keys(g.markers).find((k) => g.markers[k] === '!')");
  await talkTo(page, { id: giverId }, (d) => !!d.choices);
  await shot(page, 'm7-offer');
  await page.keyboard.press('1');
  expect(await G<number>(page, 'g.quests.active.length')).toBe(1);
  await shot(page, 'm7-tracker');

  await page.keyboard.press('l');
  expect(await G<boolean>(page, 'g.questLogOpen')).toBe(true);
  await shot(page, 'm7-log');
  await page.keyboard.press('l');

  // Fortschritt künstlich erfüllen und beim Auftraggeber abgeben (Botengang endet bei einem anderen NPC)
  await G(page, 'g.quests.active[0].objective.done = g.quests.active[0].objective.count');
  const type = await G<string>(page, 'g.quests.active[0].objective.type');
  if (type !== 'deliver') {
    const shards0 = await G<number>(page, 'g.hero.shards');
    await expect
      .poll(async () => {
        const g = await G<{ x: number; y: number } | null>(page, '(() => { const n = g.npcs.find((n) => n.id === g.quests.active[0]?.giverId); return n ? { x: n.x, y: n.y } : null; })()');
        if (g) {
          if (await G<unknown>(page, 'g.dialog')) await page.keyboard.press('e');
          await G(page, `g.teleport(${Math.floor(g.x / 32)}, ${Math.floor(g.y / 32)})`);
          await page.keyboard.press('e');
        }
        return G<number>(page, 'g.quests.active.length');
      }, { timeout: 20_000, intervals: [300] })
      .toBe(0);
    expect(await G<number>(page, 'g.hero.shards')).toBeGreaterThan(shards0);
  }

  // Eine laufende Quest übersteht das Neuladen
  await G(page, 'g.quests.active.push({ id: "q:test", giverId: "x", giverName: "Test", giverTx: 0, giverTy: 0, title: "Testquest", text: "t", objective: { type: "kill", kind: "slime", count: 3, done: 1 }, reward: { xp: 1, shards: 1, item: false } })');
  await saveAndReload(page);
  expect(await G<string>(page, 'g.quests.active.map((q) => q.id).join(",")')).toContain('q:test');
  expect(errors).toEqual([]);
});

test('M16: Pfeil nur auf geladene NPCs, Questgeber bleibt stehen, sonst Gebiet (R3)', async ({ page }) => {
  const errors = await open(page, 'test');
  // Abgabebereite Quest bei einem geladenen NPC → Pfeil zeigt auf ihn, er bleibt stehen
  await expect.poll(() => G<number>(page, 'g.npcs.length'), { timeout: 20_000 }).toBeGreaterThan(0);
  const npc = await G<{ id: string; x: number; y: number }>(page, '({ ...g.npcs[0] })');
  await G(page, QUEST(npc.id, Math.floor(npc.x / 32), Math.floor(npc.y / 32)));
  await expect.poll(() => G<string>(page, 'g.questPointer')).toBe('npc');
  const pos = `(() => { const n = g.npcs.find((n) => n.id === "${npc.id}"); return { x: n.x, y: n.y }; })()`;
  const p0 = await G<{ x: number; y: number }>(page, pos);
  await frames(page, 30); // gewollt: geprüft wird, dass in dieser Zeit nichts passiert
  const p1 = await G<{ x: number; y: number }>(page, pos);
  expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeLessThan(2);
  await shot(page, 'm16-npc-arrow');

  // Questgeber weit weg (nicht geladen) → kein Pfeil, nur Gebiet
  const f = await G<{ tx: number; ty: number }>(page, '({ ...g.focus })');
  await G(page, QUEST('fern-weg', f.tx + 400, f.ty + 150));
  await expect.poll(() => G<string>(page, 'g.questPointer')).toBe('area');
  await shot(page, 'm16-area');
  expect(errors).toEqual([]);
});
