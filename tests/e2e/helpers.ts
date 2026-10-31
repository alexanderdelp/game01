import { expect, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type GameState = {
  seed: string; ready: boolean; focus: { tx: number; ty: number }; biome: string;
  player: { x: number; y: number; facing: string; moving: boolean };
  zoom: number; chunksLoaded: number; mapOpen: boolean; mapReady: boolean;
};

export const state = (page: Page) =>
  page.evaluate(() => {
    const g = (window as unknown as { __game: GameState & Record<string, unknown> }).__game;
    return JSON.parse(JSON.stringify(g)) as GameState;
  });

/** Wertet einen Ausdruck mit `g = window.__game` im Spiel aus. */
export const G = <T>(page: Page, expr: string) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`) as Promise<T>;

/** Sammelt Seitenfehler und Konsolenfehler. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

export async function open(page: Page, seed: string) {
  const errors = watchErrors(page);
  await page.goto(`/?seed=${seed}&test=1`);
  await skipCreation(page);
  await waitReady(page);
  return errors;
}

/** Bestätigt den Erschaffungsbildschirm mit Standardwerten, falls er erscheint. */
export async function skipCreation(page: Page) {
  const sceneOf = () => page.evaluate(() => (window as unknown as { __game?: { scene: string } }).__game?.scene ?? '');
  await expect.poll(sceneOf, { timeout: 30_000 }).not.toBe('');
  const scene = await page.evaluate(() => (window as unknown as { __game: { scene: string } }).__game.scene);
  if (scene === 'create') await page.evaluate(() => (window as unknown as { __game: { createConfirm(n?: string): void } }).__game.createConfirm('Testheld'));
}

/** Wartet auf den Erschaffungsbildschirm (neue Welt), samt fertiger Vorschau. */
export async function waitCreate(page: Page) {
  await expect.poll(() => G<string>(page, "g.scene + (g.createLook() ? '+' : '')"), { timeout: 30_000 }).toBe('create+');
}

export async function waitReady(page: Page) {
  await expect.poll(async () => (await state(page))?.ready, { timeout: 30_000 }).toBe(true);
}

/** Teleportiert und wartet, bis die Umgebung geladen ist. */
export async function tp(page: Page, tx: number, ty: number) {
  await G(page, `g.teleport(${Math.floor(tx)}, ${Math.floor(ty)})`);
  await expect.poll(() => G<{ tx: number; ty: number }>(page, '({ ...g.focus })')).toEqual({ tx: Math.floor(tx), ty: Math.floor(ty) });
  await waitReady(page);
}

/** Speichert alles wie beim Schließen des Tabs und lädt neu. */
export async function saveAndReload(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await skipCreation(page);
  await waitReady(page);
}

export async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

type Dialog = { text: string; name: string; role?: string; choices?: string[] };

/**
 * Geht zu einem NPC (Rolle oder Id) und spricht ihn an. NPCs laufen weiter und laden auf
 * langsamen Rechnern spät nach – daher wird bis zum Zeitlimit wiederholt.
 */
export async function talkTo(page: Page, who: { role?: string; id?: string }, ok: (d: Dialog) => boolean = () => true, timeout = 30_000): Promise<Dialog> {
  const find = who.id ? `g.npcs.find((n) => n.id === ${JSON.stringify(who.id)})` : `g.npcs.find((n) => n.role === ${JSON.stringify(who.role)})`;
  let found: Dialog | null = null;
  await expect
    .poll(async () => {
      const open = await G<Dialog | null>(page, 'g.dialog');
      if (open) await page.keyboard.press('e'); // altes Gespräch schließen
      const n = await G<{ x: number; y: number } | null>(page, `(() => { const n = ${find}; return n ? { x: n.x, y: n.y } : null; })()`);
      if (!n) return false;
      await G(page, `g.teleport(${Math.floor(n.x / 32)}, ${Math.floor(n.y / 32)})`);
      await page.keyboard.press('e');
      const d = await G<Dialog | null>(page, 'g.dialog');
      if (d && ok(d)) found = d;
      return !!found;
    }, { timeout, intervals: [300] })
    .toBe(true);
  return found!;
}

/** Bildschirmfoto nur mit `SHOTS=1` (für Statusberichte, `npm run shots`); im normalen Testlauf übersprungen. */
export async function shot(page: Page, name: string) {
  if (!process.env.SHOTS) return;
  await page.waitForTimeout(300);
  await page.screenshot({ path: `screenshots/${name}.png` });
}

/** Ein weiterer Spieler in eigenem Browser-Kontext (eigener Speicher), Held wird erschaffen. */
export async function player(browser: Browser, url: string, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(url);
  await waitCreate(page);
  await G(page, `g.createConfirm('${name}')`);
  await expect.poll(() => G<string>(page, 'g.scene')).toBe('world');
  await waitReady(page);
  return { page, errors, close: () => ctx.close() };
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

/** Startet den Referenz-Server auf einem freien Port mit leerem Datenordner und wartet, bis er antwortet. */
export async function syncServer(): Promise<{ url: string; stop: () => void }> {
  const port = await freePort();
  const proc: ChildProcess = spawn('node', ['server/sync-server.mjs', String(port)], { env: { ...process.env, DATA_DIR: mkdtempSync(join(tmpdir(), 'sync-')) }, stdio: 'ignore' });
  const url = `http://localhost:${port}`;
  await expect
    .poll(() => fetch(url).then(() => true, () => false), { timeout: 10_000, intervals: [100] })
    .toBe(true);
  return { url, stop: () => proc.kill() };
}
