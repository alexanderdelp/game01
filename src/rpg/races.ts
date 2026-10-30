/** Völker: Aussehen-Optionen und Boni. */
import type { Race } from '../character/lpc';

export interface RaceDef {
  id: Race;
  name: string;
  desc: string;
  skins: string[];
  bonus: { hp?: number; defense?: number; speed?: number; xp?: number };
}

const NATURAL = ['light', 'amber', 'olive', 'taupe', 'bronze', 'brown', 'black'];

export const RACES: Record<Race, RaceDef> = {
  human: { id: 'human', name: 'Mensch', desc: 'Anpassungsfähig: +10 % Erfahrung', skins: NATURAL, bonus: { xp: 0.1 } },
  elf: { id: 'elf', name: 'Elf', desc: 'Leichtfüßig: +8 % Tempo', skins: ['light', 'amber', 'olive', 'taupe', 'bronze', 'lavender', 'pale_green'], bonus: { speed: 0.08 } },
  orc: { id: 'orc', name: 'Ork', desc: 'Zäh: +20 LP', skins: ['green', 'dark_green', 'bright_green', 'olive', 'taupe', 'brown'], bonus: { hp: 20 } },
  synth: { id: 'synth', name: 'Synth', desc: 'Halb Maschine: +3 Verteidigung', skins: ['fur_grey', 'blue', 'lavender', 'fur_white', 'fur_black', 'zombie'], bonus: { defense: 3 } },
};

export const RACE_ORDER: Race[] = ['human', 'elf', 'orc', 'synth'];
