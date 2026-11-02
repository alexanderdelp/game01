/**
 * Beschreibung der Einstellungen für die Oberfläche (Werkstatt im Legenden-Modus). Rein.
 *
 * Einfache Felder stehen hier mit Pfad in `HistoryConfig`; Tabellen (Zeitalter, Systeme, Weltereignisse, Größenstufen,
 * Gedächtnis der Völker) baut die Oberfläche aus den Registern (`SYSTEMS`, `WORLD_EVENTS`) – neue Systeme und
 * Weltereignisse erscheinen dort also von selbst.
 */
export interface Field {
  /** Pfad in der Konfiguration, z. B. `settlements.popScale` */
  path: string;
  label: string;
  help?: string;
  kind: 'number' | 'bool';
  min?: number;
  max?: number;
  step?: number;
}

export interface Section {
  id: string;
  title: string;
  help: string;
  fields: Field[];
  /** Zusätzliche Tabelle aus einem Register */
  table?: 'epochs' | 'worldEvents' | 'systems' | 'races' | 'tiers' | 'memory';
}

export const SECTIONS: Section[] = [
  {
    id: 'epochs', title: 'Zeitalter', table: 'epochs', fields: [],
    help: 'Von alt nach jung; ihre Summe ist die Länge der Vorgeschichte. Schritt = Jahre je Simulationsschritt (grob = schneller, weniger Einzelheiten). Detail: 0 Sage, 1 Chronik, 2 voll, 3 mit lebenden Familien. Mindestbedeutung: kleinere Ereignisse werden nicht aufgeschrieben. Klarheit: wie gut die Zeit überliefert ist.',
  },
  {
    id: 'worldEvents', title: 'Weltereignisse', table: 'worldEvents',
    help: 'Einschneidende, weltweite Ereignisse. Gewicht 0 = nie zufällig gewählt; die Zersplitterung ist fest kurz vor der Gegenwart.',
    fields: [
      { path: 'worldEvents.count', label: 'Anzahl (zufällig gewählt)', kind: 'number', min: 0, max: 20, step: 1 },
      { path: 'worldEvents.minGap', label: 'Mindestabstand (Jahre)', kind: 'number', min: 0, max: 3000, step: 50 },
    ],
  },
  {
    id: 'systems', title: 'Systeme', table: 'systems', fields: [],
    help: 'Was in jedem Schritt geschieht. Aus = findet nicht statt; Stärke 1 = Standard.',
  },
  {
    id: 'civs', title: 'Völker & Reiche', table: 'races',
    help: 'Welche Völker vorkommen und wie viele Reiche es gibt. Das Spiel braucht am Ende sechs Reiche; fehlen welche, entstehen neue.',
    fields: [
      { path: 'civs.initial', label: 'Urreiche zu Beginn', kind: 'number', min: 1, max: 16, step: 1 },
      { path: 'civs.target', label: 'Angestrebte Zahl von Reichen', kind: 'number', min: 1, max: 24, step: 1 },
      { path: 'civs.maxAlive', label: 'Höchstens gleichzeitig', kind: 'number', min: 6, max: 30, step: 1 },
    ],
  },
  {
    id: 'towns', title: 'Siedlungen & Städte', table: 'tiers',
    help: 'Größe der Orte und ihr Stadtplan im Spiel. Gebäude = Einwohner ÷ Einwohner je Haus. Ab der Mauerstufe bekommt ein Ort einen Mauerring (im Radius seiner Blütezeit).',
    fields: [
      { path: 'settlements.maxAlive', label: 'Bewohnte Orte höchstens', kind: 'number', min: 20, max: 400, step: 10 },
      { path: 'settlements.popScale', label: 'Größe der Orte (×)', kind: 'number', min: 0.05, max: 4, step: 0.05 },
      { path: 'settlements.spacing', label: 'Mindestabstand (Kacheln)', kind: 'number', min: 44, max: 200, step: 4 },
      { path: 'towns.peoplePerHouse', label: 'Einwohner je Haus', kind: 'number', min: 5, max: 500, step: 5 },
      { path: 'towns.maxBuildings', label: 'Gebäude je Ort höchstens', kind: 'number', min: 5, max: 1500, step: 10 },
      { path: 'towns.wallTier', label: 'Mauer ab Stufe (Index)', kind: 'number', min: 0, max: 8, step: 1 },
    ],
  },
  {
    id: 'knowledge', title: 'Überlieferung', table: 'memory',
    help: 'Wie gut man heute von früher weiß: Grundklarheit je Zeitalter (oben) plus Bedeutung × Bonus plus Gedächtnis des Volks, minus Verluste.',
    fields: [
      { path: 'knowledge.importance', label: 'Bonus je Bedeutungsstufe', kind: 'number', min: 0, max: 0.3, step: 0.01 },
      { path: 'knowledge.darkAgeLoss', label: 'Verlust je dunklem Zeitalter', kind: 'number', min: 0, max: 1, step: 0.02 },
      { path: 'knowledge.fallenLoss', label: 'Verlust bei untergegangenem Reich', kind: 'number', min: 0, max: 1, step: 0.02 },
      { path: 'knowledge.noise', label: 'Streuung', kind: 'number', min: 0, max: 0.5, step: 0.01 },
    ],
  },
  {
    id: 'game', title: 'Spielwelt', fields: [{ path: 'game.ruins', label: 'Ruinen mit Wächter höchstens', kind: 'number', min: 0, max: 400, step: 5 }],
    help: 'Was aus der Geschichte ins Spiel übernommen wird.',
  },
];

/** Wert an einem Pfad lesen bzw. setzen. */
export function getPath(o: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);
}

export function setPath(o: unknown, path: string, v: unknown): void {
  const keys = path.split('.');
  let x = o as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) x = (x[k] ??= {}) as Record<string, unknown>;
  x[keys[keys.length - 1]] = v;
}
