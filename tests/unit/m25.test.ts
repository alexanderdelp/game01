import { describe, expect, it } from 'vitest';
import { ARENA_H, ARENA_W, Cell, HERO_TILE, LAYOUTS, MUD_SPEED, blockedIn, buildLayout, cellAt, placeGroup, speedIn, walkableIn } from '../../src/arena/layouts';
import { arenaHeroStats, arenaWeapon } from '../../src/arena/weapons';
import { findPath, lineClear, waypoint } from '../../src/combat/pathing';

describe('M25 Arena-Aufbauten', () => {
  it('jeder Aufbau: Held frei, Rand geschlossen, alle freien Kacheln vom Helden aus erreichbar', () => {
    for (const { id } of LAYOUTS) {
      const l = buildLayout(id);
      expect(walkableIn(l, HERO_TILE.tx, HERO_TILE.ty), id).toBe(true);
      for (let x = 0; x < ARENA_W; x++) expect(walkableIn(l, x, 0) || walkableIn(l, x, ARENA_H - 1)).toBe(false);
      // Breitensuche (4 Richtungen) vom Helden aus
      const seen = new Set([`${HERO_TILE.tx},${HERO_TILE.ty}`]);
      const q = [[HERO_TILE.tx, HERO_TILE.ty]];
      while (q.length) {
        const [x, y] = q.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${x + dx},${y + dy}`;
          if (!seen.has(k) && walkableIn(l, x + dx, y + dy)) seen.add(k), q.push([x + dx, y + dy]);
        }
      }
      let free = 0;
      for (let y = 0; y < ARENA_H; y++) for (let x = 0; x < ARENA_W; x++) if (walkableIn(l, x, y)) free++;
      expect(seen.size, id).toBe(free);
      expect(free, id).toBeGreaterThan(400);
    }
  });

  it('Hindernisse sind Daten: Säulen und Bäume blockieren, Sumpf bremst, Wasser sperrt', () => {
    expect(buildLayout('open').props.length).toBe(0);
    expect(buildLayout('pillars').props.every((p) => p.box)).toBe(true);
    const forest = buildLayout('forest');
    expect(forest.props.filter((p) => p.box).length).toBeGreaterThan(30);
    const tree = forest.props.find((p) => p.box)!;
    expect(blockedIn(forest, tree.box!)).toBe(true);
    const choke = buildLayout('choke');
    expect(cellAt(choke, 13, 2)).toBe(Cell.Wall);
    expect(cellAt(choke, 13, 5)).toBe(Cell.Floor);
    const swamp = buildLayout('swamp');
    let mud = 0;
    let water = 0;
    for (let y = 0; y < ARENA_H; y++)
      for (let x = 0; x < ARENA_W; x++) {
        const c = cellAt(swamp, x, y);
        if (c === Cell.Mud) {
          mud++;
          expect(speedIn(swamp, x * 32 + 16, y * 32 + 16)).toBe(MUD_SPEED);
        }
        if (c === Cell.Water) {
          water++;
          expect(blockedIn(swamp, { x: x * 32 + 10, y: y * 32 + 10, w: 4, h: 4 })).toBe(true);
        }
      }
    expect(mud).toBeGreaterThan(60);
    expect(water).toBeGreaterThan(20);
    expect(speedIn(buildLayout('open'), 300, 300)).toBe(1);
  });

  it('Gruppen erscheinen auf freien, verschiedenen Kacheln nahe dem Ziel', () => {
    const l = buildLayout('choke');
    const g = placeGroup(l, 13, 10, 5);
    expect(g.length).toBe(5);
    expect(new Set(g.map((p) => `${p.tx},${p.ty}`)).size).toBe(5);
    for (const p of g) expect(walkableIn(l, p.tx, p.ty)).toBe(true);
  });
});

describe('M25 Wegfindung der Gegner', () => {
  const l = buildLayout('choke');
  const walk = (tx: number, ty: number) => walkableIn(l, tx, ty);

  it('durch eine Mauer keine Sichtlinie, Weg führt durch den Durchgang', () => {
    expect(lineClear(10 * 32 + 16, 13 * 32 + 30, 16 * 32 + 16, 13 * 32 + 30, walk)).toBe(false);
    const path = findPath({ tx: 10, ty: 13 }, { tx: 16, ty: 13 }, walk)!;
    expect(path.at(-1)).toEqual({ tx: 16, ty: 13 });
    expect(path.some((p) => p.tx === 13 && (p.ty === 5 || p.ty === 6 || p.ty === 19 || p.ty === 20))).toBe(true);
    const w = waypoint(10 * 32 + 16, 13 * 32 + 30, 16 * 32 + 16, 13 * 32 + 30, walk)!;
    expect(w).not.toBeNull();
    expect(lineClear(10 * 32 + 16, 13 * 32 + 30, w.x, w.y, walk)).toBe(true);
  });

  it('freie Sicht → kein Umweg', () => {
    expect(waypoint(15 * 32, 12 * 32 + 30, 22 * 32, 12 * 32 + 30, walk)).toBeNull();
  });
});

describe('M25 Waffenwahl', () => {
  it('Varianten haben genau die gewählte Seltenheit, sind wiederholbar und stärker je Stufe', () => {
    for (const r of ['common', 'rare', 'epic'] as const) {
      const a = arenaWeapon(r, 5)!;
      expect(a.rarity).toBe(r);
      expect(a.base).toBe('dagger');
      expect(arenaWeapon(r, 5)).toEqual(a);
      expect(arenaWeapon(r, 15)!.bonus.attack!).toBeGreaterThan(a.bonus.attack!);
    }
    expect(arenaWeapon('none', 5)).toBeUndefined();
    expect(arenaWeapon('starter', 5)!.name).toBe('Alter Dolch');
  });

  it('Angriff folgt der Waffe wie im Spiel (finalStats)', () => {
    const none = arenaHeroStats('human', {}, undefined);
    const start = arenaHeroStats('human', {}, arenaWeapon('starter', 1));
    const epic = arenaWeapon('epic', 10)!;
    const withEpic = arenaHeroStats('human', {}, epic);
    expect(none.attack).toBe(14);
    expect(start.attack).toBe(15);
    expect(withEpic.attack).toBe(14 + epic.bonus.attack!);
    expect(withEpic.speed).toBeCloseTo(1 + (epic.bonus.speed ?? 0) / 100);
  });
});
