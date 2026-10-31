import { expect, test, type Page } from '@playwright/test';
import { open, skipCreation, waitReady } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;
const EPOCH = Date.UTC(2026, 0, 1);
const DAY = 24 * 60_000;
const HOUR = 60 * 60_000;

test('M10: Nacht, Wetter, Karawane, Neuigkeiten (R2, R3, R6)', async ({ page }) => {
  const errors = await open(page, 'test');
  // Nacht: Weltzeit auf Mitternacht stellen
  await page.evaluate(([epoch, day]) => {
    const now = Date.now();
    const g = (window as unknown as { __game: { timeOffset: number } }).__game;
    g.timeOffset = epoch + Math.ceil((now - epoch) / day) * day - now;
  }, [EPOCH, DAY]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/m10-night.png' });

  // Wetter: Stunde für Stunde vorspulen, bis es regnet oder schneit
  let weather = await G<string>(page, 'g.weather');
  for (let i = 0; i < 40 && weather !== 'regen' && weather !== 'schnee'; i++) {
    await page.evaluate((h) => ((window as unknown as { __game: { timeOffset: number } }).__game.timeOffset += h), HOUR);
    await page.waitForTimeout(1100);
    weather = await G<string>(page, 'g.weather');
  }
  expect(['regen', 'schnee']).toContain(weather);
  await page.evaluate((h) => ((window as unknown as { __game: { timeOffset: number } }).__game.timeOffset += h), DAY / 2);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/m10-weather.png' });
  await page.evaluate(() => ((window as unknown as { __game: { timeOffset: number } }).__game.timeOffset = 0));

  // Karawane: hinreisen, Bewegung prüfen, handeln
  const names = await G<string[]>(page, 'g.caravans');
  expect(names.length).toBeGreaterThan(0);
  // Eine Karawane wählen, die gerade unterwegs ist (am Ziel rasten sie kurz)
  const ci = await G<number>(page, `g.caravans.findIndex((_, i) => !g.caravanAt(i).resting)`);
  expect(ci).toBeGreaterThanOrEqual(0);
  const p0 = await G<{ tx: number; ty: number }>(page, `g.caravanAt(${ci})`);
  await G(page, `g.teleport(${Math.round(p0.tx)}, ${Math.round(p0.ty)})`);
  await waitReady(page);
  await expect.poll(() => G<number>(page, `g.npcs.filter((n) => n.id === 'car${ci}').length`), { timeout: 25_000 }).toBe(1);
  await page.evaluate((h) => ((window as unknown as { __game: { timeOffset: number } }).__game.timeOffset += h), 60_000);
  const p1 = await G<{ tx: number; ty: number }>(page, `g.caravanAt(${ci})`);
  expect(Math.hypot(p1.tx - p0.tx, p1.ty - p0.ty)).toBeGreaterThan(0.5);
  await page.evaluate(() => ((window as unknown as { __game: { timeOffset: number } }).__game.timeOffset = 0));
  let traded = false;
  for (let i = 0; i < 6 && !traded; i++) {
    const c = await G<{ x: number; y: number }>(page, `({ ...g.npcs.find((n) => n.id === 'car${ci}') })`);
    await G(page, `g.teleport(${Math.floor(c.x / 32)}, ${Math.floor(c.y / 32)})`);
    await page.keyboard.press('e');
    const d = await G<{ choices?: string[] } | null>(page, 'g.dialog');
    traded = d?.choices?.length === 3;
    if (traded) await page.screenshot({ path: 'screenshots/m10-caravan.png' });
    await page.keyboard.press('e');
  }
  expect(traded).toBe(true);

  // Neuigkeiten nach Abwesenheit
  await page.evaluate((h) => localStorage.setItem('game01:seen:test', JSON.stringify(Date.now() - 6 * h)), HOUR);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  await page.goto('/?seed=test');
  await page.evaluate((h) => localStorage.setItem('game01:seen:test', JSON.stringify(Date.now() - 6 * h)), HOUR);
  await page.reload();
  await skipCreation(page);
  await waitReady(page);
  await expect.poll(() => G<boolean>(page, 'g.newsOpen'), { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m10-news.png' });
  expect(errors).toEqual([]);
});
