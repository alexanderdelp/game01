/**
 * Einstellbare Kampfwerte für die Kampf-Arena (`?arena=1`): Regler ändern die Werte live, „Werte kopieren“
 * erzeugt den Code-Ausschnitt für `combat.ts`. Rein, ohne Phaser.
 */
import { PLAYER_AIM, PLAYER_BLOCK, PLAYER_DODGE, PLAYER_MOVE, PLAYER_SWING } from './combat';

export interface Tunable {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  get(): number;
  set(v: number): void;
}

const swing = (id: keyof typeof PLAYER_SWING, label: string, min: number, max: number, step: number): Tunable => ({
  id: `swing.${id}`,
  label,
  min,
  max,
  step,
  get: () => PLAYER_SWING[id],
  set: (v) => (PLAYER_SWING[id] = v),
});

/** Regler für einen Wert eines Werte-Objekts (`block.parryWindow` usw.). */
function field<T extends Record<string, number>>(prefix: string, obj: T, id: keyof T & string, label: string, min: number, max: number, step: number): Tunable {
  return { id: `${prefix}.${id}`, label, min, max, step, get: () => obj[id], set: (v) => ((obj as Record<string, number>)[id] = v) };
}

export const TUNABLES: Tunable[] = [
  { id: 'move.speed', label: 'Lauftempo (px/s)', min: 60, max: 300, step: 5, get: () => PLAYER_MOVE.speed, set: (v) => (PLAYER_MOVE.speed = v) },
  swing('frameRate', 'Hieb: Bilder/s', 8, 40, 1),
  swing('hitDelay', 'Hieb: Treffer nach (s)', 0, 0.3, 0.01),
  swing('cooldown', 'Pause nach Hieb (s)', 0, 0.4, 0.01),
  swing('moveFactor', 'Tempo beim Hieb (0–1)', 0, 1, 0.05),
  swing('knockLock', 'Kontrollverlust bei Treffer (s)', 0, 0.4, 0.01),
  {
    id: 'aim.releaseGrace',
    label: 'Diagonale halten beim Loslassen (s)',
    min: 0,
    max: 0.25,
    step: 0.01,
    get: () => PLAYER_AIM.releaseGrace,
    set: (v) => (PLAYER_AIM.releaseGrace = v),
  },
  // M31: Blocken und Parieren
  field('block', PLAYER_BLOCK, 'damageFactor', 'Block: Schaden von vorn (0–1)', 0, 1, 0.05),
  field('block', PLAYER_BLOCK, 'halfAngle', 'Block: Abwehrwinkel ± (Grad)', 20, 180, 5),
  field('block', PLAYER_BLOCK, 'parryWindow', 'Parade: Zeitfenster (s)', 0, 0.5, 0.01),
  field('block', PLAYER_BLOCK, 'moveFactor', 'Block: Tempo (0–1)', 0, 1, 0.05),
  field('block', PLAYER_BLOCK, 'knockFactor', 'Block: Rückstoß (0–1)', 0, 1, 0.05),
  field('block', PLAYER_BLOCK, 'stagger', 'Parade: Gegner wankt (s)', 0, 2, 0.05),
  field('block', PLAYER_BLOCK, 'holdAim', 'Block hält Richtung (0/1)', 0, 1, 1),
  // M31: Ausweichen
  field('dodge', PLAYER_DODGE, 'speed', 'Ausweichen: Tempo (px/s)', 150, 900, 10),
  field('dodge', PLAYER_DODGE, 'duration', 'Ausweichen: Dauer (s)', 0.05, 0.6, 0.01),
  field('dodge', PLAYER_DODGE, 'invuln', 'Ausweichen: unverwundbar (s)', 0, 0.6, 0.01),
  field('dodge', PLAYER_DODGE, 'cooldown', 'Ausweichen: Abklingzeit (s)', 0, 2, 0.05),
];

/** Werte beim Programmstart (für „Zurücksetzen“). */
export const DEFAULTS: Record<string, number> = snapshot();

export function snapshot(): Record<string, number> {
  return Object.fromEntries(TUNABLES.map((t) => [t.id, t.get()]));
}

/** Übernimmt gespeicherte Werte; unbekannte oder ungültige werden ignoriert, alles bleibt im Reglerbereich. */
export function applySnapshot(s: Record<string, unknown> | null | undefined): void {
  if (!s) return;
  for (const t of TUNABLES) {
    const v = s[t.id];
    if (typeof v === 'number' && Number.isFinite(v)) t.set(Math.min(t.max, Math.max(t.min, v)));
  }
}

/** Code-Ausschnitt zum Einfügen in `src/combat/combat.ts`. */
export function exportCode(): string {
  const fmt = (o: Record<string, number>) =>
    Object.entries(o)
      .map(([k, v]) => `  ${k}: ${+v.toFixed(3)},`)
      .join('\n');
  return `export const PLAYER_MOVE = {\n${fmt(PLAYER_MOVE)}\n};\n\nexport const PLAYER_SWING = {\n${fmt(PLAYER_SWING)}\n};\n\nexport const PLAYER_AIM = {\n${fmt(PLAYER_AIM)}\n};\n\nexport const PLAYER_BLOCK = {\n${fmt(PLAYER_BLOCK)}\n};\n\nexport const PLAYER_DODGE = {\n${fmt(PLAYER_DODGE)}\n};`;
}
