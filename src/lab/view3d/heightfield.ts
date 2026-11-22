/**
 * Höhenfeld eines Chunks für die Perspektive (M33 Laborphase 2), rein und ohne Phaser.
 *
 * Höhe je Geländezelle (4 px) in Höheneinheiten: Hang (`ground.s`, zwischen Kachelmitten weich) plus Stufen.
 * Die in der Draufsicht gemalte Felswand liegt unter der Oberkante auf der tieferen Stufe. Hier wird sie zur
 * steilen Rampe von der Unterkante bis zur Oberkante, damit das gemalte Felsbild auf der Wand sitzt.
 */
import { BASE_LEVEL, CELL, FACE_CELLS, FACE_PX, LEVEL_UNITS, levelAt } from '../../world/terrain';
import type { WorldGen } from '../../world/WorldGen';
import { CHUNK_TILES } from '../../world/WorldGen';

const TILE = 32;
/** Zellen je Chunk-Kante */
export const HF_CELLS = (CHUNK_TILES * TILE) / CELL;
const PER_TILE = TILE / CELL;

/**
 * Höhen (Einheiten) aller Zellen eines Chunks, zeilenweise. `levels` = Stufen je Zelle aus dem Chunk-Worker
 * (fehlen sie, werden sie berechnet).
 */
export function chunkHeights(w: WorldGen, cx: number, cy: number, levels?: Uint8Array): Float32Array {
  const n = HF_CELLS;
  const out = new Float32Array(n * n);
  // Hang je Kachel inkl. Rand (für weiche Übergänge zwischen Kachelmitten)
  const t0x = cx * CHUNK_TILES - 1;
  const t0y = cy * CHUNK_TILES - 1;
  const T = CHUNK_TILES + 2;
  const s = new Float32Array(T * T);
  let rugged = false;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const g = w.ground(t0x + x, t0y + y);
      s[y * T + x] = g.s;
      if (g.rug > 0) rugged = true;
    }
  const ox = cx * n;
  const oy = cy * n;
  const lv = (x: number, y: number): number => {
    if (levels && x >= 0 && y >= 0 && x < n && y < n) return levels[y * n + x];
    return levelAt(w, ((ox + x + 0.5) * CELL) / TILE, ((oy + y + 0.5) * CELL) / TILE);
  };
  // Stufen oberhalb des Chunks (für Wände, die von Norden hereinreichen) nur bei Zerklüftung
  const north = new Map<number, number>();
  const level = (x: number, y: number): number => {
    if (y >= 0) return lv(x, y);
    const k = y * 1000 + x;
    let v = north.get(k);
    if (v === undefined) north.set(k, (v = lv(x, y)));
    return v;
  };
  for (let y = 0; y < n; y++) {
    // Zellmitte in Kachelkoordinaten relativ zur ersten Randkachel; Kachelmitte bei +0,5
    const fy = (y + 0.5) / PER_TILE + 1 - 0.5;
    const iy = Math.floor(fy);
    const ay = fy - iy;
    for (let x = 0; x < n; x++) {
      const fx = (x + 0.5) / PER_TILE + 1 - 0.5;
      const ix = Math.floor(fx);
      const ax = fx - ix;
      const slope = (s[iy * T + ix] * (1 - ax) + s[iy * T + ix + 1] * ax) * (1 - ay) + (s[(iy + 1) * T + ix] * (1 - ax) + s[(iy + 1) * T + ix + 1] * ax) * ay;
      if (!rugged) {
        out[y * n + x] = slope;
        continue;
      }
      const l = level(x, y);
      let h = slope + LEVEL_UNITS * (l - BASE_LEVEL);
      // Felswand einer höheren Stufe weiter nördlich? (wie `wallAt`: erste abweichende Stufe entscheidet)
      for (let k = 1; k <= FACE_CELLS; k++) {
        const d = level(x, y - k) - l;
        if (d === 0) continue;
        if (d > 0) {
          const len = (FACE_PX * Math.min(3, d)) / CELL;
          if (k <= len) h += LEVEL_UNITS * d * (1 - (k - 0.5) / len);
        }
        break;
      }
      out[y * n + x] = h;
    }
  }
  return out;
}

/** Bilineare Höhe (Einheiten) an einem Weltpixel aus den Zellhöhen eines Chunks (Zellmitten, am Rand geklemmt). */
export function sampleChunk(hs: Float32Array, lx: number, ly: number): number {
  const n = HF_CELLS;
  const fx = Math.min(n - 1, Math.max(0, lx / CELL - 0.5));
  const fy = Math.min(n - 1, Math.max(0, ly / CELL - 0.5));
  const ix = Math.min(n - 2, Math.floor(fx));
  const iy = Math.min(n - 2, Math.floor(fy));
  const ax = fx - ix;
  const ay = fy - iy;
  const i = iy * n + ix;
  return (hs[i] * (1 - ax) + hs[i + 1] * ax) * (1 - ay) + (hs[i + n] * (1 - ax) + hs[i + n + 1] * ax) * ay;
}
