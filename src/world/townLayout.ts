/**
 * Stadtplan eines Ortes aus der Vorgeschichte (rein, deterministisch): Platz mit Brunnen, Ständen und Wahrzeichen,
 * gepflasterte Hauptstraßen in Richtung der Nachbarorte, Häuserzeilen an Gassen (von innen nach außen gefüllt,
 * ausgefranster Rand), Mauerring mit Toren, verfallene Häuser zwischen Bebauung und Mauer, Felder vor dem Ort.
 */
import { mulberry32 } from './rng';

export type TownPiece = 'house' | 'neonhouse' | 'tower' | 'stall' | 'well' | 'wall' | 'rubble' | 'field';

export interface TownInput {
  tx: number;
  ty: number;
  /** Gewünschte Gebäudezahl (Häuser, ohne Platz und Mauer) */
  buildings: number;
  /** Radius der Bebauung in Kacheln */
  radius: number;
  /** Mauerring (Radius) oder 0 */
  wall: number;
  /** Anteil verfallener Häuser zwischen Bebauung und Mauer (0–1) */
  decay: number;
  /** Größenstufe (0 Weiler … 4 Großstadt) */
  tier: number;
  style: 'fantasy' | 'cyber' | 'mixed';
  /** Richtungen (Bogenmaß) zu Nachbarorten: Hauptstraßen und Tore */
  dirs: number[];
  /** Felder vor dem Ort */
  fields: boolean;
  seed: number;
  /** Höchstens so weit darf der Ort reichen (Nachbarorte) */
  maxRadius: number;
}

export interface TownOutput {
  pieces: { kind: TownPiece; tx: number; ty: number; variant: number }[];
  /** Gepflasterte Kacheln (Platz, Hauptstraßen, Gassen) als tx * 65536 + ty */
  streets: Set<number>;
  /** Tatsächlich erreichter Radius (für Sicherheitszone und NPCs) */
  radius: number;
}

const FREE = 0;
const STREET = 1;
const BUILT = 2;
const WALL = 3;
const BLOCKED = 4;

export function layoutTown(inp: TownInput, free: (tx: number, ty: number) => boolean): TownOutput {
  const rnd = mulberry32(inp.seed);
  // Ganzzahlige Radien (das Belegungsraster braucht ganze Kacheln)
  const maxR = Math.floor(inp.maxRadius);
  const wall = inp.wall > 0 ? Math.max(0, Math.round(Math.min(inp.wall, maxR - 1))) : 0;
  const R = Math.max(5, Math.round(Math.min(inp.radius, maxR - 2)));
  const outer = Math.max(R, wall) + (inp.fields ? 10 : 3);
  const S = outer * 2 + 3;
  const o = outer + 1;
  // Belegung, lazy aus dem Gelände (−1 = noch nicht geprüft)
  const grid = new Int8Array(S * S).fill(-1);
  const at = (x: number, y: number): number => {
    if (x < -o || y < -o || x >= S - o || y >= S - o) return BLOCKED;
    const i = (y + o) * S + x + o;
    if (grid[i] === -1) grid[i] = free(inp.tx + x, inp.ty + y) ? FREE : BLOCKED;
    return grid[i];
  };
  const set = (x: number, y: number, v: number) => {
    if (x < -o || y < -o || x >= S - o || y >= S - o) return;
    grid[(y + o) * S + x + o] = v;
  };
  const pieces: TownOutput['pieces'] = [];
  const streets = new Set<number>();
  const street = (x: number, y: number) => {
    if (at(x, y) !== FREE) return;
    set(x, y, STREET);
    streets.add((inp.tx + x) * 65536 + inp.ty + y);
  };
  const piece = (kind: TownPiece, x: number, y: number, variant = Math.floor(rnd() * 4)) => pieces.push({ kind, tx: inp.tx + x, ty: inp.ty + y, variant });
  // Ausgefranster Rand: der Radius schwankt mit dem Winkel
  const wob = [rnd(), rnd(), rnd(), rnd()].map((v) => v * Math.PI * 2);
  const edge = (x: number, y: number) => {
    const a = Math.atan2(y, x);
    return R * (1 + 0.12 * Math.sin(a * 3 + wob[0]) + 0.08 * Math.sin(a * 5 + wob[1]));
  };

  // 1. Platz
  const pr = 3 + Math.min(4, inp.tier);
  for (let y = -pr; y <= pr; y++) for (let x = -pr; x <= pr; x++) if (x * x + y * y <= pr * pr + 1) street(x, y);
  piece('well', 0, 0, inp.style === 'cyber' ? 1 : 0);
  set(0, 0, BUILT);
  const stalls = 1 + inp.tier * 2;
  for (let k = 0; k < stalls; k++) {
    const a = (k / stalls) * Math.PI * 2 + 0.4;
    const x = Math.round(Math.cos(a) * (pr - 1.5));
    const y = Math.round(Math.sin(a) * (pr - 1.5));
    if (Math.abs(x) < 2 && Math.abs(y) < 2) continue;
    if (at(x, y) !== STREET || at(x + 1, y) !== STREET) continue;
    piece('stall', x, y);
    set(x, y, BUILT);
    set(x + 1, y, BUILT);
  }

  // 2. Hauptstraßen (zwei Kacheln breit) in Richtung der Nachbarorte, mindestens vier
  const dirs = [...inp.dirs];
  for (const base of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    if (dirs.length >= 4) break;
    if (dirs.every((d) => Math.abs(Math.atan2(Math.sin(d - base), Math.cos(d - base))) > 0.9)) dirs.push(base + (rnd() - 0.5) * 0.3);
  }
  const avenue = new Set<number>();
  const reach = Math.max(R, wall) + 1;
  for (const d of dirs) {
    for (let r = pr - 1; r <= reach; r += 0.5) {
      const x = Math.round(Math.cos(d) * r);
      const y = Math.round(Math.sin(d) * r);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
        street(x + dx, y + dy);
        avenue.add((y + dy + o) * S + x + dx + o);
      }
    }
  }

  // 3. Mauerring mit Toren an den Hauptstraßen (die Mauer steht vor den Häusern fest)
  if (wall > 0) {
    const gateAt = (x: number, y: number) => {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (avenue.has((y + dy + o) * S + x + dx + o)) return true;
      return false;
    };
    const towers = new Set<string>();
    for (let y = -wall - 1; y <= wall + 1; y++) for (let x = -wall - 1; x <= wall + 1; x++) {
      const d = Math.hypot(x, y);
      if (Math.abs(d - wall) >= 0.5) continue;
      if (at(x, y) === BLOCKED) continue;
      // Tor: Lücke an der Hauptstraße, Tortürme daneben
      if (gateAt(x, y)) continue;
      const nearGate = gateAt(x + 1, y) || gateAt(x - 1, y) || gateAt(x, y + 1) || gateAt(x, y - 1);
      const key = `${Math.round(x / 3)},${Math.round(y / 3)}`;
      let room = nearGate && !towers.has(key);
      for (let dy = -2; dy <= 0 && room; dy++) for (let dx = -1; dx <= 1 && room; dx++) room = at(x + dx, y + dy) === FREE;
      if (room) {
        // Torturm: belegt wie ein Haus 3 × 3 Kacheln
        towers.add(key);
        piece('tower', x, y);
        for (let dy = -2; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + dy, WALL);
      } else if (at(x, y) === FREE || at(x, y) === STREET) piece('wall', x, y, inp.style === 'cyber' ? 1 : 0);
      set(x, y, WALL);
    }
  }

  // 4. Gassen: Zeilen alle 5 Kacheln (Häuser stehen mit der Tür zur Gasse), Querwege alle ~13 Kacheln
  const yOff = Math.floor(rnd() * 5);
  const lim = Math.max(R, wall > 0 ? wall - 1 : 0);
  for (let y = -lim; y <= lim; y++) {
    if ((((y + yOff) % 5) + 5) % 5 !== 0) continue;
    let keep = true;
    for (let x = -lim; x <= lim; x++) {
      if (x % 9 === 0) keep = rnd() < 0.88;
      if (keep && Math.hypot(x, y) <= (wall > 0 ? wall - 1 : edge(x, y))) street(x, y);
    }
  }
  const xOff = Math.floor(rnd() * 13);
  for (let x = -lim; x <= lim; x++) {
    if ((((x + xOff) % 13) + 13) % 13 !== 0) continue;
    for (let y = -lim; y <= lim; y++) if (Math.hypot(x, y) <= (wall > 0 ? wall - 1 : edge(x, y))) street(x, y);
  }

  // 5. Häuser: Plätze mit Gasse vor der Tür, nach Abstand zur Mitte (mit Zufall) sortiert
  const fits = (x: number, y: number) => {
    for (let dy = -2; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) !== FREE) return false;
    return true;
  };
  const slots: { x: number; y: number; d: number; front: boolean }[] = [];
  const lim2 = wall > 0 ? wall - 1 : Math.ceil(R * 1.25);
  for (let y = -lim2; y <= lim2; y++) for (let x = -lim2; x <= lim2; x++) {
    const d = Math.hypot(x, y);
    if (d > lim2 || d < pr) continue;
    const s = at(x, y + 1);
    const front = s === STREET;
    slots.push({ x, y, d: d + rnd() * 4 - (front ? 3 : 0), front });
  }
  slots.sort((a, b) => a.d - b.d);
  const kinds: TownPiece[] = inp.style === 'cyber' ? ['neonhouse'] : inp.style === 'mixed' ? ['house', 'neonhouse'] : ['house'];
  // Viertel: im gemischten Stil je Winkelsektor ein Baustil
  const quarter = (x: number, y: number) => kinds[Math.floor(((Math.atan2(y, x) + Math.PI + wob[2]) / (Math.PI * 2)) * 6) % kinds.length];
  let built = 0;
  let maxD = pr;
  const place = (x: number, y: number, kind: TownPiece) => {
    for (let dy = -2; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + dy, BUILT);
    piece(kind, x, y);
  };
  for (const pass of [true, false]) {
    for (const s of slots) {
      if (built >= inp.buildings) break;
      if (pass && !s.front) continue;
      if (Math.hypot(s.x, s.y) > (wall > 0 ? wall - 1 : edge(s.x, s.y) * 1.15)) continue;
      if (!fits(s.x, s.y)) continue;
      place(s.x, s.y, rnd() < 0.04 && inp.tier >= 2 ? 'tower' : quarter(s.x, s.y));
      built++;
      maxD = Math.max(maxD, Math.hypot(s.x, s.y));
    }
  }

  // 6. Verfall: zwischen heutiger Bebauung und Mauer stehen Ruinen alter Häuser
  if (wall > 0 && inp.decay > 0.08) {
    for (const s of slots) {
      const d = Math.hypot(s.x, s.y);
      if (d < maxD - 1 || d > wall - 2 || !s.front || !fits(s.x, s.y)) continue;
      if (rnd() < inp.decay * 0.8) place(s.x, s.y, 'rubble');
    }
  }

  // 7. Felder vor dem Ort (flach, ins Bodenbild gebacken)
  if (inp.fields) {
    const from = Math.max(maxD + 3, wall + 2);
    const ph = rnd() * 10;
    // Etwa drei Feldkacheln je Haus (ein Dorf ernährt sich selbst, eine Stadt auch vom Umland)
    let left = 12 + built * 3;
    for (let y = -outer; y <= outer && left > 0; y++) for (let x = -outer; x <= outer && left > 0; x++) {
      const d = Math.hypot(x, y);
      if (d < from || d > from + 6) continue;
      // Rechteckige Schläge, nicht überall (erst die billige Prüfung, dann das Gelände)
      const plot = Math.sin(Math.floor((x + 40) / 6) * 1.7 + ph) * Math.cos(Math.floor((y + 40) / 4) * 2.3 + ph);
      if (plot < 0.25 || at(x, y) !== FREE) continue;
      piece('field', x, y, (Math.floor((x + 40) / 6) + Math.floor((y + 40) / 4)) & 3);
      set(x, y, BUILT);
      left--;
    }
  }
  return { pieces, streets, radius: Math.ceil(Math.max(maxD + 2, wall + 1)) };
}
