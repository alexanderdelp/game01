/**
 * Ereignisarten der Vorgeschichte: Bezeichnung, Kategorie und Bedeutung. Rein.
 *
 * Neue Ereignisart: `EventKind` in `types.ts` ergänzen, hier eintragen (der Typ erzwingt es) und in `narrate.ts` einen
 * Text schreiben (ebenfalls erzwungen). Die Bedeutung entscheidet, ob das Ereignis in grob simulierten Zeitaltern
 * protokolliert wird (`EpochConfig.minImportance`), wie gut es überliefert ist und ob es in Listen hervorgehoben wird.
 */
import type { EventKind } from './types';

export type EventCategory = 'welt' | 'reich' | 'krieg' | 'ort' | 'figur' | 'artefakt' | 'bestie' | 'not';

export interface EventKindDef {
  label: string;
  category: EventCategory;
  /** 0 (Alltag) … 5 (weltbewegend) */
  importance: number;
}

export const EVENT_KINDS: Record<EventKind, EventKindDef> = {
  prehistory: { label: 'Vorzeit', category: 'welt', importance: 5 },
  world: { label: 'Weltereignis', category: 'welt', importance: 5 },
  shattering: { label: 'Zersplitterung', category: 'welt', importance: 5 },
  awaken: { label: 'Erwachen', category: 'reich', importance: 4 },
  civ_found: { label: 'Reichsgründung', category: 'reich', importance: 4 },
  civ_fall: { label: 'Untergang', category: 'reich', importance: 4 },
  split: { label: 'Spaltung', category: 'reich', importance: 3 },
  migrate: { label: 'Auszug', category: 'reich', importance: 4 },
  ruler: { label: 'Herrscherwechsel', category: 'reich', importance: 1 },
  alliance: { label: 'Bündnis', category: 'reich', importance: 2 },
  trade: { label: 'Handel', category: 'reich', importance: 1 },
  war: { label: 'Krieg', category: 'krieg', importance: 3 },
  peace: { label: 'Frieden', category: 'krieg', importance: 2 },
  battle: { label: 'Schlacht', category: 'krieg', importance: 2 },
  conquest: { label: 'Eroberung', category: 'krieg', importance: 3 },
  raze: { label: 'Zerstörung', category: 'krieg', importance: 3 },
  betrayal: { label: 'Verrat', category: 'krieg', importance: 3 },
  site_found: { label: 'Gründung', category: 'ort', importance: 1 },
  walls: { label: 'Mauerbau', category: 'ort', importance: 1 },
  abandon: { label: 'Aufgabe', category: 'ort', importance: 2 },
  sunk: { label: 'Versunken', category: 'ort', importance: 3 },
  plague: { label: 'Seuche', category: 'not', importance: 2 },
  famine: { label: 'Hungersnot', category: 'not', importance: 2 },
  birth: { label: 'Geburt', category: 'figur', importance: 0 },
  death: { label: 'Tod', category: 'figur', importance: 1 },
  burial: { label: 'Bestattung', category: 'figur', importance: 1 },
  hero_rise: { label: 'Held', category: 'figur', importance: 1 },
  hero_falls: { label: 'Held gefallen', category: 'bestie', importance: 2 },
  beast_arrive: { label: 'Bestie', category: 'bestie', importance: 3 },
  beast_raid: { label: 'Überfall', category: 'bestie', importance: 0 },
  beast_slain: { label: 'Bestie erschlagen', category: 'bestie', importance: 3 },
  artifact_made: { label: 'Artefakt', category: 'artefakt', importance: 3 },
  artifact_lost: { label: 'Artefakt verloren', category: 'artefakt', importance: 3 },
  artifact_loot: { label: 'Beute', category: 'artefakt', importance: 2 },
};

export const importanceOf = (k: EventKind) => EVENT_KINDS[k].importance;
