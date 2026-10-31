import { expect, test, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { waitReady } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;
type State = { prosperity: Record<string, number>; discovered: Record<string, string> };

async function player(browser: Browser, url: string, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await expect.poll(() => G<string>(page, "g.scene + (g.createLook() ? '+' : '')"), { timeout: 30_000 }).toBe('create+');
  await G(page, `g.createConfirm('${name}')`);
  await expect.poll(() => G<string>(page, 'g.scene')).toBe('world');
  await waitReady(page);
  return { page, errors, close: () => ctx.close() };
}


test('M11: Welt per Link teilen – Freund sieht meine Taten (R2, R3, R5)', async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await player(browser, '/?seed=share-test', 'Ada');
  await G(a.page, "g.placeSign('Hallo von Ada!')");
  const town = await G<{ tx: number; ty: number }>(a.page, 'g.meta.settlements[0]');
  for (let i = 0; i < 10; i++) await G(a.page, `g.recordQuest(${town.tx}, ${town.ty})`);
  const link = await G<string>(a.page, 'g.shareLink()');
  expect(link).toContain('#w=');

  const b = await player(browser, link, 'Bo');
  await expect.poll(async () => (await G<State>(b.page, 'g.state()')).prosperity['0'], { timeout: 10_000 }).toBe(10);
  const players = await G<{ name: string }[]>(b.page, 'g.players()');
  expect(players.map((p) => p.name)).toContain('Ada');
  expect(await G<boolean>(b.page, 'g.newsOpen')).toBe(true);
  await b.page.waitForTimeout(300);
  await b.page.screenshot({ path: 'screenshots/m11-import.png' });
  await b.page.keyboard.press('u');
  // Ada's Botschaft steht in Bos Welt; Bo liest sie
  const sp = await G<{ tx: number; ty: number }>(b.page, 'g.spawn');
  await G(b.page, `g.teleport(${sp.tx}, ${sp.ty})`);
  await waitReady(b.page);
  await b.page.keyboard.press('e');
  await expect.poll(() => G<string>(b.page, "g.dialog?.text ?? ''")).toContain('Hallo von Ada');
  await b.page.screenshot({ path: 'screenshots/m11-sign.png' });
  // Statue in Bos Welt trägt Adas Namen: Ort besuchen
  await G(b.page, `g.teleport(${town.tx}, ${town.ty + 2})`);
  await waitReady(b.page);
  await b.page.keyboard.press('e');
  await b.page.waitForTimeout(1500);
  await b.page.screenshot({ path: 'screenshots/m11-statue.png' });
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.close();
  await b.close();
});

test('M11: Automatischer Abgleich über den Referenz-Server (R4)', async ({ browser }) => {
  test.setTimeout(150_000);
  const dir = mkdtempSync(join(tmpdir(), 'sync-'));
  const server: ChildProcess = spawn('node', ['server/sync-server.mjs', '8799'], { env: { ...process.env, DATA_DIR: dir }, stdio: 'ignore' });
  try {
    await new Promise((r) => setTimeout(r, 800));
    const url = '/?seed=sync-test&sync=http://localhost:8799';
    const a = await player(browser, url, 'Ada');
    await G(a.page, "g.placeSign('Ada war hier')");
    await G(a.page, 'g.syncNow()');
    const b = await player(browser, url, 'Bo');
    await G(b.page, 'g.syncNow()');
    await expect.poll(() => G<string[]>(b.page, 'g.players().map((p) => p.name)'), { timeout: 15_000 }).toContain('Ada');
    expect(await G<string>(b.page, 'g.syncStatus()')).toBe('verbunden');
    await G(b.page, "g.placeSign('Bo grüßt zurück')");
    await G(b.page, 'g.syncNow()');
    await G(a.page, 'g.syncNow()');
    await expect.poll(() => G<string[]>(a.page, 'g.players().map((p) => p.name)'), { timeout: 15_000 }).toContain('Bo');
    await a.page.keyboard.press('g');
    await a.page.waitForTimeout(300);
    await a.page.screenshot({ path: 'screenshots/m11-share.png' });
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    await a.close();
    await b.close();
  } finally {
    server.kill();
  }
});
