import { expect, test, type Page } from '@playwright/test';
import { G, frames, open, shot, state, tp } from './helpers';

// Modul Kampf in der Welt: Angriff, Gegner-Angriffe, Tod, Touch-Knopf, Spielgefühl, Splitterblitz, Ruinen.
// Schaden, Trefferboxen, Zeitwerte (Hieb-Zyklus), Elite-Gegner und Ruinen-Erzeugung prüfen m4/m14/m17/m28.test.ts.

type E = { id: string; kind: string; x: number; y: number; hp: number };
const nearest = (page: Page) =>
  G<E | null>(page, '(() => { const p = g.player; const e = [...g.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; return e ? { ...e } : null; })()');
const hpOf = (page: Page, id: string) => G<number>(page, `(g.enemies.find((e) => e.id === '${id}') || { hp: -1 }).hp`);

async function goToEnemy(page: Page, kind: string, dx = -3) {
  const e = await G<{ tx: number; ty: number } | null>(page, `g.findEnemy('${kind}')`);
  expect(e).not.toBeNull();
  await tp(page, e!.tx + dx, e!.ty);
  await expect.poll(() => G<number>(page, 'g.enemies.length'), { timeout: 30_000 }).toBeGreaterThan(0);
}

test('M4/M17: Hieb trifft, Laufen während des Hiebs, kein Vormerken (M4 R1, M17 R2/R3)', async ({ page }) => {
  const errors = await open(page, 'test');
  await page.mouse.click(10, 300); // Einstiegshinweise wegklicken

  // M17 R2: Während des Hiebs läuft die Figur weiter (in Spielzeit gemessen – der Testbrowser läuft gedrosselt)
  await page.keyboard.down('s');
  await frames(page, 5);
  await page.keyboard.press('Space');
  await expect.poll(() => G<boolean>(page, 'g.swinging')).toBe(true);
  const y0 = await G<number>(page, 'g.player.y');
  let y1 = y0;
  while (await G<boolean>(page, 'g.swinging')) y1 = await G<number>(page, 'g.player.y');
  await page.keyboard.up('s');
  expect(y1 - y0).toBeGreaterThan(4);

  // M17 R3: Ein zweiter Druck mitten im Hieb wird nicht vorgemerkt; nach dem Hieb geht der nächste sofort
  const a0 = await G<number>(page, 'g.attacks');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  // erst warten, bis der Hieb begonnen hat – unter Last kommt der Tastendruck ein Bild später an
  await expect.poll(() => G<number>(page, 'g.attacks')).toBe(a0 + 1);
  await expect.poll(() => G<boolean>(page, 'g.swinging')).toBe(false);
  await frames(page, 5);
  expect(await G<number>(page, 'g.attacks')).toBe(a0 + 1);
  await page.keyboard.press('Space');
  await expect.poll(() => G<number>(page, 'g.attacks')).toBe(a0 + 2);

  // M4 R1: Hieb auf einen Gegner direkt rechts daneben macht Schaden
  await goToEnemy(page, 'slime');
  let damaged = false;
  await expect
    .poll(async () => {
      const t = await nearest(page);
      if (!t) return (damaged = true);
      await G(page, `g.teleport(${Math.floor((t.x - 24) / 32)}, ${Math.floor(t.y / 32)})`);
      await page.keyboard.press('d');
      await expect.poll(() => G<boolean>(page, 'g.swinging')).toBe(false);
      const n = await G<number>(page, 'g.attacks');
      await page.keyboard.press('Space');
      await expect.poll(() => G<number>(page, 'g.attacks')).toBeGreaterThan(n);
      await expect.poll(() => G<boolean>(page, 'g.swinging')).toBe(false);
      const hp = await hpOf(page, t.id);
      damaged = hp < t.hp;
      return damaged;
    }, { timeout: 60_000, intervals: [0] })
    .toBe(true);
  await shot(page, 'm4-fight');
  expect(errors).toEqual([]);
});

test('M4: Gegner greifen an, Spieler stirbt und erwacht am Startpunkt (R3, R4)', async ({ page }) => {
  await open(page, 'test');
  await goToEnemy(page, 'slime');
  // Immer wieder direkt neben den nächsten Gegner stellen: Gegner wandern, ein Hindernis kann dazwischen liegen
  await expect
    .poll(() => G<number>(page, '(() => { const p = g.player; const e = [...g.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; if (e && g.hp >= 100) g.teleport(Math.floor(e.x / 32) - 1, Math.floor(e.y / 32)); return g.hp; })()'), { timeout: 60_000, intervals: [1000] })
    .toBeLessThan(100);
  await shot(page, 'm4-hurt');
  await G(page, 'g.damagePlayer(999)');
  await G(page, 'g.damagePlayer(999)');
  await expect.poll(() => G<boolean>(page, 'g.alive')).toBe(false);
  await expect.poll(() => G<boolean>(page, 'g.alive'), { timeout: 30_000 }).toBe(true);
  const s = await state(page);
  const sp = await G<{ tx: number; ty: number }>(page, 'g.spawn');
  expect(Math.abs(Math.floor(s.player.x / 32) - sp.tx)).toBeLessThanOrEqual(1);
  expect(await G<number>(page, 'g.hp')).toBe(100);
});

test('Splitterblitz trifft Gegner aus der Ferne', async ({ page }) => {
  const errors = await open(page, 'test');
  await goToEnemy(page, 'slime', -5);
  let shotTaken = false;
  await expect
    .poll(async () => {
      const t = await nearest(page);
      if (!t) return false;
      // Auf gleiche Höhe, 4 Kacheln links davon, nach rechts schauen, zaubern
      await G(page, `g.teleport(${Math.floor(t.x / 32) - 4}, ${Math.floor(t.y / 32)})`);
      await page.keyboard.press('d');
      await expect.poll(() => G<number>(page, 'g.spellCooldown'), { timeout: 30_000 }).toBe(0);
      await page.keyboard.press('k');
      await expect.poll(() => G<number>(page, 'g.spellCooldown')).toBeGreaterThan(0);
      if (!shotTaken) await shot(page, 'm14-spell');
      shotTaken = true;
      return expect.poll(() => hpOf(page, t.id), { timeout: 5_000 }).toBeLessThan(t.hp).then(() => true, () => false);
    }, { timeout: 90_000, intervals: [0] })
    .toBe(true);
  expect(errors).toEqual([]);
});

test('M14: Ruine mit Wächter, Ruinentruhe mit seltenem Fund (R3)', async ({ page }) => {
  const errors = await open(page, 'test');
  const r = await G<{ tx: number; ty: number }>(page, 'g.meta.ruins[0]');
  await tp(page, r.tx + 2, r.ty + 2);
  await expect.poll(() => G<number>(page, "g.enemies.filter((e) => e.id.startsWith('g')).length"), { timeout: 30_000 }).toBe(1);
  await shot(page, 'm14-ruin');
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
  const hasRare = "g.hero.inventory.some((i) => i.rarity === 'rare' || i.rarity === 'epic')";
  let i = 0;
  await expect
    .poll(async () => {
      const pos = await G<{ x: number; y: number }[]>(page, 'g.pickupPos.map((p) => ({ ...p }))');
      const p = pos[i++ % Math.max(1, pos.length)];
      if (p) await G(page, `g.teleport(${Math.floor(p.x / 32)}, ${Math.floor(p.y / 32)})`);
      return G<boolean>(page, hasRare);
    }, { timeout: 30_000, intervals: [500] })
    .toBe(true);
  await shot(page, 'm14-loot');
  expect(errors).toEqual([]);
});

test.describe('Touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('M4: Angriffsknopf (R7)', async ({ page }) => {
    await open(page, 'test');
    await page.touchscreen.tap(390 - 60, 844 - 90);
    await expect.poll(() => G<number>(page, 'g.attacks')).toBe(1);
    await shot(page, 'm4-mobile');
  });
});
