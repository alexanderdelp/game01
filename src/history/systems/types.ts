import type { Sim } from '../simulate';

export interface HistorySystem {
  /** Schlüssel in `config.systems` */
  id: string;
  label: string;
  /** Ein Satz für Oberfläche und Dokumentation */
  summary: string;
  /** Läuft erst ab dieser Detailstufe des Zeitalters (Standard: immer) */
  minDetail?: number;
  step(sim: Sim): void;
}
