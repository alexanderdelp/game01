import { expect, test, type Page } from '@playwright/test';
import { G, frames, open, saveAndReload, shot, talkTo, tp, waitCreate, waitReady, watchErrors } from './helpers';

// Modul Figur: Erschaffung, Aussehen, Ausrüstung, Fortschritt. Ebenen, Umfärben, Boni, Werte, Beute und
// Startausrüstung je Volk prüfen die Unit-Tests m5, m6, m18, m23.

type Look = { race: string; body: string; hair: string; glow?: string; eyes?: string; shoes?: string; legsColor?: string };
const look = (page: Page) => G<Look>(page, '({ ...g.createLook() })');

test('Erschaffung: Völker, Merkmale, Frisur, Name; nach Neuladen direkt ins Spiel (M6 R3–R6, M18 R4/R5, M23 R3/R4)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?seed=create-test&test=1');
  await waitCreate(page);
  await shot(page, 'm18-human');
  // Weiblich, Pferdeschwanz (Zeile 1 Körper, Zeile 3 Frisur)
  await G(page, 'g.createChange(1, 1)');
  for (let i = 0; i < 12 && (await look(page)).hair !== 'ponytail'; i++) await G(page, 'g.createChange(3, 1)');
  expect(await look(page)).toMatchObject({ body: 'female', hair: 'ponytail' });
  await shot(page, 'm18-female');
  // Elf: Augenfarbe als Volksmerkmal (Zeile 5)
  await G(page, 'g.createChange(0, 1)');
  expect((await look(page)).race).toBe('elf');
  await G(page, 'g.createChange(5, 1)');
  expect((await look(page)).eyes).toBeTruthy();
  await shot(page, 'm18-elf');
  // Synth: kein Geschlecht, Leuchtfarbe
  await G(page, 'g.createChange(0, 1)');
  await G(page, 'g.createChange(0, 1)');
  expect(await look(page)).toMatchObject({ race: 'synth', body: 'male' });
  const glow0 = (await look(page)).glow;
  await G(page, 'g.createChange(5, 1)');
  expect((await look(page)).glow).not.toBe(glow0);
  await shot(page, 'm18-synth');
  // Ork
  await G(page, 'g.createChange(0, -1)');
  expect((await look(page)).race).toBe('orc');
  await shot(page, 'm18-orc');

  // Name über das Eingabefeld (Tastatur), dann bestätigen
  await page.getByLabel('Name').fill('Grimma');
  await page.getByLabel('Name').press('m');
  await G(page, 'g.createConfirm()');
  await expect.poll(() => G<string>(page, 'g.scene')).toBe('world');
  await waitReady(page);
  expect(await G<string>(page, 'g.hero.name')).toBe('Grimmam');
  expect(await G<string>(page, 'g.hero.race')).toBe('orc');
  expect(await G<number>(page, 'g.maxHp')).toBe(120);
  // Startausrüstung des Volks ist angelegt
  expect(await G<number>(page, 'Object.keys(g.hero.equipped).length')).toBeGreaterThanOrEqual(3);
  await shot(page, 'm6-ingame');

  // Nach Neuladen direkt ins Spiel; Aussehen nicht im Heldenfenster änderbar (nur beim Barbier)
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await expect.poll(() => G<string>(page, 'g.scene'), { timeout: 30_000 }).toBe('world');
  await waitReady(page);
  expect(await G<string>(page, 'g.hero.name')).toBe('Grimmam');
  await page.keyboard.press('c');
  expect(await G<boolean>(page, "g.clickPanel('appearance')")).toBe(false);
  expect(errors).toEqual([]);
});

test('Heldenfenster, Kleidung, Trank, Barbier, Speichern (M5 R5/R7/R8, M18 R5, M23 R1/R4)', async ({ page }) => {
  // Niedriges Laptop-Fenster: „Anlegen“ muss trotzdem im Heldenfenster sichtbar sein
  await page.setViewportSize({ width: 1280, height: 560 });
  const errors = await open(page, 'barbier-test');
  // Mensch: Leinenhemd, Leinenhose, Schuhe
  expect(await G<string[]>(page, 'Object.keys(g.hero.equipped).sort()')).toEqual(['armor', 'feet', 'legs', 'weapon']);
  expect(await G<string>(page, 'g.heroLook().shoes')).toBe('shoes');
  const inv = (id: string) => G<number>(page, `g.hero.inventory.findIndex((i) => i.id === "${id}")`);

  // Neue Hose anlegen → Hosenfarbe kommt aus dem Gegenstand
  const legs = await G<string>(page, "g.giveItem('legs')");
  const color = await G<string>(page, `g.hero.inventory.find((i) => i.id === "${legs}").color`);
  await page.keyboard.press('c');
  expect(await G<boolean>(page, 'g.panelOpen')).toBe(true);
  expect(await G<boolean>(page, `g.clickPanel('inv-${await inv(legs)}')`)).toBe(true);
  expect(await G<boolean>(page, "g.clickPanel('equip')")).toBe(true);
  expect(await G<string>(page, 'g.hero.equipped.legs.id')).toBe(legs);
  expect(await G<string>(page, 'g.heroLook().legsColor')).toBe(color);
  // Doppelklick legt direkt an; Ablegen der Schuhe → barfuß
  const feet = await G<string>(page, "g.giveItem('feet')");
  const fi = await inv(feet);
  expect(await G<boolean>(page, `g.clickPanel('inv-${fi}')`)).toBe(true);
  expect(await G<boolean>(page, `g.clickPanel('inv-${fi}')`)).toBe(true);
  expect(await G<string>(page, 'g.hero.equipped.feet.id')).toBe(feet);
  expect(await G<boolean>(page, "g.clickPanel('slot-feet')")).toBe(true);
  expect(await G<string>(page, 'g.heroLook().shoes')).toBe('none');
  // Lederrüstung anlegen
  const armor = await G<string>(page, "g.giveItem('armor', 'leather')");
  expect(await G<boolean>(page, `g.clickPanel('inv-${await inv(armor)}')`)).toBe(true);
  expect(await G<boolean>(page, "g.clickPanel('equip')")).toBe(true);
  expect(await G<string>(page, 'g.hero.equipped.armor?.id')).toBe(armor);
  expect(await G<number>(page, 'g.maxHp')).toBeGreaterThan(100);
  await shot(page, 'm23-panel');
  await page.keyboard.press('c');
  await shot(page, 'm5-leather');

  // Trank heilt
  await G(page, 'g.damagePlayer(60)');
  const hpLow = await G<number>(page, 'g.hp');
  const potions = await G<number>(page, 'g.hero.potions');
  await page.keyboard.press('q');
  expect(await G<number>(page, 'g.hp')).toBeGreaterThan(hpLow + 30);

  // Barbier: neue Frisur gegen 20 Splitter, Volk bleibt
  const s = await G<{ tx: number; ty: number; id: number }>(page, '(() => { const t = g.meta.settlements[0]; return { tx: t.tx, ty: t.ty, id: t.id }; })()');
  await G(page, 'g.hero.shards = 25');
  await tp(page, s.tx + 2, s.ty + 3);
  await talkTo(page, { id: `b${s.id}` }, (d) => d.role === 'Barbier');
  await page.keyboard.press('1');
  await waitCreate(page);
  const hair0 = (await look(page)).hair;
  await G(page, 'g.createChange(0, 1)'); // beim Barbier ist die erste Zeile die Frisur
  expect((await look(page)).hair).not.toBe(hair0);
  expect((await look(page)).race).toBe('human');
  await shot(page, 'm18-barber');
  await G(page, 'g.createConfirm()');
  await expect.poll(() => G<string>(page, 'g.scene')).toBe('world');
  await waitReady(page);
  expect(await G<number>(page, 'g.hero.shards')).toBe(5);

  // Speichern: Ausrüstung und Tränke bleiben
  await saveAndReload(page);
  expect(await G<string>(page, 'g.hero.equipped.armor?.id')).toBe(armor);
  expect(await G<number>(page, 'g.hero.potions')).toBe(potions - 1);
  expect(errors).toEqual([]);
});

async function walkTo(page: Page, x: number, y: number) {
  for (let i = 0; i < 12; i++) {
    const p = await G<{ x: number; y: number }>(page, '({ ...g.player })');
    const dx = x - p.x;
    const dy = y - p.y;
    if (Math.hypot(dx, dy) < 12) return;
    const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'd' : 'a') : dy > 0 ? 's' : 'w';
    await page.keyboard.down(key);
    await frames(page, Math.min(10, Math.max(2, Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / 6))));
    await page.keyboard.up(key);
  }
}

test('M5: Gegner besiegen gibt EP und Beute, Beute lässt sich aufheben (R4)', async ({ page }) => {
  const errors = await open(page, 'test');
  const e = await G<{ tx: number; ty: number }>(page, "g.findEnemy('slime')");
  await tp(page, e.tx - 3, e.ty);
  const loot = () => G<number>(page, 'g.hero.shards + g.hero.potions + g.hero.inventory.length');
  const loot0 = await loot();
  const score = () => G<number>(page, 'g.hero.xp + (g.hero.level - 1) * 1000');
  // Beute ist zufällig (selten fällt nichts) – notfalls weitere Gegner besiegen
  for (let round = 0; round < 4 && (await loot()) <= loot0; round++) {
    const xp0 = await score();
    for (let i = 0; i < 60 && (await score()) <= xp0; i++) {
      const t = await G<{ x: number; y: number } | null>(page, '(() => { const p = g.player; const e = [...g.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; return e ? { x: e.x, y: e.y } : null; })()');
      if (t) await walkTo(page, t.x - 20, t.y);
      await page.keyboard.press('Space');
      await frames(page, 6);
    }
    expect(await score()).toBeGreaterThan(xp0);
    for (let i = 0; i < 6; i++) {
      const pos = await G<{ x: number; y: number }[]>(page, 'g.pickupPos.map((p) => ({ ...p }))');
      if (!pos.length) break;
      await walkTo(page, pos[0].x, pos[0].y);
      await expect.poll(() => G<number>(page, 'g.pickupPos.length'), { timeout: 2_000 }).toBeLessThan(pos.length).catch(() => {});
    }
  }
  expect(await loot()).toBeGreaterThan(loot0);
  expect(errors).toEqual([]);
});
