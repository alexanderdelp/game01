import { expect, test, type Page } from '@playwright/test';
import { waitReady } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;

test('M18/M23: Völker und Merkmale im Editor, Barbier ändert Frisur gegen Splitter', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=barbier-test&test=1');
  await expect.poll(() => G<string>(page, 'g.scene'), { timeout: 30_000 }).toBe('create');
  await expect.poll(() => G<unknown>(page, 'g.createLook()')).not.toBeNull();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/m18-human.png' });
  // Weiblich, Pferdeschwanz
  await G(page, 'g.createChange(1, 1)');
  for (let i = 0; i < 12 && (await G<string>(page, 'g.createLook().hair')) !== 'ponytail'; i++) await G(page, 'g.createChange(3, 1)');
  expect(await G<{ body: string; hair: string }>(page, 'g.createLook()')).toMatchObject({ body: 'female', hair: 'ponytail' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/m18-female.png' });
  // Synth: kein Geschlecht, Leuchtfarbe als Volksmerkmal (Zeile 5)
  for (let i = 0; i < 3; i++) await G(page, 'g.createChange(0, 1)');
  expect(await G<string>(page, 'g.createLook().race')).toBe('synth');
  expect(await G<string>(page, 'g.createLook().body')).toBe('male');
  const glow0 = await G<string>(page, 'g.createLook().glow');
  await G(page, 'g.createChange(5, 1)');
  expect(await G<string>(page, 'g.createLook().glow')).not.toBe(glow0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/m18-synth.png' });
  // Ork (männlich, muskulös)
  await G(page, 'g.createChange(0, -1)');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/m18-orc.png' });
  // Elf mit Augenfarbe
  await G(page, 'g.createChange(0, -1)');
  await G(page, 'g.createChange(5, 1)');
  expect(await G<string>(page, 'g.createLook().eyes')).toBeTruthy();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/m18-elf.png' });
  await G(page, "g.createConfirm('Barbiertest')");
  await expect.poll(() => G<string>(page, 'g.scene')).toBe('world');
  await waitReady(page);

  // Zum Barbier der nächsten Siedlung
  const s = await G<{ tx: number; ty: number; id: number }>(page, '(() => { const t = g.meta.settlements[0]; return { tx: t.tx, ty: t.ty, id: t.id }; })()');
  await G(page, 'g.hero.shards = 25');
  await G(page, `g.teleport(${s.tx + 2}, ${s.ty + 3})`);
  await waitReady(page);
  await expect.poll(() => G<boolean>(page, `g.npcs.some((n) => n.id === "b${s.id}")`), { timeout: 15_000 }).toBe(true);
  const b = await G<{ x: number; y: number }>(page, `({ ...g.npcs.find((n) => n.id === "b${s.id}") })`);
  await G(page, `g.teleport(${Math.floor(b.x / 32)}, ${Math.floor(b.y / 32) + 1})`);
  await page.keyboard.press('e');
  await expect.poll(() => G<string>(page, 'g.dialog?.role ?? ""')).toBe('Barbier');
  await page.keyboard.press('1');
  await expect.poll(() => G<string>(page, 'g.scene')).toBe('create');
  await expect.poll(() => G<unknown>(page, 'g.createLook()')).not.toBeNull();
  // Beim Barbier: erste Zeile ist die Frisur (Volk/Körper/Haut fest)
  const hair0 = await G<string>(page, 'g.createLook().hair');
  await G(page, 'g.createChange(0, 1)');
  expect(await G<string>(page, 'g.createLook().hair')).not.toBe(hair0);
  expect(await G<string>(page, 'g.createLook().race')).toBe('elf');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m18-barber.png' });
  await G(page, 'g.createConfirm()');
  await expect.poll(() => G<string>(page, 'g.scene')).toBe('world');
  await waitReady(page);
  expect(await G<number>(page, 'g.hero.shards')).toBe(5);
  expect(errors).toEqual([]);
});
