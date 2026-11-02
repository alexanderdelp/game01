/**
 * Systeme der Vorgeschichte: Sie laufen in jedem Schritt in dieser Reihenfolge.
 *
 * Neues System: Datei mit einem `HistorySystem` anlegen, hier eintragen und in `config.ts` (`systems`) mit
 * `{ on: true, rate: 1 }` vorbelegen. In `step` gilt: `sim.dt` ist die Schrittlänge in Jahren, Wahrscheinlichkeiten
 * je Jahr über `sim.chance(p)`, die eigene Stärke über `sim.rate(id)`, Weltereignisse über `sim.mod(key)`.
 */
import { beasts } from './beasts';
import { decline } from './decline';
import { disasters } from './disasters';
import { emergence } from './emergence';
import { figures } from './figures';
import { growth } from './growth';
import { relations } from './relations';
import { trade } from './trade';
import type { HistorySystem } from './types';
import { wars } from './wars';

export type { HistorySystem } from './types';

export const SYSTEMS: HistorySystem[] = [emergence, figures, growth, trade, relations, wars, beasts, disasters, decline];
