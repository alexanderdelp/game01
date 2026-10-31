import { describe, expect, it } from 'vitest';
import { derive, pledgeInfluence, type WorldEvent } from '../../src/state/worldState';
import { npcsForChunk } from '../../src/world/npcs';
import { CHUNK_TILES, WorldGen } from '../../src/world/WorldGen';

const w = new WorldGen('test');
const m = w.meta;

describe('Rivalen und Schwüre (R1, R2)', () => {
  it('Rivalen sind symmetrische Paare', () => {
    for (const r of m.realms) {
      const rival = m.rivals[r.id];
      expect(rival).not.toBe(r.id);
      expect(m.rivals[rival]).toBe(r.id);
    }
    expect(new WorldGen('test').meta.rivals).toEqual(m.rivals);
  });

  it('nur der letzte Schwur eines Helden zählt; Macht verschiebt sich', () => {
    const ev: WorldEvent[] = [
      { t: 1, by: 'Ada', pid: 'a', type: 'pledge', realm: 0 },
      { t: 2, by: 'Ada', pid: 'a', type: 'pledge', realm: 1 },
      { t: 3, by: 'Bo', pid: 'b', type: 'pledge', realm: 1 },
    ];
    const d = derive(ev);
    expect(d.pledges.get('a')!.realm).toBe(1);
    const delta = pledgeInfluence(d, 6, m.rivals);
    expect(delta[1]).toBeCloseTo(0.24);
    expect(delta[m.rivals[1]]).toBeCloseTo(-0.12);
    expect(delta[0]).toBeCloseTo(m.rivals[1] === 0 ? -0.12 : 0);
  });
});

describe('Herrscher (R3)', () => {
  it('jede Hauptstadt hat einen Herrscher', () => {
    for (const s of m.settlements.filter((x) => x.capital)) {
      const npcs = npcsForChunk(w, Math.floor(s.tx / CHUNK_TILES), Math.floor(s.ty / CHUNK_TILES));
      expect(npcs.some((n) => n.role === 'ruler')).toBe(true);
    }
  });
});
