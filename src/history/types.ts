/** Datenmodell der Vorgeschichte. Alles über Zahl-IDs verknüpft (Index im jeweiligen Feld). Rein, ohne Phaser. */
import type { Faction } from '../world/meta';
import type { HistoryConfig } from './config';
import type { Knowledge } from './knowledge';
import type { Epoch } from './timeline';

export type Race = 'human' | 'elf' | 'orc' | 'synth';

export const RACE_NAMES: Record<Race, { one: string; many: string }> = {
  human: { one: 'Mensch', many: 'Menschen' },
  elf: { one: 'Elf', many: 'Elfen' },
  orc: { one: 'Ork', many: 'Orks' },
  synth: { one: 'Synth', many: 'Synths' },
};

/** Grobe Zelle der Weltkarte (HISTORY_CELL × HISTORY_CELL Kacheln). */
export interface Cell {
  land: boolean;
  biome: number;
  /** Höhe über dem Meer (0–1). */
  h: number;
  coast: boolean;
  river: boolean;
  /** Ressourcen 0–1 */
  fert: number;
  wood: number;
  ore: number;
  /** Splitter-Ader (Kristallenergie) */
  shard: number;
  /** Schrott der Ersten Maschinen (Vorzeit) */
  scrap: number;
}

export type SiteKind =
  | 'city' | 'village' | 'fortress' | 'tower' | 'lab' | 'temple' | 'mine'
  | 'tomb' | 'battlefield' | 'lair' | 'crater' | 'relic';

/** Orte, die bewohnt sind (werden im Spiel zu Siedlungen bzw. nach Zerstörung zu Ruinen). */
export const INHABITED: ReadonlySet<SiteKind> = new Set(['city', 'village', 'fortress', 'tower', 'lab', 'temple', 'mine']);

export interface Site {
  id: number;
  kind: SiteKind;
  name: string;
  tx: number;
  ty: number;
  founded: number;
  /** Besitzer im Zeitverlauf (aufsteigend nach Jahr); civ -1 = niemand */
  owners: { y: number; civ: number }[];
  /** Jahr der Zerstörung bzw. Aufgabe (bewohnte Orte) */
  destroyed?: number;
  /** Ereignis, das den Ort zerstört hat */
  fall?: number;
  pop: number;
  /** Ereignisse, die hier spielten */
  events: number[];
  /** Artefakte, die am Ende hier liegen */
  arts: number[];
  /** Hier begrabene Figuren (Gräber) */
  buried: number[];
  /** Bestie eines Horts */
  beast?: number;
  /** Höchststand der Bevölkerung (Blütezeit) */
  peak: { pop: number; y: number };
  /** Jahr des Mauerbaus */
  walls?: number;
  /** Auf den Resten dieses älteren Ortes erbaut */
  on?: number;
  /** Jüngere Orte, die auf diesem stehen */
  under?: number[];
  /** Im Meer versunken (Große Flut) */
  sunk?: boolean;
}

export interface Civ {
  id: number;
  name: string;
  race: Race;
  faction: Faction;
  color: number;
  founded: number;
  fell?: number;
  /** Hauptstadt (Site-ID), aktuell bzw. zuletzt */
  capital: number;
  /** abgespalten von */
  parent?: number;
  rulers: number[];
  events: number[];
  /** Beziehung zu anderen Reichen (−100 … 100) */
  opinion: Record<number, number>;
}

export type Role = 'ruler' | 'hero' | 'mage' | 'engineer' | 'traitor' | 'beast' | 'priest';

export type DeathCause = 'age' | 'battle' | 'beast' | 'plague' | 'shattering' | 'slain' | 'murder' | 'cataclysm';

export interface Figure {
  id: number;
  name: string;
  race: Race | 'beast';
  female: boolean;
  role: Role;
  civ: number;
  born: number;
  died?: number;
  cause?: DeathCause;
  killer?: number;
  deathSite?: number;
  parent?: number;
  children: number[];
  /** Ämter: Herrscher von Reich … */
  offices: { civ: number; from: number; to?: number }[];
  events: number[];
  /** Artefakte, die die Figur gerade trägt */
  holds: number[];
  /** Bestien: Art und Hort */
  beastKind?: number;
  lair?: number;
  kills: number;
}

export interface Artifact {
  id: number;
  name: string;
  /** Art (Schwert, Krone, …) */
  kind: number;
  maker: number;
  made: number;
  /** Besitzerkette: Figur und Jahr, wie erhalten */
  holders: { fig: number; y: number; how: 'made' | 'gift' | 'inherit' | 'loot' | 'found' }[];
  /** Verbleib am Ende: Figur oder Ort */
  heldBy?: number;
  site?: number;
  lost?: { y: number; how: 'buried' | 'battle' | 'hoard' | 'ruin' | 'shattering' | 'sunk' };
  /** Das große Artefakt der Zersplitterung */
  great?: boolean;
}

export type EventKind =
  | 'prehistory' | 'awaken' | 'civ_found' | 'site_found' | 'ruler' | 'death' | 'birth'
  | 'war' | 'peace' | 'alliance' | 'battle' | 'conquest' | 'raze' | 'betrayal' | 'split' | 'civ_fall'
  | 'plague' | 'famine' | 'abandon' | 'beast_arrive' | 'beast_raid' | 'beast_slain' | 'hero_falls'
  | 'artifact_made' | 'artifact_lost' | 'artifact_loot' | 'burial' | 'trade' | 'shattering' | 'hero_rise'
  /** Weltereignis: `cause` = ID der Definition, `n` = 0 Beginn, 1 Ende */
  | 'world' | 'migrate' | 'sunk' | 'walls';

export interface HEvent {
  id: number;
  y: number;
  k: EventKind;
  civs: number[];
  figs: number[];
  sites: number[];
  arts: number[];
  /** Zusätzliche Angaben (Opferzahl, Sieger, Ursache …) */
  n?: number;
  win?: number;
  cause?: string;
}

/** Ein Weltereignis, wie es in dieser Geschichte stattfand. */
export interface WorldRun {
  def: string;
  from: number;
  /** Ende (ausschließlich); gleich `from` bei einem Augenblicksereignis */
  to: number;
  /** Ereignis-IDs von Beginn und Ende */
  events: number[];
  /** Hauptschauplatz (Ort) */
  site?: number;
}

export interface History {
  seed: number;
  /** Gesamtlänge in Jahren (= Jahr der Gegenwart) */
  years: number;
  config: HistoryConfig;
  epochs: Epoch[];
  worldRuns: WorldRun[];
  /** Was heute überliefert ist (aus `knowledge.ts`) */
  knowledge: Knowledge;
  worldName: string;
  /** Jahr der Zersplitterung */
  shattering: number;
  cells: Cell[];
  civs: Civ[];
  sites: Site[];
  figures: Figure[];
  artifacts: Artifact[];
  events: HEvent[];
  /** Flusskacheln (wie im Spiel) */
  rivers: Set<number>;
  /** Laufzeit der Erzeugung in ms */
  ms: number;
}

/** Zellen je Seite und Kacheln je Zelle. */
export const HISTORY_GRID = 128;
export const HISTORY_CELL = 64;
