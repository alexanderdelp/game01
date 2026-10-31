/** Reine Kampflogik: Schaden, Trefferboxen, Rückstoß, Stufen. Ohne Phaser, testbar. */
import type { Box, Facing } from '../world/collision';

export interface Stats {
  maxHp: number;
  hp: number;
  attack: number;
  defense: number;
}

/** Schaden mit ±15 % Streuung, Verteidigung halbiert sich an, mindestens 1. */
export function rollDamage(attack: number, defense: number, rnd: () => number): number {
  const spread = 0.85 + rnd() * 0.3;
  return Math.max(1, Math.round(attack * spread - defense / 2));
}

/** Trefferbox eines Nahkampfangriffs vor einer Figur (x, y = Fußpunkt). */
export function attackBox(x: number, y: number, facing: Facing, reach = 30, width = 40): Box {
  const cy = y - 18; // Körpermitte
  switch (facing) {
    case 'up':
      return { x: x - width / 2, y: cy - reach - 6, w: width, h: reach + 6 };
    case 'down':
      return { x: x - width / 2, y: cy, w: width, h: reach + 10 };
    case 'left':
      return { x: x - reach - 8, y: cy - width / 2 + 4, w: reach + 8, h: width };
    case 'right':
      return { x, y: cy - width / 2 + 4, w: reach + 8, h: width };
  }
}

/** Richtungsvektor (Länge beliebig). */
export interface Vec {
  x: number;
  y: number;
}

const D = Math.SQRT1_2;
/** Die 8 Zielrichtungen ab „rechts“ im Uhrzeigersinn (Bildschirm: y nach unten), exakt für gerade Richtungen. */
const AIMS: readonly Vec[] = [
  { x: 1, y: 0 }, { x: D, y: D }, { x: 0, y: 1 }, { x: -D, y: D },
  { x: -1, y: 0 }, { x: -D, y: -D }, { x: 0, y: -1 }, { x: D, y: -D },
];

/**
 * Rastet eine Eingaberichtung auf 8 Richtungen ein (M28) und liefert den Einheitsvektor,
 * `null` bei (fast) keiner Eingabe.
 */
export function aimFrom(dx: number, dy: number): Vec | null {
  if (Math.hypot(dx, dy) < 1e-6) return null;
  const i = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
  return { ...AIMS[i] };
}

/** Zielen (M28). */
export const PLAYER_AIM = {
  /**
   * Zwei Tasten werden nie genau gleichzeitig losgelassen: Wechselt die Eingabe von einer Diagonale auf eine ihrer
   * geraden Richtungen, gilt das erst nach dieser Zeit (s) – sonst ginge das diagonale Ziel beim Anhalten verloren.
   */
  releaseGrace: 0.08,
};

/**
 * Nächste Zielrichtung aus der Eingabe (`input` schon eingerastet). `held` = wie lange die Eingabe schon
 * auf eine Teilrichtung der bisherigen Diagonale zeigt.
 */
export function nextAim(prev: Vec, input: Vec | null, held: number, dt: number, grace = PLAYER_AIM.releaseGrace): { aim: Vec; held: number } {
  if (!input) return { aim: prev, held: 0 };
  const prevDiagonal = prev.x !== 0 && prev.y !== 0;
  const part = (input.x === 0 && Math.sign(input.y) === Math.sign(prev.y)) || (input.y === 0 && Math.sign(input.x) === Math.sign(prev.x));
  if (prevDiagonal && part) {
    const h = held + dt;
    return h >= grace ? { aim: input, held: 0 } : { aim: prev, held: h };
  }
  return { aim: input, held: 0 };
}

/** Gerade Richtung (keine Diagonale) als Blickrichtung, sonst `null`. */
function cardinalOf(aim: Vec): Facing | null {
  if (aim.y === 0) return aim.x < 0 ? 'left' : 'right';
  if (aim.x === 0) return aim.y < 0 ? 'up' : 'down';
  return null;
}

/** Trefferzone eines Hiebs als konvexes Viereck (Eckpunkte im Umlauf). */
export type Zone = Vec[];

/**
 * Trefferzone des Hiebs in Zielrichtung (M28): gerade Richtungen exakt wie `attackBox` (Spielgefühl unverändert),
 * diagonal ein gedrehtes Feld gleicher Breite und gleicher Reichweite ab der Körpermitte.
 */
export function attackZone(x: number, y: number, aim: Vec, reach = 30, width = 40): Zone {
  const card = cardinalOf(aim);
  if (card) {
    const b = attackBox(x, y, card, reach, width);
    return [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.h },
      { x: b.x, y: b.y + b.h },
    ];
  }
  const len = Math.hypot(aim.x, aim.y) || 1;
  const fx = aim.x / len;
  const fy = aim.y / len;
  const px = -fy;
  const py = fx;
  const cx = x;
  const cy = y - 18; // Körpermitte
  const back = -4; // ein Stück hinter die Mitte, damit Gegner direkt am Körper getroffen werden
  const front = reach + 8;
  const h = width / 2;
  return [
    { x: cx + fx * back + px * h, y: cy + fy * back + py * h },
    { x: cx + fx * front + px * h, y: cy + fy * front + py * h },
    { x: cx + fx * front - px * h, y: cy + fy * front - py * h },
    { x: cx + fx * back - px * h, y: cy + fy * back - py * h },
  ];
}

/** Umgebende Box einer Zone (Vorauswahl der Gegner). */
export function zoneBounds(z: Zone): Box {
  const xs = z.map((p) => p.x);
  const ys = z.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Überschneidet die Zone eine Box? (Trennachsen-Test, echte Überlappung wie `overlaps`) */
export function zoneHits(z: Zone, b: Box): boolean {
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
  const axes: Vec[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let i = 0; i < z.length; i++) {
    const a = z[i];
    const c = z[(i + 1) % z.length];
    axes.push({ x: -(c.y - a.y), y: c.x - a.x });
  }
  for (const ax of axes) {
    let zMin = Infinity;
    let zMax = -Infinity;
    let bMin = Infinity;
    let bMax = -Infinity;
    for (const p of z) {
      const d = p.x * ax.x + p.y * ax.y;
      zMin = Math.min(zMin, d);
      zMax = Math.max(zMax, d);
    }
    for (const p of corners) {
      const d = p.x * ax.x + p.y * ax.y;
      bMin = Math.min(bMin, d);
      bMax = Math.max(bMax, d);
    }
    if (zMax <= bMin + 1e-9 || bMax <= zMin + 1e-9) return false;
  }
  return true;
}

/**
 * Zeitverhalten des Spieler-Nahkampfs (Feedback: „wie Super Mario World“ – die Figur tut sofort, was man drückt).
 * Schlag läuft im Laufen, kein Vormerken von Tasten, kein automatisches Drehen.
 */
export const PLAYER_SWING = {
  /** Bilder/s der Hieb-Animation (6 Bilder → 250 ms) */
  frameRate: 24,
  frames: 6,
  /** Treffer nach … s (zweites Bild, Klinge vorn) */
  hitDelay: 0.06,
  /** Pause nach dem Hieb, bevor der nächste möglich ist (s) */
  cooldown: 0.04,
  /** Tempo während des Hiebs relativ zum Laufen */
  moveFactor: 0.85,
  /** Kontrollverlust nach einem Treffer (Rückstoß, s) */
  knockLock: 0.1,
};

/** Bewegung des Helden (Grundtempo in px/s, vor Volks- und Ausrüstungsboni). */
export const PLAYER_MOVE = {
  speed: 150,
};

/** Zeit vom Tastendruck bis der nächste Hieb möglich ist (s). */
export function swingCycle(s = PLAYER_SWING): number {
  return s.frames / s.frameRate + s.cooldown;
}

/** Rückstoß-Vektor von `from` weg mit gegebener Stärke (px). */
export function knockback(fromX: number, fromY: number, toX: number, toY: number, strength: number): { x: number; y: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  return { x: (dx / len) * strength, y: (dy / len) * strength };
}

/** Kacheln je Gegnerstufe (seit M19 doppelt so groß wie die Welt, vorher 150). */
export const LEVEL_STEP = 300;

/** Gegnerstufe aus der Entfernung zum Startpunkt (in Kacheln): alle LEVEL_STEP Kacheln eine Stufe. */
export function levelForDistance(tiles: number): number {
  return 1 + Math.floor(Math.max(0, tiles) / LEVEL_STEP);
}

/** Werte für eine Stufe: +25 % LP und +15 % Angriff pro Stufe. */
export function scaleStats(base: { hp: number; attack: number; defense: number }, level: number): Stats {
  const hp = Math.round(base.hp * (1 + 0.25 * (level - 1)));
  return { maxHp: hp, hp, attack: Math.round(base.attack * (1 + 0.15 * (level - 1))), defense: Math.round(base.defense * (1 + 0.1 * (level - 1))) };
}

/** Merkt sich besiegte Gegner für eine Weile (in dieser Sitzung). */
export class DefeatLog {
  private readonly until = new Map<string, number>();

  constructor(private readonly durationMs = 5 * 60_000) {}

  defeat(id: string, now: number): void {
    this.until.set(id, now + this.durationMs);
  }

  isDefeated(id: string, now: number): boolean {
    const t = this.until.get(id);
    if (t === undefined) return false;
    if (now >= t) {
      this.until.delete(id);
      return false;
    }
    return true;
  }
}

/** Spieler-Regeneration: nach `delay` s ohne Treffer `rate` LP/s. */
export function regen(hp: number, maxHp: number, sinceHit: number, dt: number, delay = 4, rate = 3): number {
  if (sinceHit < delay || hp <= 0) return hp;
  return Math.min(maxHp, hp + rate * dt);
}

/** Fernzauber „Splitterblitz“: Kennwerte. */
export const SPELL = { speed: 330, range: 320, cooldown: 1.6, castDelay: 0.25, damageFactor: 0.9 } as const;

/**
 * Blickrichtung des Sprites (4 Richtungen) zu einer Zielrichtung (M28): diagonal die Seitenansicht (`side`)
 * oder die Vorder-/Rückansicht (`vertical`, nur zum Vergleich in der Arena).
 */
export function facingForAim(aim: Vec, diagonal: 'side' | 'vertical' = 'side'): Facing {
  if (Math.abs(aim.x) < 1e-6) return aim.y < 0 ? 'up' : 'down';
  if (Math.abs(aim.y) < 1e-6 || diagonal === 'side') return aim.x < 0 ? 'left' : 'right';
  return aim.y < 0 ? 'up' : 'down';
}

/** Einheitsvektor der Blickrichtung. */
export function facingVector(f: Facing): { x: number; y: number } {
  return { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[f];
}
