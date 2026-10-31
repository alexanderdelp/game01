import { describe, expect, it } from 'vitest';
import { enemiesForChunk } from '../../src/combat/enemies';
import {
  DAY_MS, EPOCH, TICK_MS, caravanPos, caravans, clockText, daylight, invasionAt, newsBetween, realmPower, timeOfDay, townDrift, weatherAt,
} from '../../src/sim/simulation';
import { B, BIOMES } from '../../src/world/biomes';
import { WorldGen } from '../../src/world/WorldGen';

const w = new WorldGen('test');
const m = w.meta;
const T = EPOCH + 1000 * DAY_MS;
const REAL_DAY = 24 * TICK_MS;

describe('Zeit, Tag & Nacht, Wetter (R1, R2)', () => {
  it('Tageszeit und Licht', () => {
    expect(timeOfDay(EPOCH)).toBe(0);
    expect(clockText(EPOCH + DAY_MS / 2)).toBe('12:00');
    expect(daylight(EPOCH + DAY_MS / 2)).toBe(1);
    expect(daylight(EPOCH)).toBe(0);
  });

  it('Wetter ist deterministisch und wechselt über Stunden', () => {
    expect(weatherAt(1, 2, T, B.Grassland)).toBe(weatherAt(1, 2, T, B.Grassland));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => weatherAt(1, 0, T + i * TICK_MS, B.Grassland)));
    expect(seen.size).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 100; i++) expect(weatherAt(1, 0, T + i * TICK_MS, B.Desert)).not.toBe('regen');
  });
});

describe('Karawanen (R3)', () => {
  const cars = caravans(m, (x, y) => w.biomeAt(x, y), w.seed);

  it('es gibt Karawanen zwischen verschiedenen Orten über Land', () => {
    expect(cars.length).toBeGreaterThanOrEqual(2);
    for (const c of cars) {
      expect(c.from.id).not.toBe(c.to.id);
      let land = 0;
      for (let i = 0; i <= 20; i++) {
        const p = caravanPos(c, T + (i / 20) * c.legMs * 2.2);
        if (BIOMES[w.biomeAt(Math.round(p.tx), Math.round(p.ty - 3))].walkable) land++;
      }
      expect(land).toBeGreaterThanOrEqual(18);
    }
  });

  it('bewegen sich mit der Zeit und erreichen ihr Ziel', () => {
    const c = cars[0];
    const a = caravanPos(c, T);
    const b = caravanPos(c, T + 60_000);
    expect(a).toEqual(caravanPos(c, T));
    expect(Math.hypot(a.tx - b.tx, a.ty - b.ty)).toBeGreaterThan(0);
    const arrivals = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const p = caravanPos(c, T + (i / 400) * c.legMs * 2.2);
      if (p.at) arrivals.add(p.at.id);
    }
    expect(arrivals).toEqual(new Set([c.from.id, c.to.id]));
  });
});

describe('Reichsmacht, Wohlstand, Invasion (R4, R5)', () => {
  it('Macht schwankt und verschiebt Grenzen; Ansehen hilft', () => {
    const p = Array.from({ length: 30 }, (_, i) => realmPower(w.seed, 0, T + i * REAL_DAY * 3));
    expect(Math.max(...p) - Math.min(...p)).toBeGreaterThan(0.1);
    expect(realmPower(w.seed, 0, T, 100)).toBeGreaterThan(realmPower(w.seed, 0, T, 0));
    // Grenzen: starke Macht eines Reichs vergrößert sein Gebiet
    const count = (powers: number[] | null) => {
      m.powers = powers;
      let n = 0;
      for (let y = 300; y < 3800; y += 61) for (let x = 300; x < 3800; x += 61) if (m.realmAt(x, y).id === 0) n++;
      return n;
    };
    const base = count(null);
    const strong = count([1.5, 1, 1, 1, 1, 1]);
    m.powers = null;
    expect(strong).toBeGreaterThan(base);
  });

  it('Wohlstand schwankt im Bereich −2..3', () => {
    const vals = Array.from({ length: 100 }, (_, i) => townDrift(w.seed, 3, T + i * REAL_DAY));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(-2);
    expect(Math.max(...vals)).toBeLessThanOrEqual(3);
    expect(new Set(vals).size).toBeGreaterThan(2);
  });

  it('Invasion erhöht die Gegnerdichte im Reich', () => {
    let tick = T;
    let inv = invasionAt(w.seed, m.realms, tick);
    while (!inv) inv = invasionAt(w.seed, m.realms, (tick += TICK_MS));
    const spawn = w.findSpawn();
    let normal = 0;
    let invaded = 0;
    for (let cy = 120; cy < 400; cy += 3) {
      for (let cx = 120; cx < 400; cx += 3) {
        if (m.realmAt(cx * 16 + 8, cy * 16 + 8).id !== inv.realm) continue;
        normal += enemiesForChunk(w, cx, cy, spawn).length;
        const e = enemiesForChunk(w, cx, cy, spawn, inv);
        invaded += e.length;
      }
    }
    expect(invaded).toBeGreaterThan(normal);
  });
});

describe('Neuigkeiten (R6)', () => {
  it('liefert Ereignisse für verpasste Stunden, deterministisch', () => {
    const cars = caravans(m, (x, y) => w.biomeAt(x, y), w.seed);
    const n = newsBetween(m, w.seed, T, T + 12 * TICK_MS, cars);
    expect(n.length).toBeGreaterThan(3);
    expect(newsBetween(m, w.seed, T, T + 12 * TICK_MS, cars)).toEqual(n);
    expect(newsBetween(m, w.seed, T, T + 500 * TICK_MS, cars).every((x) => x.tick > Math.floor((T - EPOCH) / TICK_MS) + 476)).toBe(true);
  });
});
