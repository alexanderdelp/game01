import { expect, type Page } from '@playwright/test';

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

export async function open(page: Page, seed: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`/?seed=${seed}`);
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

export async function waitReady(page: Page) {
  await expect.poll(async () => (await state(page))?.ready, { timeout: 30_000 }).toBe(true);
}

export async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
