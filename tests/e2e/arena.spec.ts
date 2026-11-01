import { expect, test, type Page } from '@playwright/test';
import { G, frames, shot, watchErrors } from './helpers';

// Arena-Bedienfeld und Klick-Platzierung brauchen das Laptop-Format (übrige E2E-Tests: 960 × 540, spart Rechenzeit)
test.use({ viewport: { width: 1280, height: 720 } });

// Kampf-Arena (Modul Kampf). Aufbauten, Wegfindung, Waffenwerte und Diagonal-Treffer selbst prüfen m25/m28.test.ts.

test('Kampf-Arena: startet ohne Welt, Gegner per Knopf, Werte live einstellbar', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?arena=1');
  await expect.poll(() => G<string>(page, 'g.scene'), { timeout: 30_000 }).toBe('arena');
  await expect.poll(() => G<number>(page, 'g.enemies.length')).toBe(1);
  // Gegner per Knopf
  await page.getByRole('button', { name: 'Räuber' }).click();
  await page.getByRole('button', { name: 'Drohne' }).click();
  await expect.poll(() => G<number>(page, 'g.enemies.length')).toBe(3);
  // Regler: Lauftempo verdoppeln wirkt sofort
  await G(page, "g.arenaTune('move.speed', 300)");
  const x0 = await G<number>(page, 'g.player.x');
  await page.keyboard.down('a');
  await frames(page, 10);
  await page.keyboard.up('a');
  expect(await G<number>(page, 'g.player.x')).toBeLessThan(x0);
  await page.keyboard.press('Space');
  await expect.poll(() => G<number>(page, 'g.attacks')).toBe(1);
  // Werte kopieren zeigt den Code-Ausschnitt
  await page.getByRole('button', { name: 'Werte kopieren' }).click();
  await expect(page.locator('#arena-code')).toContainText('speed: 300');
  await expect(page.locator('#arena-stats')).toContainText('Hiebe 1');
  await shot(page, 'arena');
  // Einstellungen bleiben nach Neuladen erhalten
  await page.reload();
  await expect.poll(() => G<string>(page, 'g.scene'), { timeout: 30_000 }).toBe('arena');
  await expect(page.locator('#arena-panel input[data-id="move.speed"]')).toHaveValue('300');
  expect(errors).toEqual([]);
});

const ready = async (page: Page) => {
  await expect.poll(() => G<boolean>(page, "g.scene === 'arena' && g.ready"), { timeout: 30_000 }).toBe(true);
};
/** Fußbox eines Gegners am Boden steckt nicht in einem Hindernis. */
const groundEnemiesFree = (page: Page) =>
  G<boolean>(page, "g.enemies.filter((e) => e.kind === 'slime' || e.kind === 'bandit').every((e) => !g.arenaBlocked(e.x - 7, e.y - 6, 14, 6))");

test('M25 R1: Gelände-Aufbauten wählbar, bleiben erhalten, Hindernisse halten Held und Gegner auf', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?arena=1');
  await ready(page);
  expect(await G<string>(page, 'g.arenaLayout')).toBe('pillars');
  const ids: Record<string, string> = { Offen: 'open', 'Wald & Felsen': 'forest', Sumpf: 'swamp', Säulen: 'pillars', Engpässe: 'choke' };
  for (const [name, id] of Object.entries(ids)) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect.poll(() => G<string>(page, 'g.ready && g.arenaLayout'), { timeout: 30_000 }).toBe(id);
    if (process.env.SHOTS) {
      await G(page, "g.arenaSpawn('wave')");
      await page.mouse.move(400, 360);
      await page.mouse.wheel(0, 400);
      await page.mouse.wheel(0, 400);
      await expect.poll(() => G<number>(page, 'g.zoom')).toBe(1);
      await shot(page, `m25-arena-${id}`);
    }
  }
  // Wahl bleibt nach Neuladen
  await page.reload();
  await ready(page);
  expect(await G<string>(page, 'g.arenaLayout')).toBe('choke');
  await expect(page.getByRole('button', { name: 'Engpässe' })).toHaveClass(/on/);
  // Held läuft gegen die Deckungsmauer über sich (Kacheln 18–21, Reihe 7) und bleibt davor stehen
  await page.getByRole('button', { name: 'Alle entfernen' }).click();
  await G(page, "g.arenaTune('move.speed', 300)");
  await G(page, 'g.teleport(20, 10)');
  await page.keyboard.down('w');
  await frames(page, 60);
  await page.keyboard.up('w');
  const y = await G<number>(page, 'g.player.y');
  expect(y).toBeGreaterThanOrEqual(8 * 32);
  expect(y).toBeLessThan(9 * 32);
  expect(await groundEnemiesFree(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('M25 R2: Gegner am Boden laufen um eine Mauer herum zum Helden', async ({ page }) => {
  await page.goto('/?arena=1');
  await ready(page);
  await G(page, "g.arenaSetLayout('choke')");
  await expect.poll(() => G<string>(page, 'g.ready && g.arenaLayout'), { timeout: 30_000 }).toBe('choke');
  await page.getByRole('button', { name: 'Alle entfernen' }).click();
  await page.getByRole('checkbox', { name: 'Besiegte kommen wieder' }).uncheck();
  // Held rechts, Räuber links der langen Mauer (Spalte 13): der gerade Weg ist versperrt, der Umweg geht
  // durch einen Durchgang 6 Kacheln weiter unten. Ohne Wegfindung bliebe der Räuber an der Mauer stehen.
  await G(page, 'g.teleport(15, 13)');
  await G(page, "g.arenaSpawnAt('bandit', 11, 13)");
  await expect.poll(() => G<number>(page, 'g.enemies.length')).toBe(1);
  await expect
    .poll(() => G<number>(page, "(() => { const e = g.enemies[0]; return e ? Math.hypot(e.x - g.player.x, e.y - g.player.y) : 0; })()"), { timeout: 60_000, intervals: [500] })
    .toBeLessThan(60);
  expect(await groundEnemiesFree(page)).toBe(true);
  await shot(page, 'm25-arena-chase');
});

test('M25 R3: Waffe wählbar, Angriff folgt der Waffe, Grafik wechselt, Wahl bleibt', async ({ page }) => {
  await page.goto('/?arena=1');
  await ready(page);
  const w = () => G<{ choice: string; level: number; attack: number; look: string; name: string }>(page, 'g.arenaWeapon');
  expect((await w()).choice).toBe('starter');
  const starter = (await w()).attack;
  expect((await w()).look).toBe('dagger');
  await page.getByLabel('Waffe', { exact: true }).selectOption('none');
  await expect.poll(async () => (await w()).look).toBe('none');
  expect((await w()).attack).toBe(starter - 1);
  await expect(page.locator('#arena-weapon-info')).toContainText('ohne Waffe');
  await page.getByLabel('Waffe', { exact: true }).selectOption('common');
  const common = (await w()).attack;
  await page.getByLabel('Waffe', { exact: true }).selectOption('epic');
  const epic = (await w()).attack;
  expect(common).toBeGreaterThan(starter);
  expect(epic).toBeGreaterThan(common);
  expect((await w()).look).toBe('dagger');
  await expect(page.locator('#arena-weapon-info')).toContainText('episch');
  // Stufe der Waffe per Regler
  await page.locator('#arena-weapon-level').fill('15');
  await expect.poll(async () => (await w()).level).toBe(15);
  expect((await w()).attack).toBeGreaterThan(epic);
  // Der Held macht den angezeigten Angriff
  await expect(page.locator('#arena-stats')).toContainText(`Angriff ${(await w()).attack}`);
  await page.reload();
  await ready(page);
  expect(await w()).toMatchObject({ choice: 'epic', level: 15 });
  await expect(page.getByLabel('Waffe', { exact: true })).toHaveValue('epic');
});

test('M25 R4: Gegner nach Art, Anzahl, Ort (zufällig / vorne / Klick) und als Welle', async ({ page }) => {
  await page.goto('/?arena=1');
  await ready(page);
  await G(page, "g.arenaSetLayout('open')");
  await expect.poll(() => G<string>(page, 'g.ready && g.arenaLayout'), { timeout: 30_000 }).toBe('open');
  await page.getByRole('checkbox', { name: 'Gegner eingefroren' }).check();
  await page.getByRole('button', { name: 'Alle entfernen' }).click();
  const n = () => G<number>(page, 'g.enemies.length');
  // 3 Schleime zufällig
  await page.getByRole('button', { name: '3×' }).click();
  await page.getByRole('button', { name: 'Schleim' }).click();
  await expect.poll(n).toBe(3);
  expect(await G<string[]>(page, 'g.enemies.map((e) => e.kind)')).toEqual(['slime', 'slime', 'slime']);
  // 5 Räuber vor dem Helden (Blick nach unten)
  await page.getByRole('button', { name: 'Alle entfernen' }).click();
  await page.getByRole('button', { name: '5×' }).click();
  await page.getByRole('button', { name: 'vor dem Helden' }).click();
  await page.keyboard.press('s');
  await page.getByRole('button', { name: 'Räuber' }).click();
  await expect.poll(n).toBe(5);
  const front = await G<boolean>(page, "g.enemies.every((e) => e.y > g.player.y + 40 && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 7 * 32)");
  expect(front).toBe(true);
  // 1 Drohne per Klick rechts neben den Helden
  await page.getByRole('button', { name: 'Alle entfernen' }).click();
  await page.getByRole('button', { name: '1×' }).click();
  await page.getByRole('button', { name: 'per Klick' }).click();
  await page.getByRole('button', { name: 'Drohne' }).click();
  expect(await n()).toBe(0);
  const at = await G<{ x: number; y: number }>(page, 'g.arenaToScreen(g.player.x + 160, g.player.y - 10)');
  await page.mouse.click(at.x, at.y);
  await expect.poll(n).toBe(1);
  const d = await G<{ kind: string; dx: number; dy: number }>(page, '({ kind: g.enemies[0].kind, dx: g.enemies[0].x - g.player.x, dy: g.enemies[0].y - g.player.y })');
  expect(d.kind).toBe('drone');
  expect(Math.abs(d.dx - 160)).toBeLessThan(40);
  expect(Math.abs(d.dy)).toBeLessThan(40);
  // Welle per Klick: gemischte Gruppe aus allen Arten
  await page.getByRole('button', { name: 'Welle' }).click();
  const at2 = await G<{ x: number; y: number }>(page, 'g.arenaToScreen(g.player.x - 160, g.player.y)');
  await page.mouse.click(at2.x, at2.y);
  await expect.poll(n).toBe(7);
  expect(new Set(await G<string[]>(page, 'g.enemies.map((e) => e.kind)')).size).toBe(4);
  await expect(page.locator('#arena-stats')).toContainText('Gegner 7');
  // Ort und Anzahl bleiben gespeichert
  await page.reload();
  await ready(page);
  await expect(page.getByRole('button', { name: 'per Klick' })).toHaveClass(/on/);
});

test('M28: diagonal zielen – Hieb und Splitterblitz treffen diagonal, Schwung-Bogen sichtbar', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?arena=1');
  await ready(page);
  await G(page, "g.arenaSetLayout('open')");
  await expect.poll(() => G<string>(page, 'g.ready && g.arenaLayout'), { timeout: 30_000 }).toBe('open');
  await page.getByRole('checkbox', { name: 'Gegner eingefroren' }).check();
  await page.getByRole('checkbox', { name: 'Besiegte kommen wieder' }).uncheck();
  await page.getByRole('button', { name: 'Alle entfernen' }).click();
  // Zielen nach unten rechts (beide Tasten), dann stehen: Ziel bleibt, Sprite zeigt die Seitenansicht
  await G(page, 'g.teleport(20, 10)');
  await page.keyboard.down('d');
  await page.keyboard.down('s');
  await expect.poll(() => G<number>(page, 'g.player.aim.x')).toBeGreaterThan(0.5);
  await page.keyboard.up('d');
  await page.keyboard.up('s');
  await expect.poll(() => G<boolean>(page, 'g.player.moving')).toBe(false);
  const S = Math.SQRT1_2;
  expect(await G<{ x: number; y: number }>(page, 'g.player.aim')).toEqual({ x: S, y: S });
  expect(await G<string>(page, 'g.player.facing')).toBe('right');
  // R1: ein Schleim diagonal vorn, einer quer daneben (unten links). Gegner erscheinen nie direkt am Helden,
  // also erst einsetzen, dann den Helden dazwischen stellen.
  await G(page, 'g.teleport(10, 4)');
  await G(page, "g.arenaSpawnAt('slime', 21, 11)");
  await G(page, "g.arenaSpawnAt('slime', 19, 11)");
  await expect.poll(() => G<number>(page, 'g.enemies.length')).toBe(2);
  expect(await G<string>(page, "g.enemies.map((e) => Math.floor(e.x / 32) + ',' + Math.floor((e.y - 4) / 32)).sort().join(' ')")).toBe('19,11 21,11');
  await G(page, 'g.teleport(20, 10)');
  const hp0 = await G<{ id: string; x: number; hp: number }[]>(page, 'g.enemies.map((e) => ({ id: e.id, x: e.x, hp: e.hp }))');
  const diag = hp0.find((e) => e.x > 20 * 32 + 16)!;
  const side = hp0.find((e) => e.x < 20 * 32 + 16)!;
  const hpOf = (id: string) => G<number>(page, `(g.enemies.find((e) => e.id === '${id}') || { hp: -1 }).hp`);
  const arcs0 = await G<number>(page, 'g.arcs');
  await page.keyboard.press('Space');
  // R3: Schwung-Bogen erscheint – Bildschirmfoto mitten im Hieb
  await expect.poll(() => G<number>(page, 'g.arcs')).toBe(arcs0 + 1);
  if (process.env.SHOTS) await page.screenshot({ path: 'screenshots/m28-schwung-diagonal.png' }); // mitten im Hieb, ohne Wartezeit
  await expect.poll(() => hpOf(diag.id)).toBeLessThan(diag.hp);
  expect(await hpOf(side.id)).toBe(side.hp);
  // R2: Splitterblitz fliegt diagonal und trifft einen weiter entfernten Gegner unten rechts
  await page.getByRole('button', { name: 'Alle entfernen' }).click();
  await G(page, 'g.teleport(20, 10)');
  await G(page, "g.arenaSpawnAt('slime', 24, 14)");
  expect(await G<string>(page, "g.enemies.map((e) => Math.floor(e.x / 32) + ',' + Math.floor((e.y - 4) / 32)).join(' ')")).toBe('24,14');
  await expect.poll(() => G<number>(page, 'g.enemies.length')).toBe(1);
  const far = (await G<{ id: string; hp: number }[]>(page, 'g.enemies.map((e) => ({ id: e.id, hp: e.hp }))'))[0];
  await expect.poll(() => G<boolean>(page, '!g.swinging')).toBe(true);
  await page.keyboard.press('k');
  await expect.poll(() => hpOf(far.id), { timeout: 20_000 }).toBeLessThan(far.hp);
  // Vergleich der Diagonal-Ansicht: Vorder-/Rückansicht statt Seitenansicht
  await G(page, "g.arenaDiagonal('vertical')");
  await page.getByRole('button', { name: 'Alle entfernen' }).click();
  await G(page, 'g.teleport(20, 10)');
  await page.keyboard.down('d');
  await page.keyboard.down('s');
  await expect.poll(() => G<string>(page, 'g.player.facing')).toBe('down');
  await page.keyboard.up('d');
  await page.keyboard.up('s');
  await G(page, 'g.teleport(20, 10)');
  await expect.poll(() => G<boolean>(page, '!g.swinging && !g.player.moving')).toBe(true);
  const arcs1 = await G<number>(page, 'g.arcs');
  await page.keyboard.press('Space');
  await expect.poll(() => G<number>(page, 'g.arcs')).toBe(arcs1 + 1);
  if (process.env.SHOTS) await page.screenshot({ path: 'screenshots/m28-schwung-diagonal-vorderansicht.png' });
  expect(errors).toEqual([]);
});
