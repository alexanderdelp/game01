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

/** Einheitsvektor der Blickrichtung. */
export function facingVector(f: Facing): { x: number; y: number } {
  return { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[f];
}
