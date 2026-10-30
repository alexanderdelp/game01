/** Achsenparallele Box in Pixeln (linke obere Ecke + Größe). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Bewegt eine Box achsenweise und bricht die Bewegung pro Achse ab, wenn sie blockiert wäre.
 * Dadurch gleitet man an Hindernissen entlang statt hängenzubleiben.
 * Große Schritte werden unterteilt, damit nichts durchtunnelt.
 */
export function moveBox(box: Box, dx: number, dy: number, blocked: (b: Box) => boolean): Box {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  let cur = { ...box };
  for (let i = 0; i < steps; i++) {
    const nx = { ...cur, x: cur.x + dx / steps };
    if (!blocked(nx)) cur = nx;
    const ny = { ...cur, y: cur.y + dy / steps };
    if (!blocked(ny)) cur = ny;
  }
  return cur;
}

export type Facing = 'up' | 'left' | 'down' | 'right';

/** Blickrichtung aus einer Bewegungsrichtung; bei Diagonalen gewinnt die horizontale Achse nur, wenn sie dominiert. */
export function facingFrom(dx: number, dy: number, previous: Facing): Facing {
  if (dx === 0 && dy === 0) return previous;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}
