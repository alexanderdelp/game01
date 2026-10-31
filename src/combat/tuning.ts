/**
 * Einstellbare Kampfwerte für die Kampf-Arena (`?arena=1`): Regler ändern die Werte live, „Werte kopieren“
 * erzeugt den Code-Ausschnitt für `combat.ts`. Rein, ohne Phaser.
 */
import { PLAYER_MOVE, PLAYER_SWING } from './combat';

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

export const TUNABLES: Tunable[] = [
  { id: 'move.speed', label: 'Lauftempo (px/s)', min: 60, max: 300, step: 5, get: () => PLAYER_MOVE.speed, set: (v) => (PLAYER_MOVE.speed = v) },
  swing('frameRate', 'Hieb: Bilder/s', 8, 40, 1),
  swing('hitDelay', 'Hieb: Treffer nach (s)', 0, 0.3, 0.01),
  swing('cooldown', 'Pause nach Hieb (s)', 0, 0.4, 0.01),
  swing('moveFactor', 'Tempo beim Hieb (0–1)', 0, 1, 0.05),
  swing('knockLock', 'Kontrollverlust bei Treffer (s)', 0, 0.4, 0.01),
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
  return `export const PLAYER_MOVE = {\n${fmt(PLAYER_MOVE)}\n};\n\nexport const PLAYER_SWING = {\n${fmt(PLAYER_SWING)}\n};`;
}
