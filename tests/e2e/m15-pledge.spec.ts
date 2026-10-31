import { expect, test, type Page } from '@playwright/test';
import { open, waitReady } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;
type Town = { name: string; tx: number; ty: number; capital: boolean; realm: number };

async function talkTo(page: Page, role: string): Promise<{ text: string; name: string; choices?: string[] } | null> {
  for (let i = 0; i < 10; i++) {
    const n = await G<{ x: number; y: number } | null>(page, `(() => { const n = g.npcs.find((n) => n.role === '${role}'); return n ? { ...n } : null; })()`);
    if (!n) {
      await page.waitForTimeout(500);
      continue;
    }
    await G(page, `g.teleport(${Math.floor(n.x / 32)}, ${Math.floor(n.y / 32)})`);
    await page.keyboard.press('e');
    const d = await G<{ text: string; name: string; choices?: string[] } | null>(page, 'g.dialog');
    if (d && (role !== 'ruler' || d.name.includes('Herrscher'))) return d;
    if (d) await page.keyboard.press('e');
    await page.waitForTimeout(300);
  }
  return null;
}

test('M15: Treueschwur beim Herrscher, Rabatt und Handelsverweigerung (R3)', async ({ page }) => {
  const errors = await open(page, 'test');
  const towns = await G<Town[]>(page, 'g.meta.settlements');
  const rivals = await G<number[]>(page, 'g.meta.rivals');
  const capA = towns.find((t) => t.capital)!;
  const capRival = towns.find((t) => t.capital && t.realm === rivals[capA.realm])!;

  // Hauptstadt A: Treue schwören
  await G(page, `g.teleport(${capA.tx}, ${capA.ty + 1})`);
  await waitReady(page);
  const d = await talkTo(page, 'ruler');
  expect(d?.choices?.[0]).toBe('Treue schwören');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/m15-ruler.png' });
  await page.keyboard.press('1');
  expect(await G<number | null>(page, 'g.pledge()')).toBe(capA.realm);

  // Händler im eigenen Reich: Rabatt mit Gruß
  const md = await talkTo(page, 'merchant');
  expect(md?.text).toContain('Gefolgsmann');
  await page.keyboard.press('e');

  // Hauptstadt des Rivalen: Händler verweigert den Handel
  await G(page, `g.teleport(${capRival.tx}, ${capRival.ty + 1})`);
  await waitReady(page);
  await expect.poll(() => G<number>(page, "g.npcs.filter((n) => n.role === 'merchant').length"), { timeout: 15_000 }).toBeGreaterThan(0);
  const rd = await talkTo(page, 'merchant');
  expect(rd?.text).toContain('Feinde');
  expect(rd?.choices).toBeUndefined();
  await page.screenshot({ path: 'screenshots/m15-refused.png' });
  expect(errors).toEqual([]);
});
