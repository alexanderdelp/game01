/**
 * Gelände-Aufbauten der Kampf-Arena (M25) als reine Daten: ein Kachelraster (Boden, Mauer, Wasser, Sumpf) und
 * Dekor-Hindernisse (Bäume, Felsen) mit Kollisionsbox. Daraus folgen `blocked`, `isWalkable` und `speedAt` –
 * die Gegner-KI braucht keine Sonderfälle. Ohne Phaser, damit per Unit-Test prüfbar.
 */
import { DECOR_BLOCK, type DecorKind } from '../world/biomes';
import { overlaps, type Box } from '../world/collision';
import { mulberry32 } from '../world/rng';

const T = 32;
/** Größe der Arena in Kacheln (Rand = Mauer). */
export const ARENA_W = 40;
export const ARENA_H = 26;
/** Startkachel des Helden (Mitte). */
export const HERO_TILE = { tx: ARENA_W / 2, ty: ARENA_H / 2 };

export const Cell = { Floor: 0, Wall: 1, Water: 2, Mud: 3 } as const;
export type Cell = (typeof Cell)[keyof typeof Cell];
/** Tempo-Faktor auf Sumpfboden. */
export const MUD_SPEED = 0.55;

export type LayoutId = 'open' | 'pillars' | 'forest' | 'choke' | 'swamp';
export const LAYOUTS: { id: LayoutId; name: string }[] = [
  { id: 'open', name: 'Offen' },
  { id: 'pillars', name: 'Säulen' },
  { id: 'forest', name: 'Wald & Felsen' },
  { id: 'choke', name: 'Engpässe' },
  { id: 'swamp', name: 'Sumpf' },
];

/** Ein Dekor-Objekt: Grafik `<kind>:<v>` im Dekor-Atlas, Fußpunkt (x, y) in Pixeln, Kollisionsbox (falls fest). */
export interface Prop {
  frame: string;
  x: number;
  y: number;
  box?: Box;
  flip?: boolean;
}

export interface ArenaLayout {
  id: LayoutId;
  cells: Uint8Array;
  props: Prop[];
  /** Kacheln, die ein Dekor-Hindernis belegt (für die Wegfindung). */
  propTiles: Set<number>;
}

const idx = (tx: number, ty: number) => ty * ARENA_W + tx;

export function cellAt(l: ArenaLayout, tx: number, ty: number): Cell {
  if (tx < 0 || ty < 0 || tx >= ARENA_W || ty >= ARENA_H) return Cell.Wall;
  return l.cells[idx(tx, ty)] as Cell;
}

const solid = (c: Cell) => c === Cell.Wall || c === Cell.Water;

/** Box stößt an Mauer, Wasser oder ein Dekor-Hindernis? */
export function blockedIn(l: ArenaLayout, b: Box): boolean {
  for (let ty = Math.floor(b.y / T); ty <= Math.floor((b.y + b.h - 0.01) / T); ty++)
    for (let tx = Math.floor(b.x / T); tx <= Math.floor((b.x + b.w - 0.01) / T); tx++) if (solid(cellAt(l, tx, ty))) return true;
  return l.props.some((p) => p.box && overlaps(b, p.box));
}

/** Kachel frei für Wegfindung und Erscheinen? */
export function walkableIn(l: ArenaLayout, tx: number, ty: number): boolean {
  return !solid(cellAt(l, tx, ty)) && !l.propTiles.has(idx(tx, ty));
}

/** Geschwindigkeitsfaktor an einer Pixelposition (Sumpf bremst). */
export function speedIn(l: ArenaLayout, x: number, y: number): number {
  return cellAt(l, Math.floor(x / T), Math.floor(y / T)) === Cell.Mud ? MUD_SPEED : 1;
}

/** Erzeugt einen Aufbau. Immer gleich (fester Zufall), damit man Situationen wiederholen kann. */
export function buildLayout(id: LayoutId): ArenaLayout {
  const cells = new Uint8Array(ARENA_W * ARENA_H);
  const l: ArenaLayout = { id, cells, props: [], propTiles: new Set() };
  const set = (tx: number, ty: number, c: Cell) => tx >= 0 && ty >= 0 && tx < ARENA_W && ty < ARENA_H && (cells[idx(tx, ty)] = c);
  const rect = (x0: number, y0: number, w: number, h: number, c: Cell) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c);
  };
  const blob = (cx: number, cy: number, rx: number, ry: number, c: Cell, rnd: () => number) => {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d < 0.85 + rnd() * 0.3) set(x, y, c);
      }
  };
  const nearHero = (tx: number, ty: number, r: number) => Math.abs(tx - HERO_TILE.tx) <= r && Math.abs(ty - HERO_TILE.ty) <= r;
  const prop = (kind: DecorKind, tx: number, ty: number, v: number, jitter = 0) => {
    const x = tx * T + T / 2 + jitter;
    const y = ty * T + T - 4;
    const size = DECOR_BLOCK[kind];
    l.props.push({ frame: `${kind}:${v % 4}`, x, y, flip: v % 2 === 1, box: size && { x: x - size.w / 2, y: y - size.h, w: size.w, h: size.h } });
    if (size) l.propTiles.add(idx(tx, ty));
  };

  switch (id) {
    case 'pillars':
      for (const [tx, ty] of [[10, 7], [29, 7], [10, 18], [29, 18], [20, 5], [20, 20], [15, 13], [25, 13]]) prop('boulder', tx, ty, tx + ty);
      break;
    case 'forest': {
      const rnd = mulberry32(0xf0e57);
      const kinds: DecorKind[] = ['oak', 'oak', 'pine', 'youngoak', 'youngpine', 'deadtree', 'bush', 'boulder', 'boulder'];
      for (let i = 0; i < 400 && l.props.length < 75; i++) {
        const tx = 2 + Math.floor(rnd() * (ARENA_W - 4));
        const ty = 2 + Math.floor(rnd() * (ARENA_H - 4));
        if (nearHero(tx, ty, 3) || l.propTiles.has(idx(tx, ty))) continue;
        // Abstand zu anderen Hindernissen, damit Wege offen bleiben
        if ([...l.propTiles].some((k) => Math.abs((k % ARENA_W) - tx) <= 1 && Math.abs(Math.floor(k / ARENA_W) - ty) <= 1)) continue;
        prop(kinds[Math.floor(rnd() * kinds.length)], tx, ty, Math.floor(rnd() * 8), Math.round((rnd() - 0.5) * 8));
      }
      // Nicht feste Bodendetails
      for (let i = 0; i < 40; i++) {
        const tx = 1 + Math.floor(rnd() * (ARENA_W - 2));
        const ty = 1 + Math.floor(rnd() * (ARENA_H - 2));
        prop(rnd() < 0.5 ? 'flowers' : 'tuft', tx, ty, Math.floor(rnd() * 8), Math.round((rnd() - 0.5) * 16));
      }
      break;
    }
    case 'choke':
      // Zwei Mauern quer durch die Arena mit schmalen Durchgängen …
      rect(13, 1, 1, ARENA_H - 2, Cell.Wall);
      rect(13, 5, 1, 2, Cell.Floor);
      rect(13, 19, 1, 2, Cell.Floor);
      rect(27, 1, 1, ARENA_H - 2, Cell.Wall);
      rect(27, 12, 1, 2, Cell.Floor);
      // … dahinter ein Korridor, 2 Kacheln breit, mit einem Knick
      rect(28, 10, 8, 1, Cell.Wall);
      rect(28, 15, 8, 1, Cell.Wall);
      rect(35, 10, 1, 3, Cell.Wall);
      rect(31, 11, 1, 3, Cell.Wall);
      // links: eine Mauerecke zum Verstecken
      rect(4, 9, 5, 1, Cell.Wall);
      rect(8, 9, 1, 6, Cell.Wall);
      // Mitte: kurze Deckungsmauern
      rect(18, 7, 4, 1, Cell.Wall);
      rect(18, 19, 4, 1, Cell.Wall);
      break;
    case 'swamp': {
      const rnd = mulberry32(0x5a3f);
      for (const [cx, cy, rx, ry] of [[9, 7, 6, 4], [30, 6, 7, 4], [8, 19, 5, 4], [31, 19, 7, 4], [20, 4, 4, 2], [20, 22, 5, 2]]) blob(cx, cy, rx, ry, Cell.Mud, rnd);
      blob(20, 13, 4, 3, Cell.Mud, rnd);
      for (const [cx, cy, rx, ry] of [[9, 7, 2.5, 1.6], [31, 6, 3, 1.8], [31, 19, 2.6, 1.8], [8, 19, 1.6, 1.4], [14, 13, 1.6, 2.4], [26, 13, 1.6, 2.4]]) blob(cx, cy, rx, ry, Cell.Water, rnd);
      for (let i = 0; i < 30; i++) {
        const tx = 1 + Math.floor(rnd() * (ARENA_W - 2));
        const ty = 1 + Math.floor(rnd() * (ARENA_H - 2));
        if (cellAt(l, tx, ty) === Cell.Mud) prop('reeds', tx, ty, Math.floor(rnd() * 8), Math.round((rnd() - 0.5) * 16));
      }
      for (const [tx, ty] of [[4, 12], [36, 12], [20, 9]]) prop('deadtree', tx, ty, tx);
      break;
    }
  }
  // Rand: Mauer
  rect(0, 0, ARENA_W, 1, Cell.Wall);
  rect(0, ARENA_H - 1, ARENA_W, 1, Cell.Wall);
  rect(0, 0, 1, ARENA_H, Cell.Wall);
  rect(ARENA_W - 1, 0, 1, ARENA_H, Cell.Wall);
  // Der Held steht immer frei
  if (solid(cellAt(l, HERO_TILE.tx, HERO_TILE.ty))) set(HERO_TILE.tx, HERO_TILE.ty, Cell.Floor);
  return l;
}

/**
 * Bis zu `n` freie Kacheln möglichst nahe an (tx, ty), spiralförmig nach außen – für Gruppen von Gegnern.
 * `free` prüft zusätzlich (z. B. Abstand zum Helden).
 */
export function placeGroup(l: ArenaLayout, tx: number, ty: number, n: number, free: (tx: number, ty: number) => boolean = () => true): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  for (let r = 0; r < 12 && out.length < n; r++)
    for (let dy = -r; dy <= r && out.length < n; dy++)
      for (let dx = -r; dx <= r && out.length < n; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx;
        const y = ty + dy;
        if (walkableIn(l, x, y) && free(x, y)) out.push({ tx: x, ty: y });
      }
  return out;
}
