import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SYNC_URL, syncUrlFromLocation } from '../../src/state/sync';

// Wahl des Sync-Servers: öffentlicher Standard, eigener Server, dauerhaft aus (localStorage als Attrappe)
beforeEach(() => {
  const m = new Map<string, string>();
  globalThis.localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as Storage;
});

describe('Sync-Adresse', () => {
  it('veröffentlichtes Spiel gleicht standardmäßig mit dem öffentlichen Server ab, Tests und Entwicklung nicht', () => {
    expect(syncUrlFromLocation('?seed=a', true)).toBe(DEFAULT_SYNC_URL);
    expect(syncUrlFromLocation('?seed=a&test=1', true)).toBeNull();
    expect(syncUrlFromLocation('?seed=a', false)).toBeNull();
  });

  it('eigener Server und „aus“ werden gemerkt, ?sync=on kehrt zum Standard zurück', () => {
    expect(syncUrlFromLocation('?sync=http://x:1', true)).toBe('http://x:1');
    expect(syncUrlFromLocation('', true)).toBe('http://x:1');
    expect(syncUrlFromLocation('?sync=off', true)).toBeNull();
    expect(syncUrlFromLocation('', true)).toBeNull();
    expect(syncUrlFromLocation('?sync=on', true)).toBe(DEFAULT_SYNC_URL);
    expect(syncUrlFromLocation('', true)).toBe(DEFAULT_SYNC_URL);
  });
});
