import { describe, expect, it } from 'vitest';
import { ELITE_CHANCE, enemiesForChunk, type EnemySpawn } from '../../src/combat/enemies';
import { generateItem } from '../../src/rpg/items';
import { mulberry32 } from '../../src/world/rng';
import { WorldGen } from '../../src/world/WorldGen';

const w = new WorldGen('test');

describe('Elite-Gegner (R1)', () => {
  it('etwa 6 % Elite, mit höherer Stufe', () => {
    const spawn = w.findSpawn();
    const all: EnemySpawn[] = [];
    for (let cy = 90; cy < 170; cy++) for (let cx = 90; cx < 170; cx += 2) all.push(...enemiesForChunk(w, cx, cy, spawn));
    const elites = all.filter((e) => e.elite);
    expect(elites.length / all.length).toBeGreaterThan(ELITE_CHANCE * 0.5);
    expect(elites.length / all.length).toBeLessThan(ELITE_CHANCE * 1.8);
    const normal = all.filter((e) => !e.elite);
    const avg = (l: typeof all) => l.reduce((s, e) => s + e.level, 0) / l.length;
    expect(avg(elites)).toBeGreaterThan(avg(normal));
  });

  it('Mindest-Seltenheit für Beute', () => {
    const rnd = mulberry32(9);
    for (let i = 0; i < 100; i++) expect(generateItem(3, rnd, undefined, 'rare').rarity).not.toBe('common');
    for (let i = 0; i < 20; i++) expect(generateItem(3, rnd, undefined, 'epic').rarity).toBe('epic');
  });
});

import { BIOMES } from '../../src/world/biomes';
import { CHUNK_TILES } from '../../src/world/WorldGen';

describe('Ruinen (R2)', () => {
  it('3 je Reich (meist), auf Land, abseits der Orte, mit Wächter und Truhe', () => {
    const m = w.meta;
    expect(m.ruins.length).toBeGreaterThanOrEqual(12);
    const spawn = w.findSpawn();
    for (const r of m.ruins) {
      expect(BIOMES[w.biomeAt(r.tx, r.ty)].walkable).toBe(true);
      expect(m.settlementNear(r.tx, r.ty, 29)).toBeNull();
      expect(w.decorationAt(r.tx, r.ty)?.kind).toBe('ruin');
      expect(m.poiAt(r.tx + 2, r.ty + 1)?.kind).toBe('ruinchest');
      const g = enemiesForChunk(w, Math.floor(r.tx / CHUNK_TILES), Math.floor(r.ty / CHUNK_TILES), spawn).find((e) => e.id === `g${r.id}`);
      expect(g?.elite).toBe(true);
    }
    expect(new WorldGen('test').meta.ruins).toEqual(m.ruins);
  });
});

import { SPELL, facingVector } from '../../src/combat/combat';

describe('Splitterblitz', () => {
  it('fliegt in Blickrichtung, hat Abklingzeit und Reichweite', () => {
    expect(facingVector('left')).toEqual({ x: -1, y: 0 });
    expect(facingVector('down')).toEqual({ x: 0, y: 1 });
    expect(SPELL.cooldown).toBeGreaterThan(1);
    expect(SPELL.range).toBeGreaterThan(200);
  });
});
