import { describe, expect, it } from 'vitest';
import { DefeatLog, attackBox, knockback, levelForDistance, regen, rollDamage, scaleStats } from '../../src/combat/combat';
import { ENEMIES, SAFE_RADIUS, enemiesForChunk } from '../../src/combat/enemies';
import { BIOMES } from '../../src/world/biomes';
import { overlaps } from '../../src/world/collision';
import { mulberry32 } from '../../src/world/rng';
import { CHUNK_TILES, WorldGen } from '../../src/world/WorldGen';

describe('Kampflogik (R1)', () => {
  it('Schaden streut ±15 %, Verteidigung mindert, mindestens 1', () => {
    const rnd = mulberry32(3);
    const vals = Array.from({ length: 500 }, () => rollDamage(20, 0, rnd));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(17);
    expect(Math.max(...vals)).toBeLessThanOrEqual(23);
    expect(new Set(vals).size).toBeGreaterThan(3);
    expect(rollDamage(5, 100, rnd)).toBe(1);
    expect(rollDamage(20, 10, () => 0.5)).toBe(15);
  });

  it('Trefferbox liegt in Blickrichtung', () => {
    const target = (x: number, y: number) => ({ x: x - 8, y: y - 30, w: 16, h: 30 });
    expect(overlaps(attackBox(100, 100, 'right'), target(130, 100))).toBe(true);
    expect(overlaps(attackBox(100, 100, 'right'), target(70, 100))).toBe(false);
    expect(overlaps(attackBox(100, 100, 'left'), target(70, 100))).toBe(true);
    expect(overlaps(attackBox(100, 100, 'up'), target(100, 65))).toBe(true);
    expect(overlaps(attackBox(100, 100, 'down'), target(100, 135))).toBe(true);
    expect(overlaps(attackBox(100, 100, 'down'), target(100, 65))).toBe(false);
  });

  it('Rückstoß zeigt vom Angreifer weg', () => {
    const k = knockback(0, 0, 10, 0, 20);
    expect(k.x).toBeCloseTo(20);
    expect(k.y).toBeCloseTo(0);
  });

  it('Stufen und Werte skalieren mit Entfernung', () => {
    expect(levelForDistance(0)).toBe(1);
    expect(levelForDistance(149)).toBe(1);
    expect(levelForDistance(300)).toBe(3);
    const s1 = scaleStats({ hp: 20, attack: 10, defense: 2 }, 1);
    const s3 = scaleStats({ hp: 20, attack: 10, defense: 2 }, 3);
    expect(s1.hp).toBe(20);
    expect(s3.hp).toBeGreaterThan(s1.hp);
    expect(s3.attack).toBeGreaterThan(s1.attack);
  });
});

describe('Spieler (R4)', () => {
  it('regeneriert erst nach der Wartezeit und nie über das Maximum', () => {
    expect(regen(50, 100, 1, 1)).toBe(50);
    expect(regen(50, 100, 5, 1)).toBe(53);
    expect(regen(99, 100, 5, 2)).toBe(100);
    expect(regen(0, 100, 10, 1)).toBe(0);
  });
});

describe('Gegner-Auftreten (R2, R6)', () => {
  const w = new WorldGen('test');
  const spawn = w.findSpawn();

  it('deterministisch, biomgerecht, nie in der Sicherheitszone', () => {
    const all = [];
    for (let cy = 100; cy < 160; cy += 2) for (let cx = 100; cx < 160; cx += 2) all.push(...enemiesForChunk(w, cx, cy, spawn));
    expect(all.length).toBeGreaterThan(100);
    expect(new Set(all.map((e) => e.kind)).size).toBeGreaterThanOrEqual(3);
    for (const e of all) {
      expect(Math.hypot(e.tx - spawn.tx, e.ty - spawn.ty)).toBeGreaterThanOrEqual(SAFE_RADIUS);
      if (!ENEMIES[e.kind].flying) expect(BIOMES[w.biomeAt(e.tx, e.ty)].walkable).toBe(true);
      expect(e.level).toBeGreaterThanOrEqual(1);
    }
    expect(enemiesForChunk(new WorldGen('test'), 130, 130, spawn)).toEqual(enemiesForChunk(w, 130, 130, spawn));
    const cx = Math.floor(spawn.tx / CHUNK_TILES);
    const cy = Math.floor(spawn.ty / CHUNK_TILES);
    expect(enemiesForChunk(w, cx, cy, spawn)).toEqual([]);
  });

  it('besiegte Gegner bleiben eine Weile weg', () => {
    const log = new DefeatLog(1000);
    log.defeat('a', 0);
    expect(log.isDefeated('a', 500)).toBe(true);
    expect(log.isDefeated('a', 1000)).toBe(false);
    expect(log.isDefeated('b', 0)).toBe(false);
  });
});
