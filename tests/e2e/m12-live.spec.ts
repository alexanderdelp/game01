import { expect, test, type Browser, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { waitReady } from './helpers';

const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;
type R = { pid: string; name: string; x: number; y: number; chat: string };

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

test('M12: Live – sehen, chatten, gemeinsam kämpfen (R2–R4)', async ({ browser }) => {
  test.setTimeout(180_000);
  const server = spawn('node', ['server/sync-server.mjs', '8798'], { env: { ...process.env, DATA_DIR: mkdtempSync(join(tmpdir(), 'live-')) }, stdio: 'ignore' });
  try {
    await new Promise((r) => setTimeout(r, 800));
    const url = '/?seed=live-test&sync=http://localhost:8798';
    const a = await player(browser, url, 'Ada');
    const b = await player(browser, url, 'Bo');
    await expect.poll(() => G<boolean>(a.page, 'g.liveConnected()')).toBe(true);
    await expect.poll(() => G<boolean>(b.page, 'g.liveConnected()')).toBe(true);

    // R2: Bo sieht Ada, und Adas Bewegung kommt an
    await expect.poll(async () => (await G<R[]>(b.page, 'g.remotes()')).map((r) => r.name), { timeout: 15_000 }).toContain('Ada');
    const x0 = (await G<R[]>(b.page, 'g.remotes()')).find((r) => r.name === 'Ada')!.x;
    const sp = await G<{ tx: number; ty: number }>(a.page, 'g.spawn');
    await G(a.page, `g.teleport(${sp.tx + 4}, ${sp.ty})`);
    await expect.poll(async () => (await G<R[]>(b.page, 'g.remotes()')).find((r) => r.name === 'Ada')!.x, { timeout: 10_000 }).toBeGreaterThan(x0 + 60);

    // R4: Chat
    await G(a.page, "g.chat('Hallo Bo!')");
    await expect.poll(async () => (await G<R[]>(b.page, 'g.remotes()')).find((r) => r.name === 'Ada')?.chat, { timeout: 10_000 }).toBe('Hallo Bo!');
    await b.page.waitForTimeout(300);
    await b.page.screenshot({ path: 'screenshots/m12-together.png' });

    // R3: Gemeinsamer Kampf – Adas Treffer schadet dem Gegner auch bei Bo
    const e = await G<{ tx: number; ty: number }>(a.page, "g.findEnemy('slime')");
    for (const p of [a.page, b.page]) {
      await G(p, `g.teleport(${e.tx - 3}, ${e.ty})`);
      await waitReady(p);
    }
    let hitId = '';
    for (let i = 0; i < 40 && !hitId; i++) {
      const t = await G<{ id: string; x: number; y: number; hp: number } | null>(a.page, `(() => { const p = g.player; const e = [...g.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; return e ? { ...e } : null; })()`);
      if (!t) break;
      await G(a.page, `g.teleport(${Math.floor((t.x - 24) / 32)}, ${Math.floor(t.y / 32)})`);
      await a.page.keyboard.press('d');
      await a.page.keyboard.press('Space');
      await a.page.waitForTimeout(300);
      const after = await G<{ id: string; hp: number }[]>(a.page, 'g.enemies.map((e) => ({ ...e }))');
      const hit = after.find((x) => x.id === t.id);
      if (!hit || hit.hp < t.hp) hitId = t.id;
    }
    expect(hitId).not.toBe('');
    await expect
      .poll(async () => {
        const list = await G<{ id: string; hp: number; kind: string }[]>(b.page, 'g.enemies.map((e) => ({ ...e }))');
        const en = list.find((x) => x.id === hitId);
        return !en || en.hp < 24;
      }, { timeout: 10_000 })
      .toBe(true);
    await a.page.screenshot({ path: 'screenshots/m12-fight.png' });
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    await a.close();
    await b.close();
  } finally {
    server.kill();
  }
});
