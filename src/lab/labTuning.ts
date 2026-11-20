/**
 * Regler des Bewegungslabors (M33): Laufen (Anlauf, Abbremsen, Steigung) und Stimmung. Rein, ohne Phaser.
 * Das Lauftempo selbst ist `move.speed` aus den Kampfwerten (`combat/tuning.ts`), die Hangbremse `SLOPE` aus
 * `world/terrain.ts` – so gelten Werte, die Alex festlegt, später unverändert im Spiel.
 */
import { PLAYER_MOVE } from '../combat/combat';
import type { Tunable } from '../combat/tuning';
import { SLOPE } from '../world/terrain';

/** Zusätze zum Laufen, die es im Spiel (noch) nicht gibt. 0 = wie bisher. */
export const LAB_MOVE = {
  /** Zeit bis zum vollen Tempo (s) */
  accel: 0,
  /** Zeit bis zum Stillstand (s) */
  decel: 0,
  /** Bergauf: Tempoverlust je Höheneinheit Steigung pro Kachel (0 = aus) */
  uphill: 0,
  /** Bergab: Tempogewinn je Höheneinheit Gefälle pro Kachel (0 = aus) */
  downhill: 0,
};

export const LAB_MOOD = {
  /** Nebel 0–1 (wirkt stärker, je höher man steht) */
  fog: 0.6,
  /** Schneefall 0–1 (in Schnee- und Gipfelbiomen) */
  snow: 0.7,
  zoom: 2,
};

const field = <T extends Record<string, number>>(prefix: string, obj: T, id: keyof T & string, label: string, min: number, max: number, step: number): Tunable => ({
  id: `${prefix}.${id}`, label, min, max, step, get: () => obj[id], set: (v) => ((obj as Record<string, number>)[id] = v),
});

export const MOVE_TUNABLES: Tunable[] = [
  { id: 'move.speed', label: 'Lauftempo (px/s)', min: 60, max: 300, step: 5, get: () => PLAYER_MOVE.speed, set: (v) => (PLAYER_MOVE.speed = v) },
  field('lab', LAB_MOVE, 'accel', 'Anlaufzeit (s)', 0, 0.6, 0.02),
  field('lab', LAB_MOVE, 'decel', 'Abbremszeit (s)', 0, 0.6, 0.02),
  field('slope', SLOPE, 'max', 'Hangbremse: Stärke (0–1)', 0, 0.8, 0.05),
  field('slope', SLOPE, 'from', 'Hangbremse: ab Steilheit', 0, 1.5, 0.05),
  field('lab', LAB_MOVE, 'uphill', 'Bergauf langsamer', 0, 1.5, 0.05),
  field('lab', LAB_MOVE, 'downhill', 'Bergab schneller', 0, 1, 0.05),
];

export const MOOD_TUNABLES: Tunable[] = [
  field('mood', LAB_MOOD, 'fog', 'Nebel', 0, 1, 0.05),
  field('mood', LAB_MOOD, 'snow', 'Schneefall', 0, 1, 0.05),
  field('mood', LAB_MOOD, 'zoom', 'Zoom', 1, 3, 0.25),
];

export const LAB_TUNABLES = [...MOVE_TUNABLES, ...MOOD_TUNABLES];
export const LAB_DEFAULTS: Record<string, number> = labSnapshot();

export function labSnapshot(): Record<string, number> {
  return Object.fromEntries(LAB_TUNABLES.map((t) => [t.id, t.get()]));
}

export function applyLabSnapshot(s: Record<string, unknown> | null | undefined): void {
  if (!s) return;
  for (const t of LAB_TUNABLES) {
    const v = s[t.id];
    if (typeof v === 'number' && Number.isFinite(v)) t.set(Math.min(t.max, Math.max(t.min, v)));
  }
}

/**
 * Geglättete Eingabe: nähert die Laufrichtung in `accel` (beim Loslaufen/Wenden) bzw. `decel` (beim Loslassen)
 * Sekunden der Zielrichtung an. 0 = sofort (bisheriges Verhalten).
 */
export function smoothDir(cur: { x: number; y: number }, target: { x: number; y: number }, dt: number, m = LAB_MOVE): { x: number; y: number } {
  const stopping = Math.hypot(target.x, target.y) < 0.01;
  const t = stopping ? m.decel : m.accel;
  if (t <= 0) return { ...target };
  const k = Math.min(1, dt / t);
  return { x: cur.x + (target.x - cur.x) * k, y: cur.y + (target.y - cur.y) * k };
}

/**
 * Tempofaktor aus der Steigung in Laufrichtung (Höheneinheiten je Kachel, positiv = bergauf).
 * Bergauf bremst `uphill`, bergab beschleunigt `downhill`; begrenzt auf 0,4–1,6.
 */
export function gradeFactor(grade: number, m = LAB_MOVE): number {
  const f = grade > 0 ? 1 - m.uphill * grade : 1 + m.downhill * -grade;
  return Math.min(1.6, Math.max(0.4, f));
}

/** Code-Ausschnitt zum Übernehmen der Laufwerte. */
export function exportLabCode(): string {
  const fmt = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `  ${k}: ${+v.toFixed(3)},`).join('\n');
  return `// src/combat/combat.ts\nexport const PLAYER_MOVE = {\n${fmt(PLAYER_MOVE)}\n};\n\n// src/world/terrain.ts\nexport const SLOPE = {\n${fmt(SLOPE)}\n};\n\n// src/lab/labTuning.ts (noch nicht im Spiel)\nexport const LAB_MOVE = {\n${fmt(LAB_MOVE)}\n};`;
}
