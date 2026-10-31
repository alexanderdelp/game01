import { describe, expect, it } from 'vitest';
import { ExploredMap, FOG_CELL, REVEAL_RADIUS } from '../../src/world/fog';

describe('M20 – Fog of War', () => {
  it('ist anfangs leer und deckt nur im Umkreis auf', () => {
    const f = new ExploredMap();
    expect(f.fraction).toBe(0);
    const n = f.reveal(4000, 4000);
    expect(n).toBeGreaterThan(0);
    expect(f.knows(4000, 4000)).toBe(true);
    expect(f.knows(4000 + REVEAL_RADIUS + FOG_CELL * 2, 4000)).toBe(false);
    expect(f.reveal(4000, 4000)).toBe(0);
    expect(f.fresh.length).toBe(n);
  });

  it('übersteht Speichern und Laden; kaputte Daten ergeben eine leere Karte', () => {
    const f = new ExploredMap();
    f.reveal(100, 100);
    f.reveal(7000, 3000, 60);
    const g = ExploredMap.decode(f.encode());
    expect(g.knows(100, 100)).toBe(true);
    expect(g.knows(7000, 3000)).toBe(true);
    expect(g.fraction).toBeCloseTo(f.fraction);
    expect(ExploredMap.decode('%%%').fraction).toBe(0);
    expect(ExploredMap.decode(null).fraction).toBe(0);
  });

  it('bleibt am Weltrand im gültigen Bereich', () => {
    const f = new ExploredMap();
    expect(() => f.reveal(0, 0, 40)).not.toThrow();
    expect(f.isExplored(-1, 0)).toBe(false);
  });
});
