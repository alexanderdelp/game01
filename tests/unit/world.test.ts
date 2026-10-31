import { describe, expect, it } from 'vitest';
import { B, BIOMES } from '../../src/world/biomes';
import { CHUNK_TILES, WORLD_TILES, WorldGen } from '../../src/world/WorldGen';
import { hashString, mulberry32 } from '../../src/world/rng';

describe('rng', () => {
  it('ist deterministisch', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });
});

describe('WorldGen', () => {
  const w = new WorldGen('test');

  it('R1: gleicher Seed ergibt identische Chunks, unabhängig von der Reihenfolge', () => {
    const other = new WorldGen('test');
    other.chunk(140, 122); // andere Reihenfolge
    const a = w.chunk(128, 128);
    const b = other.chunk(128, 128);
    expect(Array.from(a.biomes)).toEqual(Array.from(b.biomes));
    expect(a.decorations).toEqual(b.decorations);
  });

  it('R1: Chunk-Daten entsprechen biomeAt (keine Nahtfehler)', () => {
    const c = w.chunk(127, 128);
    const L = CHUNK_TILES - 1;
    for (const [x, y] of [[0, 0], [L, 0], [0, L], [L, L], [7, 5]]) {
      expect(c.biomes[y * CHUNK_TILES + x]).toBe(w.biomeAt(127 * CHUNK_TILES + x, 128 * CHUNK_TILES + y));
    }
  });

  it('R2: unterschiedliche Seeds ergeben unterschiedliche Welten', () => {
    const a = new WorldGen('alpha').overview(64).biomes;
    const b = new WorldGen('beta').overview(64).biomes;
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
    expect(diff / a.length).toBeGreaterThan(0.2);
  });

  it('R3/R4: große ozeanumrandete Welt mit vielen Biomen', () => {
    for (const seed of ['test', 'nebel-kristall-427']) {
      const { size, biomes } = new WorldGen(seed).overview(16);
      const seen = new Set(biomes);
      let land = 0;
      for (const b of biomes) if (b > B.Ocean) land++;
      expect(land / biomes.length, seed).toBeGreaterThan(0.3);
      expect(land / biomes.length, seed).toBeLessThan(0.7);
      expect(seen.size, seed).toBeGreaterThanOrEqual(10);
      expect(seen.has(B.CrystalGrove), seed).toBe(true);
      expect(seen.has(B.ScrapWastes), seed).toBe(true);
      // Rand ist Wasser
      for (let i = 0; i < size; i++) {
        expect(biomes[i]).toBeLessThanOrEqual(B.Ocean);
        expect(biomes[(size - 1) * size + i]).toBeLessThanOrEqual(B.Ocean);
      }
    }
    expect(WORLD_TILES).toBe(8192);
  });

  it('R5: Startpunkt ist immer begehbar', () => {
    for (const seed of ['a', 'test', 'neon-tor-123']) {
      const g = new WorldGen(seed);
      const s = g.findSpawn();
      expect(BIOMES[g.biomeAt(s.tx, s.ty)].walkable, seed).toBe(true);
    }
  });

  it('R6: ein Chunk ist schnell generiert', () => {
    w.chunk(10, 10); // aufwärmen
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) w.chunk(120 + i, 140);
    expect((performance.now() - t0) / 10).toBeLessThan(25);
  });

  it('außerhalb der Welt ist Tiefsee', () => {
    expect(w.biomeAt(-1, 10)).toBe(B.DeepOcean);
    expect(w.biomeAt(10, WORLD_TILES)).toBe(B.DeepOcean);
  });
});
