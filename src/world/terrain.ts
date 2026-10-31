/**
 * Gelände mit Höhen (M24), rein und ohne Phaser.
 *
 * - **Hang** (`Ground.s`): stufenlose Höhe in Höheneinheiten (1 Einheit = 16 px Bildhöhe), immer begehbar.
 * - **Stufe** (`levelAt`): ganzzahlig, wechselt nur im Gebirge. Ein Stufenwechsel ist eine Klippe; ihre Felswand
 *   liegt unter der Oberkante (32 px je Stufe) und ist selbst Hindernis. Auf Pfaden wird sie zur Treppe.
 */
import type { WorldGen } from './WorldGen';

/** Kantenlänge einer Geländezelle in Pixeln (Raster für Klippenkanten und Kollision). */
export const CELL = 4;
const TILE = 32;
/** Bildhöhe einer Felswand je Stufe in Pixeln. */
export const FACE_PX = 32;
/** Höhe einer Stufe in Höheneinheiten (Sichtlinie). */
export const LEVEL_UNITS = 1.5;
/** Ab dieser Höhe (über dem Meer, 0–1) beginnt das zerklüftete Gebirge mit Klippen. */
export const RUGGED_H = 0.42;
/** Stufen je Höhe (über dem Meer, 0–1) im Gebirge: bestimmt die Breite der Terrassen. */
export const TERRACE_SCALE = 12;
/** Stufe des Flachlands (das Stufenfeld ist dort konstant RUGGED_H · TERRACE_SCALE). */
export const BASE_LEVEL = Math.floor(RUGGED_H * TERRACE_SCALE);
/** Höchstens so viele Stufen bildet eine Wand ab (höhere Sprünge werden nicht länger). */
const MAX_FACE_LEVELS = 3;
/** Wie viele Zellen eine Wand höchstens nach unten reicht. */
export const FACE_CELLS = (FACE_PX * MAX_FACE_LEVELS) / CELL;

/** Zellart: frei, Felswand, Treppe/Rampe (auf Pfaden). */
export const enum CellKind {
  Free = 0,
  Wall = 1,
  Stairs = 2,
}

/** Stufe an einer Position in Kachelkoordinaten (gebrochen); Klippenkanten verwirbelt. */
export function levelAt(w: WorldGen, x: number, y: number): number {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const ax = fx - ix;
  const ay = fy - iy;
  const g00 = w.ground(ix, iy);
  const g10 = w.ground(ix + 1, iy);
  const g01 = w.ground(ix, iy + 1);
  const g11 = w.ground(ix + 1, iy + 1);
  const rug = (g00.rug * (1 - ax) + g10.rug * ax) * (1 - ay) + (g01.rug * (1 - ax) + g11.rug * ax) * ay;
  if (rug <= 0) return BASE_LEVEL;
  const r = (g00.r * (1 - ax) + g10.r * ax) * (1 - ay) + (g01.r * (1 - ax) + g11.r * ax) * ay;
  return Math.floor(r + rug * w.fine(x, y));
}

/** Gesamthöhe einer Kachel in Höheneinheiten (Hang + Stufen), für Sichtlinien. */
export function tileHeight(w: WorldGen, tx: number, ty: number): number {
  return w.ground(tx, ty).s + LEVEL_UNITS * (levelAt(w, tx + 0.5, ty + 0.5) - BASE_LEVEL);
}

/** Liegt der Weltpixel auf einer Felswand? (Pfade/Treppen werden hier nicht berücksichtigt.) */
export function wallAt(w: WorldGen, px: number, py: number): boolean {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  // Schnell: ohne Zerklüftung in der Nähe gibt es keine Wand
  let rugged = false;
  for (let dy = -3; dy <= 1 && !rugged; dy++) for (let dx = -1; dx <= 1; dx++) if (w.ground(tx + dx, ty + dy).rug > 0) rugged = true;
  if (!rugged) return false;
  const cx = (Math.floor(px / CELL) + 0.5) * CELL;
  const cy = (Math.floor(py / CELL) + 0.5) * CELL;
  const l = levelAt(w, cx / TILE, cy / TILE);
  for (let k = 1; k <= FACE_CELLS; k++) {
    const d = levelAt(w, cx / TILE, (cy - k * CELL) / TILE) - l;
    if (d > 0 && k * CELL <= FACE_PX * Math.min(MAX_FACE_LEVELS, d)) return true;
  }
  return false;
}

/** Stufen je Zelle, zwischengespeichert für edgeNear (benachbarte Dekorationen prüfen fast dieselben Zellen). */
const cellLevels = new WeakMap<WorldGen, Map<number, number>>();

/**
 * Liegt in der Umgebung eines Weltpixels eine Höhenkante (M26)? Prüft das Rechteck `rx` Pixel links/rechts,
 * `up` nach Norden und `down` nach Süden auf einen Stufenwechsel und darauf, ob eine Felswand von weiter nördlich
 * hineinreicht (Wände liegen unter ihrer Oberkante). Zellraster (4 px); ohne Zerklüftung in der Nähe sofort false.
 */
export function edgeNear(w: WorldGen, px: number, py: number, rx: number, up: number, down: number): boolean {
  const top = py - up;
  const reach = FACE_CELLS * CELL;
  const t0x = Math.floor((px - rx) / TILE) - 1;
  const t1x = Math.floor((px + rx) / TILE) + 1;
  const t0y = Math.floor((top - reach) / TILE) - 1;
  const t1y = Math.floor((py + down) / TILE) + 1;
  let rugged = false;
  for (let ty = t0y; ty <= t1y && !rugged; ty++) for (let tx = t0x; tx <= t1x; tx++) if (w.ground(tx, ty).rug > 0) { rugged = true; break; }
  if (!rugged) return false;
  // Auf dem Zellraster wie buildCells (Zellmitten), damit auch kleine Stufenzipfel erkannt werden
  let cache = cellLevels.get(w);
  if (!cache || cache.size > 400_000) cellLevels.set(w, (cache = new Map()));
  const memo = cache;
  const at = (cx: number, cy: number) => {
    const key = cx * 70_000 + cy;
    let v = memo.get(key);
    if (v === undefined) memo.set(key, (v = levelAt(w, ((cx + 0.5) * CELL) / TILE, ((cy + 0.5) * CELL) / TILE)));
    return v;
  };
  const c0x = Math.floor((px - rx) / CELL);
  const c1x = Math.floor((px + rx) / CELL);
  const c0y = Math.floor(top / CELL);
  const c1y = Math.floor((py + down) / CELL);
  const l = at(Math.floor(px / CELL), Math.floor(py / CELL));
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cy = c0y; cy <= c1y; cy++) if (at(cx, cy) !== l) return true;
    // Felswand einer höheren Stufe weiter nördlich, die bis ins Rechteck hinabreicht
    for (let k = 1; k <= FACE_CELLS; k++) {
      const d = at(cx, c0y - k) - l;
      if (d > 0) {
        if (k * CELL <= FACE_PX * Math.min(MAX_FACE_LEVELS, d)) return true;
        break;
      }
    }
  }
  return false;
}

/** Geländeraster eines Chunks: Stufe und Zellart je 4-px-Zelle, dazu Lage in der Wand fürs Zeichnen. */
export interface ChunkCells {
  /** Zellen je Kante. */
  n: number;
  level: Uint8Array;
  kind: Uint8Array;
  /** Wandzellen: Abstand zur Oberkante in Zellen (1 = direkt darunter). */
  faceK: Uint8Array;
  /** Wandzellen: Länge der Wand in Zellen. */
  faceLen: Uint8Array;
}

/** Berechnet das Geländeraster eines Chunks (`chunkTiles` Kacheln je Kante). */
export function buildCells(w: WorldGen, cx: number, cy: number, chunkTiles: number, isRoad: (tx: number, ty: number) => boolean): ChunkCells {
  const n = (chunkTiles * TILE) / CELL;
  const ox = cx * n;
  const oy = cy * n;
  const level = new Uint8Array(n * n);
  const kind = new Uint8Array(n * n);
  const faceK = new Uint8Array(n * n);
  const faceLen = new Uint8Array(n * n);
  // Zerklüftung im Chunk (inkl. Rand oben)? Sonst ist alles Flachland-Stufe.
  const t0x = cx * chunkTiles;
  const t0y = cy * chunkTiles;
  let rugged = false;
  for (let ty = t0y - 3; ty <= t0y + chunkTiles && !rugged; ty++) for (let tx = t0x - 1; tx <= t0x + chunkTiles; tx++) if (w.ground(tx, ty).rug > 0) { rugged = true; break; }
  if (!rugged) {
    level.fill(BASE_LEVEL);
    return { n, level, kind, faceK, faceLen };
  }
  // Stufen inkl. Rand: 1 Zelle links/rechts/unten, FACE_CELLS oben
  const W = n + 2;
  const top = FACE_CELLS;
  const H = n + top + 1;
  const lv = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wx = ((ox + x - 1 + 0.5) * CELL) / TILE;
      const wy = ((oy + y - top + 0.5) * CELL) / TILE;
      lv[y * W + x] = levelAt(w, wx, wy);
    }
  }
  const L = (x: number, y: number) => lv[(y + top) * W + x + 1];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const l = L(x, y);
      level[i] = l;
      for (let k = 1; k <= FACE_CELLS; k++) {
        const d = L(x, y - k) - l;
        if (d > 0) {
          const len = (FACE_PX * Math.min(MAX_FACE_LEVELS, d)) / CELL;
          if (k <= len) {
            kind[i] = CellKind.Wall;
            faceK[i] = k;
            faceLen[i] = len;
          }
          break;
        }
      }
    }
  }
  // Pfade: Wände werden zu Treppen, Stufenkanten zu Rampen
  const cellsPerTile = TILE / CELL;
  for (let ty = 0; ty < chunkTiles; ty++) {
    for (let tx = 0; tx < chunkTiles; tx++) {
      if (!isRoad(t0x + tx, t0y + ty)) continue;
      for (let y = ty * cellsPerTile; y < (ty + 1) * cellsPerTile; y++) {
        for (let x = tx * cellsPerTile; x < (tx + 1) * cellsPerTile; x++) {
          const l = L(x, y);
          if (kind[y * n + x] === CellKind.Wall || L(x - 1, y) !== l || L(x + 1, y) !== l || L(x, y - 1) !== l || L(x, y + 1) !== l) kind[y * n + x] = CellKind.Stairs;
        }
      }
    }
  }
  return { n, level, kind, faceK, faceLen };
}

/**
 * Kollision mit dem Geländeraster: blockiert, wenn die Box eine Wand berührt oder über einen Stufenwechsel reicht
 * (außer über eine Treppe). `cell` liefert Stufe und Art einer Zelle oder undefined (nicht geladen).
 */
export function cellsBlock(
  x: number, y: number, w: number, h: number,
  cell: (cx: number, cy: number) => { level: number; kind: number } | undefined,
): boolean {
  const c0x = Math.floor(x / CELL);
  const c0y = Math.floor(y / CELL);
  const c1x = Math.floor((x + w - 0.001) / CELL);
  const c1y = Math.floor((y + h - 0.001) / CELL);
  let lo = 255;
  let hi = 0;
  let stairs = false;
  for (let cy = c0y; cy <= c1y; cy++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const c = cell(cx, cy);
      if (!c) return true;
      if (c.kind === CellKind.Wall) return true;
      if (c.kind === CellKind.Stairs) stairs = true;
      lo = Math.min(lo, c.level);
      hi = Math.max(hi, c.level);
    }
  }
  return hi !== lo && !stairs;
}

/** Steilheit des Hangs an einer Kachel (Höheneinheiten je Kachel). */
export function steepness(w: WorldGen, tx: number, ty: number): number {
  const gx = w.ground(tx + 1, ty).s - w.ground(tx - 1, ty).s;
  const gy = w.ground(tx, ty + 1).s - w.ground(tx, ty - 1).s;
  return Math.hypot(gx, gy) / 2;
}

/** Tempofaktor am Hang: steile Hänge bremsen bis −35 %. */
export function slopeSpeed(steep: number): number {
  return 1 - 0.35 * Math.min(1, Math.max(0, steep - 0.3) / 1.2);
}
