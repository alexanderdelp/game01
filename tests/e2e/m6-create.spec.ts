import { expect, test, type Page } from '@playwright/test';
import { waitReady } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;

test('M6: Held erschaffen und spielen (R3–R5)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=create-test');
  await expect.poll(() => G<string>(page, 'g.scene'), { timeout: 30_000 }).toBe('create');
  await expect.poll(() => G<unknown>(page, 'g.createLook()')).not.toBeNull();
  // Volk → Ork (2 Schritte), Körper → weiblich, Frisur wechseln
  await G(page, 'g.createChange(0, 1)');
  await G(page, 'g.createChange(0, 1)');
  await G(page, 'g.createChange(1, 1)');
  await G(page, 'g.createChange(3, 1)');
  const look = await G<{ race: string; body: string; skin: string }>(page, 'g.createLook()');
  expect(look.race).toBe('orc');
  expect(look.body).toBe('female');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/m6-create.png' });
  // Name über das Eingabefeld (Tastatur)
  await page.getByLabel('Name').fill('Grimma');
  await page.getByLabel('Name').press('m');
  await G(page, 'g.createConfirm()');
  await expect.poll(() => G<string>(page, 'g.scene')).toBe('world');
  await waitReady(page);
  expect(await G<string>(page, 'g.hero.name')).toBe('Grimmam');
  expect(await G<string>(page, 'g.hero.race')).toBe('orc');
  expect(await G<number>(page, 'g.maxHp')).toBe(120);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m6-ingame.png' });

  // Nach Neuladen direkt ins Spiel
  await page.reload();
  await expect.poll(() => G<string>(page, 'g.scene'), { timeout: 30_000 }).toBe('world');
  await waitReady(page);

  // Aussehen lässt sich nicht mehr im Heldenfenster ändern (M18: nur beim Barbier, siehe m18-barber.spec.ts)
  await page.keyboard.press('c');
  expect(await G<boolean>(page, "g.clickPanel('appearance')")).toBe(false);
  expect(errors).toEqual([]);
});
