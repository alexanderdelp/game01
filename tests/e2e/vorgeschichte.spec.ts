import { expect, test } from '@playwright/test';
import { G, shot, skipCreation, waitReady, watchErrors } from './helpers';

// Prototyp Vorgeschichte: Legenden-Modus und Spielwelt aus der Geschichte (mit Spielleiter-Karte).
// Simulation, Plausibilität und Erzähltexte prüfen die Unit-Tests (vorgeschichte.test.ts).

const SEED = 'nebel-kristall-427';
type Hist = { sites: number; realms: string[]; historic: { kind: string; tx: number; ty: number; site: number }[]; settlements: number; ruins: number };

test('Legenden-Modus: Übersicht, Karte im Zeitverlauf, Detailseiten', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 860 });
  await page.goto(`/?legends=1&seed=${SEED}`);
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __legends?: { ready: boolean } }).__legends?.ready), { timeout: 60_000 }).toBe(true);
  await expect(page.locator('main h2')).toContainText(/\w+/);
  await expect(page.locator('main')).toContainText('Die Reiche von heute');
  await shot(page, 'vorgeschichte-legenden');
  // Karte: Jahr-Regler verändert Jahr und Reiche
  await page.goto(`/?legends=1&seed=${SEED}#map?y=120`);
  await expect(page.locator('#lg-yv')).toHaveText('Jahr 120', { timeout: 60_000 });
  await shot(page, 'vorgeschichte-karte-jahr120');
  await page.locator('#lg-y').fill('600');
  await expect(page.locator('#lg-yv')).toHaveText('Jahr 600');
  await shot(page, 'vorgeschichte-karte-jahr600');
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
