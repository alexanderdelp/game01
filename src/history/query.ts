/** Abfragen über eine fertige Vorgeschichte (Zustand in einem Jahr, Grenzen). Rein. */
import { HISTORY_CELL, HISTORY_GRID, INHABITED, type History, type Site } from './types';

/** Besitzer eines Ortes in einem Jahr (−1 = niemand). */
export function ownerAt(s: Site, y: number): number {
  let civ = -1;
  for (const o of s.owners) if (o.y <= y) civ = o.civ;
  return civ;
}

/** Besteht der Ort in diesem Jahr (gegründet, nicht zerstört)? */
export function existsAt(s: Site, y: number): boolean {
  return s.founded <= y && (s.destroyed === undefined || s.destroyed > y);
}

/** Einflussradius eines Ortes in Zellen (Grenzen in Simulation und Karte). */
export function reach(s: Site): number {
  return s.kind === 'city' ? 6 : s.kind === 'village' ? 4 : 3;
}

/** Reichsgrenzen in einem Jahr: Reich je Zelle (−1 = niemand). Wie `Sim.recomputeOwner`. */
export function territory(h: History, y: number): Int16Array {
  const N = HISTORY_GRID;
  const owner = new Int16Array(N * N).fill(-1);
  const best = new Float32Array(N * N).fill(1e9);
  for (const s of h.sites) {
    if (!INHABITED.has(s.kind) || !existsAt(s, y)) continue;
    const civ = ownerAt(s, y);
    if (civ < 0) continue;
    const cx = Math.floor(s.tx / HISTORY_CELL);
    const cy = Math.floor(s.ty / HISTORY_CELL);
    const r = reach(s);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const yy = cy + dy;
      const d = dx * dx + dy * dy;
      if (x < 0 || yy < 0 || x >= N || yy >= N || d > r * r || !h.cells[yy * N + x].land) continue;
      const i = yy * N + x;
      const w = d / r;
      if (w < best[i]) {
        best[i] = w;
        owner[i] = civ;
      }
    }
  }
  return owner;
}

/** Reiche, die in einem Jahr bestehen. */
export function civsAt(h: History, y: number): number[] {
  return h.civs.filter((c) => c.founded <= y && (c.fell === undefined || c.fell > y)).map((c) => c.id);
}

/** Bewohnte Orte am Ende. */
export function livingSites(h: History): Site[] {
  return h.sites.filter((s) => INHABITED.has(s.kind) && s.destroyed === undefined);
}
