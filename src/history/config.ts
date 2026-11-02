/**
 * Konfiguration der Vorgeschichte: alle Stellschrauben an einem Ort. Rein, JSON-fähig (für URL und Oberfläche).
 *
 * Neues Feld: hier mit Standardwert ergänzen, in `resolveConfig` begrenzen (falls Zahl) und in `schema.ts` beschreiben.
 */
import type { Race } from './types';

/** Detailstufe eines Zeitalters: 0 Sage (nur Großes), 1 Chronik, 2 voll, 3 voll mit lebenden Familien. */
export type Detail = 0 | 1 | 2 | 3;

export interface EpochConfig {
  id: string;
  label: string;
  /** Länge in Jahren */
  years: number;
  /** Jahre je Simulationsschritt */
  step: number;
  detail: Detail;
  /** Ereignisse unter dieser Bedeutung (0–5) werden in diesem Zeitalter nicht protokolliert (wirken aber). */
  minImportance: number;
  /** Grund-Klarheit der Überlieferung (0–1) */
  clarity: number;
}

export interface SystemConfig {
  on: boolean;
  /** Stärke (1 = Standard) */
  rate: number;
}

export interface WorldEventConfig {
  on: boolean;
  /** Gewicht bei der Auswahl (0 = nie zufällig) */
  weight: number;
}

export interface TownTier {
  id: string;
  label: string;
  /** ab dieser Einwohnerzahl */
  minPop: number;
}

export interface HistoryConfig {
  /** Zeitalter von alt nach jung; ihre Summe ist die Länge der Vorgeschichte */
  epochs: EpochConfig[];
  civs: {
    /** Völker, die vorkommen */
    races: Record<Race, boolean>;
    /** Reiche zu Beginn (über das erste Jahrhundert verteilt) */
    initial: number;
    /** Angestrebte Zahl bestehender Reiche (neue entstehen in leerem Land) */
    target: number;
    /** Höchstens so viele Reiche bestehen gleichzeitig */
    maxAlive: number;
  };
  /** Systeme, die jeden Schritt laufen (IDs aus `systems/index.ts`) */
  systems: Record<string, SystemConfig>;
  worldEvents: {
    /** Zufällig gewählte Weltereignisse je Welt (feste wie die Zersplitterung kommen dazu) */
    count: number;
    /** Mindestabstand zwischen zwei Weltereignissen in Jahren */
    minGap: number;
    defs: Record<string, WorldEventConfig>;
  };
  settlements: {
    /** Weiche Obergrenze bewohnter Orte gleichzeitig */
    maxAlive: number;
    /** Grundgröße der Orte (1 = realistisch: Hauptstädte bis ~40.000) */
    popScale: number;
    /** Mindestabstand neuer Orte in Kacheln */
    spacing: number;
  };
  towns: {
    tiers: TownTier[];
    /** Einwohner je Haus im Stadtplan */
    peoplePerHouse: number;
    /** Höchstens so viele Gebäude je Ort */
    maxBuildings: number;
    /** Ab dieser Stufe (Index in `tiers`) bekommt ein Ort eine Mauer */
    wallTier: number;
  };
  knowledge: {
    /** Bonus je Bedeutungsstufe */
    importance: number;
    /** Gedächtnis je Volk (+ erinnert besser) */
    memory: Record<Race, number>;
    /** Verlust je späterem dunklen Zeitalter */
    darkAgeLoss: number;
    /** Verlust, wenn das betroffene Reich untergegangen ist */
    fallenLoss: number;
    /** Streuung (aus dem Seed) */
    noise: number;
  };
  game: {
    /** Höchstens so viele Ruinen mit Wächter im Spiel */
    ruins: number;
  };
}

export const DEFAULT_CONFIG: HistoryConfig = {
  epochs: [
    { id: 'myth', label: 'Mythenzeit', years: 4000, step: 100, detail: 0, minImportance: 3, clarity: 0.2 },
    { id: 'old', label: 'Altzeit', years: 2500, step: 10, detail: 1, minImportance: 2, clarity: 0.5 },
    { id: 'new', label: 'Neuzeit', years: 1250, step: 2, detail: 2, minImportance: 0, clarity: 0.78 },
    { id: 'recent', label: 'Jüngste Zeit', years: 150, step: 1, detail: 3, minImportance: 0, clarity: 1 },
  ],
  civs: {
    races: { human: true, elf: true, orc: true, synth: true },
    initial: 6,
    target: 9,
    maxAlive: 14,
  },
  systems: {
    figures: { on: true, rate: 1 },
    growth: { on: true, rate: 1 },
    trade: { on: true, rate: 1 },
    relations: { on: true, rate: 1 },
    wars: { on: true, rate: 1 },
    beasts: { on: true, rate: 1 },
    disasters: { on: true, rate: 1 },
    emergence: { on: true, rate: 1 },
    decline: { on: true, rate: 1 },
  },
  worldEvents: {
    count: 6,
    minGap: 350,
    defs: {
      starfall: { on: true, weight: 1.5 },
      machinewar: { on: true, weight: 1.5 },
      flood: { on: true, weight: 1 },
      iceage: { on: true, weight: 1 },
      plagueage: { on: true, weight: 1 },
      darkage: { on: true, weight: 1.2 },
      migration: { on: true, weight: 1 },
      goldenage: { on: true, weight: 1 },
      shattering: { on: true, weight: 0 },
    },
  },
  settlements: { maxAlive: 130, popScale: 1, spacing: 64 },
  towns: {
    tiers: [
      { id: 'hamlet', label: 'Weiler', minPop: 0 },
      { id: 'village', label: 'Dorf', minPop: 150 },
      { id: 'market', label: 'Marktflecken', minPop: 800 },
      { id: 'town', label: 'Stadt', minPop: 3000 },
      { id: 'city', label: 'Großstadt', minPop: 12000 },
    ],
    peoplePerHouse: 40,
    maxBuildings: 600,
    wallTier: 3,
  },
  knowledge: {
    importance: 0.07,
    memory: { human: 0, elf: 0.15, orc: -0.1, synth: 0.2 },
    darkAgeLoss: 0.18,
    fallenLoss: 0.12,
    noise: 0.15,
  },
  game: { ruins: 60 },
};

/** Teil-Konfiguration (alles optional, auch verschachtelt). */
export type PartialConfig = { [K in keyof HistoryConfig]?: HistoryConfig[K] extends unknown[] ? HistoryConfig[K] : Partial<HistoryConfig[K]> | Record<string, unknown> };

const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

function merge<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return structuredClone(base);
  if (Array.isArray(base)) return (Array.isArray(over) ? structuredClone(over) : structuredClone(base)) as T;
  if (typeof base === 'object' && base !== null) {
    const out: Record<string, unknown> = structuredClone(base) as Record<string, unknown>;
    if (typeof over !== 'object') return out as T;
    for (const [k, v] of Object.entries(over as Record<string, unknown>)) out[k] = k in out ? merge(out[k], v) : structuredClone(v);
    return out as T;
  }
  return (typeof over === typeof base ? over : base) as T;
}

/** Vollständige, begrenzte Konfiguration aus einer Teil-Konfiguration. */
export function resolveConfig(partial: PartialConfig | undefined = {}): HistoryConfig {
  const c = merge(DEFAULT_CONFIG, partial);
  c.epochs = (c.epochs.length ? c.epochs : DEFAULT_CONFIG.epochs).slice(0, 8).map((e, i) => ({
    id: String(e.id ?? `e${i}`),
    label: String(e.label ?? `Zeitalter ${i + 1}`),
    years: Math.round(clamp(e.years, 10, 20000, 500)),
    step: Math.round(clamp(e.step, 1, 500, 1)),
    detail: Math.round(clamp(e.detail, 0, 3, 2)) as Detail,
    minImportance: Math.round(clamp(e.minImportance, 0, 5, 0)),
    clarity: clamp(e.clarity, 0, 1, 0.5),
  }));
  // Schritt höchstens so lang wie das Zeitalter
  for (const e of c.epochs) e.step = Math.min(e.step, e.years);
  // Die Gegenwart braucht Jahresschritte für ein lebendiges Ende
  c.civs.initial = Math.round(clamp(c.civs.initial, 1, 16, 6));
  c.civs.target = Math.round(clamp(c.civs.target, 1, 24, 9));
  c.civs.maxAlive = Math.round(clamp(c.civs.maxAlive, 6, 30, 14));
  if (!Object.values(c.civs.races).some(Boolean)) c.civs.races.human = true;
  for (const [id, s] of Object.entries(c.systems)) c.systems[id] = { on: s.on !== false, rate: clamp(s.rate, 0, 5, 1) };
  c.worldEvents.count = Math.round(clamp(c.worldEvents.count, 0, 20, 6));
  c.worldEvents.minGap = Math.round(clamp(c.worldEvents.minGap, 0, 3000, 350));
  for (const [id, d] of Object.entries(c.worldEvents.defs)) c.worldEvents.defs[id] = { on: d.on !== false, weight: clamp(d.weight, 0, 10, 1) };
  c.settlements.maxAlive = Math.round(clamp(c.settlements.maxAlive, 20, 400, 130));
  c.settlements.popScale = clamp(c.settlements.popScale, 0.05, 4, 1);
  c.settlements.spacing = Math.round(clamp(c.settlements.spacing, 44, 200, 64));
  c.towns.peoplePerHouse = clamp(c.towns.peoplePerHouse, 5, 500, 40);
  c.towns.maxBuildings = Math.round(clamp(c.towns.maxBuildings, 5, 1500, 600));
  c.towns.tiers = [...c.towns.tiers].sort((a, b) => a.minPop - b.minPop);
  c.towns.wallTier = Math.round(clamp(c.towns.wallTier, 0, c.towns.tiers.length, 3));
  c.game.ruins = Math.round(clamp(c.game.ruins, 0, 400, 60));
  return c;
}

/** Gesamtlänge der Vorgeschichte in Jahren. */
export const totalYears = (c: HistoryConfig) => c.epochs.reduce((s, e) => s + e.years, 0);

/** Nur die Abweichungen vom Standard (für kurze URLs). */
export function diffConfig(c: HistoryConfig, base: unknown = DEFAULT_CONFIG): PartialConfig | undefined {
  if (Array.isArray(c)) return JSON.stringify(c) === JSON.stringify(base) ? undefined : (c as unknown as PartialConfig);
  if (typeof c === 'object' && c !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(c)) {
      const d = diffConfig(v as HistoryConfig, (base as Record<string, unknown> | undefined)?.[k]);
      if (d !== undefined) out[k] = d;
    }
    return Object.keys(out).length ? (out as PartialConfig) : undefined;
  }
  return c === base ? undefined : (c as unknown as PartialConfig);
}

/** Konfiguration → kurzer URL-Wert (base64url von JSON der Abweichungen); leer = Standard. */
export function encodeConfig(c: HistoryConfig): string {
  const d = diffConfig(c);
  if (!d) return '';
  const bytes = new TextEncoder().encode(JSON.stringify(d));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeConfig(s: string | null | undefined): PartialConfig {
  if (!s) return {};
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const v = JSON.parse(new TextDecoder().decode(bytes));
    return typeof v === 'object' && v ? v : {};
  } catch {
    return {};
  }
}

/** Voreinstellungen für die Oberfläche (Teil-Konfigurationen über dem Standard). */
export const PRESETS: { id: string; label: string; config: PartialConfig }[] = [
  { id: 'standard', label: 'Standard (~7.900 Jahre)', config: {} },
  {
    id: 'short',
    label: 'Kurz (~1.200 Jahre, schnell)',
    config: {
      epochs: [
        { id: 'old', label: 'Altzeit', years: 600, step: 10, detail: 1, minImportance: 2, clarity: 0.5 },
        { id: 'new', label: 'Neuzeit', years: 500, step: 2, detail: 2, minImportance: 0, clarity: 0.8 },
        { id: 'recent', label: 'Jüngste Zeit', years: 100, step: 1, detail: 3, minImportance: 0, clarity: 1 },
      ],
      worldEvents: { count: 2 },
    },
  },
  {
    id: 'deep',
    label: 'Tiefe Zeit (~15.000 Jahre)',
    config: {
      epochs: [
        { id: 'myth', label: 'Urzeit', years: 8000, step: 200, detail: 0, minImportance: 4, clarity: 0.1 },
        { id: 'myth2', label: 'Mythenzeit', years: 4000, step: 50, detail: 0, minImportance: 3, clarity: 0.25 },
        { id: 'old', label: 'Altzeit', years: 2000, step: 10, detail: 1, minImportance: 2, clarity: 0.5 },
        { id: 'new', label: 'Neuzeit', years: 900, step: 2, detail: 2, minImportance: 0, clarity: 0.8 },
        { id: 'recent', label: 'Jüngste Zeit', years: 120, step: 1, detail: 3, minImportance: 0, clarity: 1 },
      ],
      worldEvents: { count: 10, minGap: 500 },
    },
  },
  { id: 'peace', label: 'Friedlich (wenig Krieg, große Städte)', config: { systems: { wars: { on: true, rate: 0.25 }, relations: { on: true, rate: 0.5 } }, settlements: { popScale: 1.6 } } },
  { id: 'chaos', label: 'Chaos (Krieg, Seuchen, Bestien)', config: { systems: { wars: { on: true, rate: 2.5 }, beasts: { on: true, rate: 2 }, disasters: { on: true, rate: 2.5 } }, worldEvents: { count: 9, minGap: 200 } } },
];
