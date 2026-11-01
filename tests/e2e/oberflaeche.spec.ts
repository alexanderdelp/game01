import { expect, test } from '@playwright/test';
import { G, frames, open, shot, skipCreation, state, waitReady, watchErrors } from './helpers';

// Modul Oberfläche: Titel, Hinweise, Menüs, Karte, Minimap, Handy-Bedienung.
// Banner-Warteschlange (≥ 5 s, Reihenfolge), Zielgebiet und Musik prüfen die Unit-Tests m13 und m16.

test('Titel, neue Welt, Hinweise, Minimap, zurück zum Titel, Weiterspielen (M13 R2/R4, M16 R1/R4)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect.poll(() => G<string>(page, 'g.scene'), { timeout: 60_000 }).toBe('title');
  await shot(page, 'm13-title');
  await G(page, "g.titleStart('titel-test')");
  await expect.poll(() => G<string>(page, 'g.scene')).not.toBe('title');
  await skipCreation(page);
  await waitReady(page);
  expect(page.url()).toContain('seed=titel-test');

  // Erster Hinweis bleibt bis zum Klick stehen, dann kommt der nächste
  await expect.poll(() => G<string>(page, 'g.bannerTitle'), { timeout: 60_000 }).toContain('Willkommen');
  expect(await G<number>(page, 'g.tipsShown')).toBeGreaterThanOrEqual(1);
  await shot(page, 'm13-tips');
  await page.mouse.click(400, 300);
  await expect.poll(() => G<string>(page, 'g.bannerTitle')).toContain('Gelbes !');
  await expect.poll(() => G<boolean>(page, 'g.minimap'), { timeout: 20_000 }).toBe(true);

  // Zurück zum Titel: Welt steht unter "Weiterspielen"
  await page.keyboard.press('h');
  await expect.poll(() => G<boolean>(page, 'g.menuOpen')).toBe(true);
  expect(await G<boolean>(page, "g.clickPanel('menu-11')")).toBe(true);
  await expect.poll(() => G<string>(page, 'g.scene')).toBe('title');
  await shot(page, 'm13-title2');
  await G(page, "g.titleStart('titel-test')");
  await expect.poll(() => G<string>(page, 'g.scene')).toBe('world');
  await waitReady(page);
  // Hinweise nur beim ersten Mal: gemerkt im Speicher, daher keine neuen
  expect(await page.evaluate(() => localStorage.getItem('game01:tips'))).toBe('true');
  expect(await G<number>(page, 'g.tipsShown')).toBe(0);
  expect(errors).toEqual([]);
});

test('M22: Weltkarte zoomen und verschieben, feiner Ausschnitt ab 4× (R1, R2)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 }); // Detailstufe hängt an der Kartengröße
  const errors = await open(page, 'karte-test');
  const s = await G<{ tx: number; ty: number }>(page, '({ ...g.spawn })');
  await G(page, `g.fogReveal(${s.tx}, ${s.ty}, 700)`);
  await page.keyboard.press('m');
  await expect.poll(() => G<boolean>(page, 'g.mapReady'), { timeout: 20_000 }).toBe(true);
  expect(await G<number>(page, 'g.mapZoom')).toBe(1);
  await shot(page, 'm22-zoom1');
  // Zoomen per Knopf und Tastatur
  expect(await G<boolean>(page, "g.clickPanel('map-zoom-in')")).toBe(true);
  await page.keyboard.press('+');
  await expect.poll(() => G<number>(page, 'g.mapZoom')).toBe(4);
  await expect.poll(() => G<number>(page, 'g.mapDetail'), { timeout: 30_000 }).toBeGreaterThan(0);
  await shot(page, 'm22-zoom4');
  for (let i = 0; i < 3; i++) await G(page, 'g.mapZoomBy(1)');
  expect(await G<number>(page, 'g.mapZoom')).toBe(16);
  await expect.poll(() => G<number>(page, 'g.mapDetail'), { timeout: 30_000 }).toBe(2);
  await shot(page, 'm22-zoom16');
  // Ziehen verschiebt, Mausrad zoomt die Karte – nicht die Welt
  const zoomBefore = await G<number>(page, 'g.zoom');
  await page.mouse.move(640, 380);
  await page.mouse.down();
  await page.mouse.move(500, 300, { steps: 5 });
  await page.mouse.up();
  await page.mouse.wheel(0, 200);
  await expect.poll(() => G<number>(page, 'g.mapZoom')).toBe(8);
  expect(await G<number>(page, 'g.zoom')).toBe(zoomBefore);
  await page.keyboard.press('m');
  await expect.poll(() => G<boolean>(page, 'g.mapOpen')).toBe(false);
  expect(errors).toEqual([]);
});

test.describe('Handy', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('Stick, Karten-Knopf, Menü, Aktionsknopf, Ton aus, Minimap (M2 R8, M13 R1/R3, M16 R4)', async ({ page }) => {
    const errors = await open(page, 'touch-menu');
    expect((await state(page)).zoom).toBe(1);
    await expect.poll(() => G<boolean>(page, 'g.minimap'), { timeout: 20_000 }).toBe(true);
    await shot(page, 'm13-mobile');

    // Ziehen nach rechts/unten: der Stick steuert in Zugrichtung
    const before = (await state(page)).player;
    await page.mouse.move(200, 500);
    await page.mouse.down();
    await page.mouse.move(240, 500, { steps: 4 });
    await expect.poll(async () => (await state(page)).player.facing).toBe('right');
    await frames(page, 10);
    await page.mouse.move(200, 540, { steps: 4 });
    await expect.poll(async () => (await state(page)).player.facing).toBe('down');
    await frames(page, 10);
    await page.mouse.up();
    const after = (await state(page)).player;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(20);

    await page.touchscreen.tap(360, 25);
    await expect.poll(async () => (await state(page)).mapOpen).toBe(true);
    await page.keyboard.press('m');

    // Menü öffnet Fenster; Aktionsknopf
    await G(page, "g.clickPanel('action')");
    await page.keyboard.press('h');
    await expect.poll(() => G<boolean>(page, 'g.menuOpen')).toBe(true);
    await shot(page, 'm13-menu');
    expect(await G<boolean>(page, "g.clickPanel('menu-0')")).toBe(true);
    expect(await G<boolean>(page, 'g.panelOpen')).toBe(true);
    expect(await G<boolean>(page, 'g.menuOpen')).toBe(false);
    // Musik ausschalten bleibt gespeichert
    await page.keyboard.press('c');
    await page.keyboard.press('h');
    expect(await G<boolean>(page, "g.clickPanel('menu-10')")).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('game01:audio'))).toBe('false');
    expect(errors).toEqual([]);
  });
});
