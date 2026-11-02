import type { Linker } from '../narrate';
import type { ActiveRun, Sim } from '../simulate';
import type { HEvent, History, WorldRun } from '../types';

/** Größen, die Weltereignisse verstärken (> 1) oder dämpfen (< 1), solange sie andauern. */
export type ModKey = 'growth' | 'war' | 'plague' | 'famine' | 'beasts' | 'trade' | 'founding' | 'mages';

export const MOD_LABELS: Record<ModKey, string> = {
  growth: 'Wachstum', war: 'Krieg', plague: 'Seuchen', famine: 'Hunger', beasts: 'Bestien', trade: 'Handel', founding: 'Gründungen', mages: 'Magier',
};

/** Bezüge, die ein Weltereignis zu Beginn liefert (gehen ins Protokoll). */
export interface WorldRefs {
  sites?: number[];
  civs?: number[];
  figs?: number[];
}

export interface WorldEventDef {
  /** Schlüssel in `config.worldEvents.defs` */
  id: string;
  label: string;
  /** Ein Satz für Oberfläche und Dokumentation */
  summary: string;
  /** In Zeitaltern dieser Detailstufen darf es beginnen */
  details: number[];
  /** Fest so viele Jahre vor der Gegenwart (Ende des Ereignisses), statt zufällig */
  fixedAgo?: [number, number];
  /** Dauer in Jahren [von, bis]; 0 = Augenblick */
  duration: [number, number];
  /** Darf mehrmals vorkommen */
  repeat?: boolean;
  /** Löscht Wissen: Überlieferung von allem davor wird schlechter */
  darkAge?: boolean;
  /** Eigene Ereignisse statt der allgemeinen Beginn/Ende-Einträge */
  silent?: boolean;
  mods?: Partial<Record<ModKey, number>>;
  /** Faktor auf die Fruchtbarkeit einer Zelle, solange es andauert */
  fertility?(sim: Sim, cx: number, cy: number): number;
  start?(sim: Sim, a: ActiveRun): WorldRefs | void;
  step?(sim: Sim, a: ActiveRun): void;
  end?(sim: Sim, a: ActiveRun): void;
  /** Text zu Beginn (`e.n` 0) und Ende (`e.n` 1) */
  text(h: History, e: HEvent, L: Linker, run?: WorldRun): string;
}
