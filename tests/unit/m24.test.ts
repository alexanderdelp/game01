import { describe, expect, it } from 'vitest';
import { B } from '../../src/world/biomes';
import { ExploredMap, FOG_CELL } from '../../src/world/fog';
import { MAX_VIEW, VIEW_RANGE, lineOfSight, sees, viewRange, viewshed, type HeightFn } from '../../src/world/sight';
import { BASE_LEVEL, CellKind, buildCells, cellsBlock, levelAt, steepness, tileHeight, wallAt } from '../../src/world/terrain';
import { WorldGen } from '../../src/world/WorldGen';

const w = new WorldGen('test');

/** Stichprobe über das Land: Kacheln je Biom. */
function sample(step = 53): Map<B, { tx: number; ty: number }[]> {
  const m = new Map<B, { tx: number; ty: number }[]>();
  for (let ty = 300; ty < 7900; ty += step) {
    for (let tx = 300; tx < 7900; tx += step) {
      const b = w.baseBiomeAt(tx, ty);
      if (!m.has(b)) m.set(b, []);
      m.get(b)!.push({ tx, ty });
    }
  }
  return m;
}
const biomes = sample();

describe('M24 – Höhen (R1, R2)', () => {
  it('Höhen sind deterministisch aus dem Seed', () => {
    const v = new WorldGen('test');
    for (const [tx, ty] of [[4000, 4100], [4112, 4102], [1234, 5678]]) {
      expect(tileHeight(v, tx, ty)).toBe(tileHeight(w, tx, ty));
    }
  });

  it('Hügelland und Seen kommen vor', () => {
    expect(biomes.get(B.Hills)?.length ?? 0).toBeGreaterThan(200);
    expect(biomes.get(B.Lake)?.length ?? 0).toBeGreaterThan(20);
  });

  it('ein See liegt in einer Senke (Ufer höher als die Mitte)', () => {
    const lakes = biomes.get(B.Lake)!;
    let lower = 0;
    for (const { tx, ty } of lakes.slice(0, 40)) {
      const mid = w.ground(tx, ty).s;
      // nächstes Land in 4 Richtungen
      const shore: number[] = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let k = 1;
        while (k < 200 && w.baseBiomeAt(tx + dx * k, ty + dy * k) === B.Lake) k++;
        shore.push(w.ground(tx + dx * k, ty + dy * k).s);
      }
      if (Math.min(...shore) > mid) lower++;
    }
    expect(lower / Math.min(40, lakes.length)).toBeGreaterThan(0.8);
  });

  it('Klippen nur im Gebirge: Flach- und Hügelland haben die Grundstufe und keine Wände', () => {
    for (const b of [B.Grassland, B.Forest, B.Hills, B.Savanna, B.Desert]) {
      for (const { tx, ty } of (biomes.get(b) ?? []).slice(0, 150)) {
        expect(levelAt(w, tx + 0.5, ty + 0.5)).toBe(BASE_LEVEL);
        expect(wallAt(w, tx * 32 + 16, ty * 32 + 16)).toBe(false);
      }
    }
  });

  it('im Gebirge gibt es Stufen und Felswände', () => {
    const levels = new Set<number>();
    let walls = 0;
    for (const { tx, ty } of biomes.get(B.Mountain)!.slice(0, 300)) {
      levels.add(levelAt(w, tx + 0.5, ty + 0.5));
      if (wallAt(w, tx * 32 + 16, ty * 32 + 16)) walls++;
    }
    expect(levels.size).toBeGreaterThan(3);
    expect(walls).toBeGreaterThan(5);
  });

  it('Hügelland hat spürbare, aber begehbare Hänge', () => {
    const steep = biomes.get(B.Hills)!.map(({ tx, ty }) => steepness(w, tx, ty)).sort((a, b) => a - b);
    expect(steep[Math.floor(steep.length * 0.9)]).toBeGreaterThan(0.4);
    const flat = biomes.get(B.Grassland)!.map(({ tx, ty }) => steepness(w, tx, ty)).sort((a, b) => a - b);
    expect(flat[Math.floor(flat.length * 0.5)]).toBeLessThan(steep[Math.floor(steep.length * 0.5)]);
  });

  it('Wände im Chunk-Raster stimmen mit der Einzelabfrage überein', () => {
    const { tx, ty } = biomes.get(B.Mountain)![10];
    const cx = Math.floor(tx / 16);
    const cy = Math.floor(ty / 16);
    const cells = buildCells(w, cx, cy, 16, () => false);
    let checked = 0;
    for (let i = 0; i < cells.kind.length; i += 97) {
      const x = cx * 512 + (i % cells.n) * 4 + 2;
      const y = cy * 512 + Math.floor(i / cells.n) * 4 + 2;
      expect(cells.kind[i] === CellKind.Wall).toBe(wallAt(w, x, y));
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('M24 – Klippen und Treppen (R3)', () => {
  // Raster: links Stufe 4, rechts Stufe 5; Spalte 10 ist auf Wunsch eine Treppe, Zeile 20 eine Wand
  const grid = (stairs: boolean) => (cx: number, cy: number) => ({
    level: cx < 10 ? 4 : 5,
    kind: cy === 20 ? CellKind.Wall : stairs && (cx === 9 || cx === 10) ? CellKind.Stairs : CellKind.Free,
  });

  it('eine Stufenkante kann man nicht überqueren', () => {
    expect(cellsBlock(4 * 4, 0, 16, 8, grid(false))).toBe(false);
    expect(cellsBlock(9 * 4, 0, 16, 8, grid(false))).toBe(true);
  });

  it('über eine Treppe schon', () => {
    expect(cellsBlock(9 * 4, 0, 16, 8, grid(true))).toBe(false);
  });

  it('eine Felswand blockiert immer', () => {
    expect(cellsBlock(0, 19 * 4, 16, 8, grid(true))).toBe(true);
  });

  it('nicht geladenes Gelände blockiert', () => {
    expect(cellsBlock(0, 0, 16, 8, () => undefined)).toBe(true);
  });
});

describe('M24 – Sicht (R4, R5)', () => {
  const flat: HeightFn = () => 0;
  /** Ein Hügelkamm der Höhe 4 bei x = 10. */
  const ridge: HeightFn = (x) => (x === 10 || x === 11 ? 4 : 0);

  it('auf ebenem Land ist alles frei', () => {
    expect(lineOfSight(flat, 0, 0, 19, 7)).toBe(true);
    expect(sees(flat, 0, 0, VIEW_RANGE - 1, 0)).toBe(true);
    expect(sees(flat, 0, 0, VIEW_RANGE + 3, 0)).toBe(false);
  });

  it('hinter einem Hügel ist es verdeckt, davor und auf dem Kamm nicht', () => {
    expect(lineOfSight(ridge, 0, 0, 16, 0)).toBe(false);
    expect(lineOfSight(ridge, 0, 0, 8, 0)).toBe(true);
    expect(lineOfSight(ridge, 0, 0, 10, 0)).toBe(true);
  });

  it('von oben sieht man über den Hügel und weiter', () => {
    const peak: HeightFn = (x) => (x === 0 ? 8 : x === 10 ? 4 : 0);
    expect(lineOfSight(peak, 0, 0, 16, 0)).toBe(true);
    expect(viewRange(peak, 0, 0, 30, 0)).toBeGreaterThan(VIEW_RANGE);
    expect(viewRange(() => 0, 0, 0, 30, 0)).toBe(VIEW_RANGE);
  });

  it('das Sichtfeld markiert genau die verdeckten Kacheln', () => {
    const v = viewshed(ridge, 0, 0, 15);
    const at = (x: number, y: number) => v[(y + 15) * 31 + (x + 15)];
    expect(at(5, 0)).toBe(1);
    expect(at(14, 0)).toBe(0);
    expect(at(-14, 0)).toBe(1);
  });

  it('der Fog of War deckt nur Sichtbares auf', () => {
    const f = new ExploredMap();
    const tx = 4000;
    const ty = 4000;
    // Mauer östlich: nur nach Westen frei
    f.revealVisible(tx, ty, (x) => x <= tx + 4, MAX_VIEW);
    expect(f.knows(tx, ty)).toBe(true);
    expect(f.knows(tx - 2 * FOG_CELL, ty)).toBe(true);
    expect(f.knows(tx + 2 * FOG_CELL, ty)).toBe(false);
  });
});
