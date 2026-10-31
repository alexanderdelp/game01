/**
 * Waffenwahl der Kampf-Arena (M25). Es gibt bisher nur den Waffentyp Dolch; die Varianten kommen aus derselben
 * Erzeugung wie im Spiel (`generateItem`), die Endwerte aus derselben Rechnung wie das Heldenfenster (`finalStats`).
 */
import { finalStats, newHero, type FinalStats } from '../rpg/progression';
import { generateItem, starterKit, type Item, type Rarity, type Slot } from '../rpg/items';
import type { Race } from '../character/lpc';
import { mulberry32 } from '../world/rng';

export type WeaponChoice = 'none' | 'starter' | Rarity;
export const WEAPON_CHOICES: { id: WeaponChoice; name: string }[] = [
  { id: 'none', name: 'ohne Waffe' },
  { id: 'starter', name: 'Alter Dolch' },
  { id: 'common', name: 'Dolch (gewöhnlich)' },
  { id: 'rare', name: 'Dolch (selten)' },
  { id: 'epic', name: 'Dolch (episch)' },
];

/** Waffe einer Wahl; Varianten je Stufe und Seltenheit immer gleich (fester Zufall), damit Vergleiche fair sind. */
export function arenaWeapon(choice: WeaponChoice, level: number, race: string = 'human'): Item | undefined {
  if (choice === 'none') return undefined;
  if (choice === 'starter') return starterKit(race, 'male').find((i) => i.slot === 'weapon');
  // generateItem würfelt die Seltenheit nur ab einer Mindeststufe aus → so lange, bis sie genau passt
  for (let s = 1; ; s++) {
    const it = generateItem(level, mulberry32(level * 7919 + s), 'weapon', choice);
    if (it.rarity === choice) return { ...it, id: `arena-${choice}-${level}` };
  }
}

/** Endwerte des Arena-Helden (Stufe 1, ohne Talente) mit der übrigen Ausrüstung und der gewählten Waffe. */
export function arenaHeroStats(race: Race, equipped: Partial<Record<Slot, Item>>, weapon: Item | undefined): FinalStats {
  return finalStats({ ...newHero(), race, equipped: { ...equipped, weapon } });
}
