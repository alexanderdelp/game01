import { describe, expect, it } from 'vitest';
import { FEATURES, parseFeatures } from '../../src/game/features';
import { townStart } from '../../src/world/start';
import { WorldGen } from '../../src/world/WorldGen';

describe('M32 – Kernmodus: Schalter (R1)', () => {
  it('ohne Angabe ist alles aus (Kernmodus)', () => {
    expect([...parseFeatures('')]).toEqual([]);
    expect([...parseFeatures('?seed=x&test=1')]).toEqual([]);
  });
  it('?systeme=alle schaltet alle Systeme ein', () => {
    expect([...parseFeatures('?systeme=alle')].sort()).toEqual([...FEATURES].sort());
  });
  it('Liste schaltet nur die genannten ein, Unbekanntes wird ignoriert', () => {
    expect([...parseFeatures('?systeme=quests,%20news,unsinn')].sort()).toEqual(['news', 'quests']);
  });
});

describe('M32 – Kernmodus: Start am Ortsrand (Feedback)', () => {
  it('liegt auf einem Pfad am Rand des Orts, der dem Weltstart am nächsten ist', () => {
    const w = new WorldGen('test');
    const sp = w.findSpawn();
    const s = townStart(w, sp)!;
    const town = w.meta.settlements.find((t) => t.id === s.town)!;
    const nearest = Math.min(...w.meta.settlements.map((t) => Math.hypot(t.tx - sp.tx, t.ty - sp.ty)));
    expect(Math.hypot(town.tx - sp.tx, town.ty - sp.ty)).toBe(nearest);
    expect(w.meta.isRoad(s.tx, s.ty)).toBe(true);
    expect(w.isWalkable(s.tx, s.ty)).toBe(true);
    expect(Math.hypot(s.tx - town.tx, s.ty - town.ty)).toBeGreaterThan(town.radius);
  });
});
