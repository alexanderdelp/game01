import { expect, test } from '@playwright/test';
import { G, shot, skipCreation, waitReady, watchErrors } from './helpers';

// Prototyp Vorgeschichte: Legenden-Modus und Spielwelt aus der Geschichte (mit Spielleiter-Karte).
// Simulation, Plausibilität und Erzähltexte prüfen die Unit-Tests (vorgeschichte.test.ts).

const SEED = 'nebel-kristall-427';
type Hist = { sites: number; realms: string[]; historic: { kind: string; tx: number; ty: number; site: number }[]; settlements: number; ruins: number; bigTown: { tx: number; ty: number; buildings: number; walls: number } };

test('Legenden-Modus: Übersicht mit Zeitaltern, Karte im Zeitverlauf, Detailseiten', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 860 });
  await page.goto(`/?legends=1&seed=${SEED}`);
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __legends?: { ready: boolean } }).__legends?.ready), { timeout: 60_000 }).toBe(true);
  await expect(page.locator('main h2')).toContainText(/\w+/);
  await expect(page.locator('main')).toContainText('Die Reiche von heute');
  await expect(page.locator('main')).toContainText('Zeitalter und Weltereignisse');
  await expect(page.locator('.band .run').first()).toBeVisible();
  await expect(page.locator('main')).toContainText('Die größten Orte');
  await shot(page, 'vorgeschichte-legenden');
  // Karte: Jahr-Regler verändert Jahr und Reiche
  await page.goto(`/?legends=1&seed=${SEED}#map?y=120`);
  await expect(page.locator('#lg-yv')).toHaveText('Jahr 120', { timeout: 60_000 });
  await shot(page, 'vorgeschichte-karte-jahr120');
  await page.locator('#lg-y').fill('7000');
  await expect(page.locator('#lg-yv')).toHaveText('Jahr 7000');
  await shot(page, 'vorgeschichte-karte-jahr7000');
  // Listen und verlinkte Detailseiten
  await page.locator('.lg-nav a[data-v=sites]').click();
  await page.locator('#lg-f').fill('Schlachtfeld');
  await page.locator('#lg-tab a.site').first().click();
  await expect(page.locator('main')).toContainText('Geschichte des Ortes');
  await expect(page.locator('main')).toContainText('Schlacht');
  await page.locator('main .ev a.civ').first().click();
  await expect(page.locator('main')).toContainText('Herrscher');
  await shot(page, 'vorgeschichte-reich');
  await page.locator('.lg-nav a[data-v=timeline]').click();
  await expect(page.locator('.gantt .bar').first()).toBeVisible();
  // Wahrheit zeigt mehr als die Überlieferung
  await page.locator('.lg-nav a[data-v=events]').click();
  const lore = Number((await page.locator('#lg-n').textContent())!.split(' ')[0]);
  await page.locator('#lg-truth').check();
  await expect.poll(async () => Number((await page.locator('#lg-n').textContent())!.split(' ')[0])).toBeGreaterThan(lore);
  await page.locator('#lg-truth').uncheck();
  expect(errors).toEqual([]);
});

test('Werkstatt: Voreinstellung wählen, System abschalten, neu erzeugen (Konfiguration in der URL)', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await page.goto(`/?legends=1&seed=${SEED}#workshop`);
  await expect(page.locator('#ws-go')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('main')).toContainText('Weltereignisse');
  await shot(page, 'vorgeschichte-werkstatt');
  await page.locator('#ws-preset').selectOption('short');
  await expect(page.locator('[data-p="epochs.0.years"]')).toHaveValue('600');
  await page.locator('[data-p="systems.wars.on"]').uncheck();
  await expect(page.locator('#ws-sum')).toContainText('Abweichungen');
  await page.locator('#ws-go').click();
  await expect(page).toHaveURL(/hc=/);
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __legends?: { ready: boolean } }).__legends?.ready), { timeout: 60_000 }).toBe(true);
  const r = await page.evaluate(() => {
    const h = (window as unknown as { __legends: { history: { years: number; events: { k: string }[] } } }).__legends.history;
    return { years: h.years, battles: h.events.filter((e) => e.k === 'battle').length };
  });
  expect(r).toEqual({ years: 1200, battles: 0 });
  await expect(page.locator('#lg-play')).toHaveAttribute('href', /vorgeschichte=1&hc=/);
  expect(errors).toEqual([]);
});

test('Spiel mit Vorgeschichte: Orte aus der Geschichte, Fundort lesen, Spielleiter-Karte zeigt Ortsgeschichte', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.goto(`/?seed=${SEED}&test=1&vorgeschichte=1&gm=1`);
  await skipCreation(page);
  await waitReady(page);
  const h = await G<Hist>(page, 'g.history');
  expect(h.realms.length).toBe(6);
  expect(h.settlements).toBeGreaterThan(40);
  expect(h.ruins).toBeGreaterThan(5);
  expect(h.historic.length).toBeGreaterThan(10);
  // Große Stadt: viele Gebäude, Mauerring
  const town = h.bigTown;
  expect(town.buildings).toBeGreaterThan(300);
  expect(town.walls).toBeGreaterThan(50);
  await G(page, 'g.gmSet(true)');
  await G(page, `g.gmTeleport(${town.tx}, ${town.ty + 6})`);
  await waitReady(page);
  await shot(page, 'vorgeschichte-grossstadt');

  // Grabmal: Inschrift lesen (E)
  await G(page, 'g.gmSet(true)');
  const tomb = h.historic.find((p) => p.kind === 'tomb')!;
  await G(page, `g.gmTeleport(${tomb.tx}, ${tomb.ty + 1})`);
  await waitReady(page);
  await expect.poll(() => G<string>(page, 'g.biome'), { timeout: 20_000 }).not.toBe('…');
  await page.keyboard.press('e');
  await expect.poll(() => G<string>(page, 'g.dialog?.name ?? ""')).toContain('Grabmal');
  await shot(page, 'vorgeschichte-grabmal');
  await page.keyboard.press('Escape');

  // Spielleiter-Karte: Klick auf einen historischen Ort → Teleport + Geschichte mit Link in die Legenden
  const target = h.historic.find((p) => p.kind === 'memorial') ?? h.historic[0];
  await page.keyboard.press('m');
  await expect.poll(() => G<boolean>(page, 'g.mapReady'), { timeout: 20_000 }).toBe(true);
  await shot(page, 'vorgeschichte-gm-karte');
  const toScreen = () => G<{ x: number; y: number }>(page, `g.mapTileToScreen(${target.tx}, ${target.ty})`);
  for (let z = 2; z <= 8; z *= 2) {
    const p = await toScreen();
    await page.mouse.move(p.x, p.y);
    await page.mouse.wheel(0, -100);
    await expect.poll(() => G<number>(page, 'g.mapZoom')).toBe(z);
  }
  await shot(page, 'vorgeschichte-gm-karte-zoom');
  const at = await toScreen();
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => G<boolean>(page, 'g.mapOpen')).toBe(false);
  await expect(page.locator('#history-panel')).toBeVisible();
  await expect(page.locator('#history-panel a')).toHaveAttribute('href', new RegExp(`legends=1.*#site/${target.site}`));
  await waitReady(page);
  await shot(page, 'vorgeschichte-gm-ort');
  expect(errors).toEqual([]);
});
