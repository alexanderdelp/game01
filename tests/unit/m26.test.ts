import { describe, expect, it } from 'vitest';
import { B } from '../../src/world/biomes';
import { edgeNear, levelAt, wallAt } from '../../src/world/terrain';
import { WorldGen } from '../../src/world/WorldGen';

const w = new WorldGen('test');
const SOLID = new Set(['oak', 'youngoak', 'pine', 'youngpine', 'snowpine', 'palm', 'deadtree', 'cactus', 'bush', 'rock', 'boulder']);

/** Zerklüftete Gebirgskacheln (Stichprobe über die Welt). */
function rugged(step: number): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  for (let ty = 300; ty < 7900; ty += step) {
    for (let tx = 300; tx < 7900; tx += step) {
      const b = w.baseBiomeAt(tx, ty);
      if ((b === B.Mountain || b === B.Snow || b === B.Tundra) && w.ground(tx, ty).rug > 0) out.push({ tx, ty });
    }
  }
  return out;
}

describe('M26 – saubere Höhenkanten', () => {
  it('R1: kein Baum, Busch, Fels auf oder unmittelbar an Stufenkante, Felswand oder Treppe', () => {
    const spots = rugged(97);
    expect(spots.length).toBeGreaterThan(60);
    let checked = 0;
    for (const s of spots) {
      // kleiner Block um jede Stichprobe
      for (let ty = s.ty; ty < s.ty + 8; ty++) {
        for (let tx = s.tx; tx < s.tx + 8; tx++) {
          const d = w.decorationAt(tx, ty);
          if (!d || !SOLID.has(d.kind)) continue;
          checked++;
          // Fußpunkt-Umgebung (eine Kachel breit, nach Norden mehr) feiner als die Prüfung im Generator
          const fx = tx * 32 + 16;
          const fy = ty * 32 + 28;
          const l = levelAt(w, fx / 32, fy / 32);
          for (let y = fy - 28; y <= fy + 12; y += 4) {
            for (let x = fx - 20; x <= fx + 20; x += 4) {
              expect(levelAt(w, x / 32, y / 32), `${d.kind} @ ${tx},${ty}`).toBe(l);
              expect(wallAt(w, x, y), `${d.kind} @ ${tx},${ty} Wand`).toBe(false);
            }
          }
          // Treppen liegen nur auf Pfaden
          expect(w.meta.isRoad(tx, ty)).toBe(false);
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  it('R1: Gebirge behält Dekor (nicht alles weggeräumt)', () => {
    let n = 0;
    let tiles = 0;
    for (const s of rugged(211)) {
      for (let ty = s.ty; ty < s.ty + 8; ty++) for (let tx = s.tx; tx < s.tx + 8; tx++, tiles++) if (w.decorationAt(tx, ty)) n++;
    }
    expect(n / tiles).toBeGreaterThan(0.045);
  });

  it('R3: im Flachland gibt es keine Kanten – Dekor dort unverändert', () => {
    for (let ty = 300; ty < 7900; ty += 211) {
      for (let tx = 300; tx < 7900; tx += 211) {
        const b = w.baseBiomeAt(tx, ty);
        if (b !== B.Grassland && b !== B.Forest && b !== B.Hills && b !== B.Desert) continue;
        if (w.ground(tx, ty).rug > 0) continue;
        expect(edgeNear(w, tx * 32 + 16, ty * 32 + 28, 32, 56, 32)).toBe(false);
      }
    }
  });
});
