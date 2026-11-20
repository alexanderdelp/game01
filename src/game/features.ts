/**
 * Schalter für Spielsysteme (M32 „Kernmodus“, `docs/PLAN-kern.md`).
 * Standard ist der Kernmodus: Systeme, die nicht zu Bewegen, Kämpfen und Erkunden gehören, sind aus.
 * `?systeme=alle` schaltet alles ein, `?systeme=quests,news` nur die genannten.
 */
export const FEATURES = [
  'quests', 'pledge', 'caravans', 'invasions', 'news', 'renown',
  // Feedback zu M32: Charakter-Erschaffung, Schilder, Obelisken (mit Chronik), Chat, Barbier, alter Start in der Wildnis
  'creation', 'signs', 'obelisks', 'chat', 'barber', 'wildstart',
] as const;
export type Feature = (typeof FEATURES)[number];

/** Eingeschaltete Systeme aus dem URL-Parameter `systeme`. */
export function parseFeatures(search: string): Set<Feature> {
  const p = new URLSearchParams(search).get('systeme');
  if (!p) return new Set();
  if (p === 'alle') return new Set(FEATURES);
  return new Set(p.split(',').map((s) => s.trim()).filter((s): s is Feature => (FEATURES as readonly string[]).includes(s)));
}

let enabled = parseFeatures(typeof location === 'undefined' ? '' : location.search);

/** Ist das System eingeschaltet? */
export const on = (f: Feature): boolean => enabled.has(f);

/** Für Tests: Schalter direkt setzen. */
export function setFeatures(fs: Iterable<Feature>): void {
  enabled = new Set(fs);
}

export const enabledFeatures = (): Feature[] => FEATURES.filter((f) => enabled.has(f));
