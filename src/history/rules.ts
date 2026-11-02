/** Grundregeln der Vorgeschichte: Vorlieben der Völker, Lebensdauer, Böden. Rein. */
import { B } from '../world/biomes';
import type { Faction } from '../world/meta';
import type { Race } from './types';

/** Mindestens so viele Reiche überleben (das Spiel braucht sechs). */
export const MIN_CIVS = 6;

export const CIV_COLORS = [0xe0b030, 0x2fe0d8, 0xe04a5a, 0x9b6af0, 0x4cb53e, 0xf08a3a, 0x5a8ae0, 0xe070c0, 0xa0d040, 0xc0c0c0, 0x40a0a0, 0xd06040];

/** Wie gut ein Volk in einem Biom lebt (0–1). */
export const PREF: Record<Race, Partial<Record<B, number>>> = {
  human: { [B.Grassland]: 1, [B.Forest]: 0.8, [B.Savanna]: 0.7, [B.Hills]: 0.6, [B.Beach]: 0.5, [B.Tundra]: 0.3 },
  elf: { [B.Forest]: 1, [B.Jungle]: 0.9, [B.CrystalGrove]: 1, [B.Grassland]: 0.4, [B.Swamp]: 0.3 },
  orc: { [B.Hills]: 1, [B.Savanna]: 0.9, [B.Desert]: 0.6, [B.Tundra]: 0.6, [B.Grassland]: 0.4, [B.Mountain]: 0.3 },
  synth: { [B.ScrapWastes]: 1, [B.Desert]: 0.4, [B.Grassland]: 0.3 },
};
/** Fraktionen, die ein Volk bevorzugt gründet. */
export const RACE_FACTIONS: Record<Race, Faction[]> = {
  human: ['order', 'traders', 'techno', 'clan', 'mages'],
  elf: ['mages', 'mages', 'order', 'traders'],
  orc: ['clan', 'clan', 'traders'],
  synth: ['techno'],
};
export const LIFESPAN: Record<Race, [number, number]> = { human: [50, 85], elf: [160, 320], orc: [40, 70], synth: [120, 260] };
export const FERT: Partial<Record<B, number>> = {
  [B.Grassland]: 0.8, [B.Forest]: 0.6, [B.Savanna]: 0.6, [B.Jungle]: 0.5, [B.Hills]: 0.5, [B.Swamp]: 0.3, [B.Beach]: 0.4,
  [B.Tundra]: 0.2, [B.Desert]: 0.1, [B.Snow]: 0.05, [B.CrystalGrove]: 0.5, [B.ScrapWastes]: 0.15, [B.Mountain]: 0.1,
};
export const WOOD: Partial<Record<B, number>> = { [B.Forest]: 0.9, [B.Jungle]: 1, [B.Swamp]: 0.5, [B.Tundra]: 0.4, [B.Grassland]: 0.2, [B.Savanna]: 0.2, [B.Hills]: 0.3 };
export const ORE: Partial<Record<B, number>> = { [B.Mountain]: 0.9, [B.Snow]: 0.5, [B.Hills]: 0.6, [B.Desert]: 0.3, [B.Tundra]: 0.2 };
