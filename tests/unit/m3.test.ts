import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../src/world/biomes';
import { ARCHETYPES, ROLES, archetypes, npcsForChunk, wanderTarget } from '../../src/world/npcs';
import { mulberry32 } from '../../src/world/rng';
import { WORLD_CHUNKS, WorldGen } from '../../src/world/WorldGen';

describe('NPCs', () => {
  const w = new WorldGen('test');
  const sample = () => {
    const all = [];
    for (let cy = 100; cy < 156; cy += 2) for (let cx = 100; cx < 156; cx += 2) all.push(...npcsForChunk(w, cx, cy));
    return all;
  };

  it('R1: deterministisch je Seed und Chunk', () => {
    const w2 = new WorldGen('test');
    for (let c = 120; c < 140; c++) expect(npcsForChunk(w2, c, c)).toEqual(npcsForChunk(w, c, c));
  });

  it('R2: nur auf begehbarem Land, Rollen existieren, ausreichend viele', () => {
    const all = sample();
    expect(all.length).toBeGreaterThan(50);
    for (const n of all) {
      expect(BIOMES[w.biomeAt(n.tx, n.ty)].walkable).toBe(true);
      expect(ROLES[n.role]).toBeDefined();
    }
    expect(new Set(all.map((n) => n.role)).size).toBeGreaterThanOrEqual(3);
  });

  it('R2: im offenen Ozean gibt es niemanden', () => {
    expect(npcsForChunk(w, 2, 2)).toEqual([]);
    expect(npcsForChunk(w, WORLD_CHUNKS - 3, 5)).toEqual([]);
  });

  it('R4: Wanderziele bleiben im Radius und sind begehbar', () => {
    const rnd = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const t = wanderTarget({ tx: 50, ty: 50 }, 6, rnd, (x) => x % 3 !== 0);
      if (!t) continue;
      expect(Math.abs(t.tx - 50)).toBeLessThanOrEqual(6);
      expect(Math.abs(t.ty - 50)).toBeLessThanOrEqual(6);
      expect(t.tx % 3).not.toBe(0);
    }
  });

  it('R6: Archetypen und Namen sind vielfältig', () => {
    const looks = archetypes(w.seed);
    expect(looks).toHaveLength(ARCHETYPES);
    expect(new Set(looks.map((l) => JSON.stringify(l))).size).toBe(ARCHETYPES);
    expect(new Set(looks.map((l) => l.skin)).size).toBeGreaterThan(3);
    const names = new Set(sample().map((n) => n.name));
    expect(names.size).toBeGreaterThan(20);
  });
});
