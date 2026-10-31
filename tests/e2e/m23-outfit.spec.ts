import { expect, test, type Page } from '@playwright/test';
import { waitReady } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;

test('M23: Startkleidung je Volk, angelegte Kleidung bestimmt das Aussehen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=kleidung-test&test=1');
  await expect.poll(() => G<string>(page, 'g.scene'), { timeout: 30_000 }).toBe('create');
  await expect.poll(() => G<unknown>(page, 'g.createLook()')).not.toBeNull();
  await G(page, "g.createConfirm('Kleiderprobe')");
  await expect.poll(() => G<string>(page, 'g.scene')).toBe('world');
  await waitReady(page);
  // Mensch: Leinenhemd, Leinenhose, Schuhe
  expect(await G<string[]>(page, 'Object.keys(g.hero.equipped).sort()')).toEqual(['armor', 'feet', 'legs', 'weapon']);
  expect(await G<string>(page, 'g.heroLook().shoes')).toBe('shoes');
  // Neue Hose anlegen → Hosenfarbe kommt aus dem Gegenstand
  const id = await G<string>(page, "g.giveItem('legs')");
  const color = await G<string>(page, `g.hero.inventory.find((i) => i.id === "${id}").color`);
  await page.keyboard.press('c');
  expect(await G<boolean>(page, "g.clickPanel('inv-0')")).toBe(true);
  expect(await G<boolean>(page, "g.clickPanel('equip')")).toBe(true);
  expect(await G<string>(page, 'g.hero.equipped.legs.id')).toBe(id);
  expect(await G<string>(page, 'g.heroLook().legsColor')).toBe(color);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/m23-panel.png' });
  // Schuhe ablegen → barfuß
  expect(await G<boolean>(page, "g.clickPanel('slot-feet')")).toBe(true);
  expect(await G<string>(page, 'g.heroLook().shoes')).toBe('none');
  expect(errors).toEqual([]);
});
