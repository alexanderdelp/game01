import { expect, test } from '@playwright/test';
import { G, frames, shot, watchErrors } from './helpers';

// Bewegungslabor (M33): echtes Gelände, „Der Berg“, Regler. Rechnungen selbst prüft m33.test.ts.
test.use({ viewport: { width: 1280, height: 720 } });

test('M33: Bewegungslabor – Berg mit Altar und Truhe, Gegner, Regler fürs Laufen', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?labor=1&ort=berg-gipfel');
  await expect.poll(() => G<boolean>(page, "!!g && g.scene === 'labor' && g.ready"), { timeout: 40_000 }).toBe(true);
  expect(await G<string>(page, 'g.labor.place')).toBe('berg-gipfel');
  expect(await G<string>(page, 'g.biome')).toBe('Schneefeld');
  expect(await G<unknown>(page, 'g.labor.altar')).not.toBeNull();
  // Oben: dichter Nebel, Schnee fällt
  await expect.poll(() => G<number>(page, 'g.labor.snow')).toBeGreaterThan(0.5);
  expect(await G<number>(page, 'g.labor.fog')).toBeGreaterThan(0.2);
  // Truhe der Schmuggler
  expect(await G<boolean>(page, 'g.laborOpenChest()')).toBe(true);
  expect(await G<boolean>(page, 'g.labor.chest.open')).toBe(true);
  // Gegner vor dem Helden
  await page.getByRole('button', { name: 'Schleim' }).click();
  await expect.poll(() => G<number>(page, 'g.enemies.length')).toBe(1);
  await shot(page, 'labor-gipfel');
  // Ort wechseln: Fuß des Bergs, Lauftempo per Regler
  await page.locator('#labor-place').selectOption('berg');
  await expect.poll(() => G<boolean>(page, "!!g && g.labor?.place === 'berg' && g.ready"), { timeout: 40_000 }).toBe(true);
  await G(page, "g.arenaTune('move.speed', 300)");
  const x0 = await G<number>(page, 'g.player.x');
  await page.keyboard.down('a');
  await frames(page, 20);
  await page.keyboard.up('a');
  expect(await G<number>(page, 'g.player.x')).toBeLessThan(x0 - 20);
  // Werte bleiben gespeichert
  await page.reload();
  await expect.poll(() => G<boolean>(page, "!!g && g.scene === 'labor' && g.ready"), { timeout: 40_000 }).toBe(true);
  expect(await G<string>(page, 'g.labor.place')).toBe('berg');
  await expect(page.locator('#labor-panel input[data-id="move.speed"]')).toHaveValue('300');
  expect(errors).toEqual([]);
});
