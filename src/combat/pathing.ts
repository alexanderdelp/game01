/** Wegfindung für Gegner am Boden (M25): um Hindernisse herum statt an der Wand hängen. Rein, ohne Phaser. */

const TILE = 32;

/** Ist die Strecke zwischen zwei Pixelpunkten frei (alle berührten Kacheln begehbar, mit halber Körperbreite)? */
export function lineClear(ax: number, ay: number, bx: number, by: number, walkable: (tx: number, ty: number) => boolean, half = 7): boolean {
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(len / 8));
  // Seitlicher Versatz quer zur Strecke: der Körper ist breiter als eine Linie
  const nx = len ? (-(by - ay) / len) * half : 0;
  const ny = len ? ((bx - ax) / len) * half : 0;
  for (let i = 0; i <= steps; i++) {
    const x = ax + ((bx - ax) * i) / steps;
    const y = ay + ((by - ay) * i) / steps;
    for (const o of [-1, 0, 1]) if (!walkable(Math.floor((x + nx * o) / TILE), Math.floor((y - 3 + ny * o) / TILE))) return false;
  }
  return true;
}

/**
 * Kürzester Kachelweg (Breitensuche, 8 Richtungen ohne Ecken-Abkürzen) von `from` nach `to`; höchstens `maxNodes`
 * Kacheln werden besucht. Ergebnis ohne Startkachel, `null`, wenn kein Weg gefunden wurde.
 */
export function findPath(from: { tx: number; ty: number }, to: { tx: number; ty: number }, walkable: (tx: number, ty: number) => boolean, maxNodes = 900): { tx: number; ty: number }[] | null {
  const key = (x: number, y: number) => `${x},${y}`;
  const prev = new Map<string, string | null>([[key(from.tx, from.ty), null]]);
  const queue: [number, number][] = [[from.tx, from.ty]];
  const goal = key(to.tx, to.ty);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let head = 0; head < queue.length && prev.size < maxNodes; head++) {
    const [x, y] = queue[head];
    if (key(x, y) === goal) break;
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (prev.has(k) || !walkable(nx, ny)) continue;
      if (dx && dy && (!walkable(x + dx, y) || !walkable(x, y + dy))) continue;
      prev.set(k, key(x, y));
      queue.push([nx, ny]);
    }
  }
  if (!prev.has(goal)) return null;
  const path: { tx: number; ty: number }[] = [];
  for (let k: string | null = goal; k && k !== key(from.tx, from.ty); k = prev.get(k) ?? null) {
    const [tx, ty] = k.split(',').map(Number);
    path.unshift({ tx, ty });
  }
  return path;
}

/**
 * Nächster Zwischenpunkt (Pixel, Fußpunkt) auf dem Weg von (x, y) zum Ziel: die am weitesten entfernte Wegkachel,
 * die noch in gerader Linie erreichbar ist. `null` = direkter Weg frei oder kein Weg bekannt.
 */
export function waypoint(x: number, y: number, goalX: number, goalY: number, walkable: (tx: number, ty: number) => boolean, maxNodes = 900): { x: number; y: number } | null {
  if (lineClear(x, y, goalX, goalY, walkable)) return null;
  const tile = (px: number, py: number) => ({ tx: Math.floor(px / TILE), ty: Math.floor((py - 3) / TILE) });
  const path = findPath(tile(x, y), tile(goalX, goalY), walkable, maxNodes);
  if (!path?.length) return null;
  const center = (p: { tx: number; ty: number }) => ({ x: p.tx * TILE + TILE / 2, y: p.ty * TILE + TILE - 6 });
  let best = center(path[0]);
  for (const p of path) {
    const c = center(p);
    if (!lineClear(x, y, c.x, c.y, walkable)) break;
    best = c;
  }
  return best;
}
