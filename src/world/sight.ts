/**
 * Sicht über Höhen (M24), rein und ohne Phaser. Höhen in Höheneinheiten je Kachel (`tileHeight`).
 * Eine Kachel ist sichtbar, wenn die Linie von Augenhöhe zur Kachel nirgends unter dem Gelände verläuft.
 */

/** Augenhöhe über dem Boden (Höheneinheiten). */
export const EYE = 2;
/** Sichtweite auf gleicher Höhe (Kacheln) – wie bisher beim Fog of War. */
export const VIEW_RANGE = 20;
/** Zusätzliche Sichtweite je Höheneinheit Vorsprung und Obergrenze. */
const RANGE_PER_UNIT = 1.5;
export const MAX_VIEW = 50;
/** Toleranz gegen Rundungsrauschen der Höhen. */
const TOLERANCE = 0.3;

export type HeightFn = (tx: number, ty: number) => number;

/** Freie Sichtlinie von (ox, oy) zur Kachel (tx, ty)? */
export function lineOfSight(h: HeightFn, ox: number, oy: number, tx: number, ty: number): boolean {
  const dx = tx - ox;
  const dy = ty - oy;
  const n = Math.ceil(Math.hypot(dx, dy) * 2);
  if (n <= 2) return true;
  const eye = h(ox, oy) + EYE;
  const target = h(tx, ty) + 0.5;
  for (let s = 1; s < n; s++) {
    const f = s / n;
    const sx = Math.round(ox + dx * f);
    const sy = Math.round(oy + dy * f);
    if ((sx === tx && sy === ty) || (sx === ox && sy === oy)) continue;
    if (h(sx, sy) > eye + (target - eye) * f + TOLERANCE) return false;
  }
  return true;
}

/** Sichtweite zu einer Kachel: von oben sieht man weiter. */
export function viewRange(h: HeightFn, ox: number, oy: number, tx: number, ty: number): number {
  return Math.min(MAX_VIEW, VIEW_RANGE + RANGE_PER_UNIT * Math.max(0, h(ox, oy) - h(tx, ty)));
}

/** Sieht man die Kachel (Sichtweite und Sichtlinie)? */
export function sees(h: HeightFn, ox: number, oy: number, tx: number, ty: number): boolean {
  return Math.hypot(tx - ox, ty - oy) <= viewRange(h, ox, oy, tx, ty) && lineOfSight(h, ox, oy, tx, ty);
}

/**
 * Sichtfeld im Umkreis `r` um (ox, oy): 1 = sichtbar, zeilenweise (2r+1)².
 * Höhen werden einmal in ein Raster gelesen, damit die Strahlen billig sind.
 */
export function viewshed(h: HeightFn, ox: number, oy: number, r: number): Uint8Array {
  const n = 2 * r + 1;
  const grid = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) grid[y * n + x] = h(ox - r + x, oy - r + y);
  const g: HeightFn = (tx, ty) => grid[(ty - oy + r) * n + (tx - ox + r)];
  const out = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[y * n + x] = lineOfSight(g, ox, oy, ox - r + x, oy - r + y) ? 1 : 0;
  return out;
}
