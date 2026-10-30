/** Stufen, Erfahrung, Talente, Inventar und Endwerte des Helden. Rein, ohne Phaser. */
import type { EnemyKind } from '../combat/enemies';
import type { Appearance, Race } from '../character/lpc';
import type { Bonus, Item, Slot } from './items';
import { RACES } from './races';
import type { QuestLog } from '../quests/quests';

export type Talent = 'strength' | 'toughness' | 'agility';

export const TALENTS: Record<Talent, { name: string; desc: string }> = {
  strength: { name: 'Kraft', desc: '+3 Angriff' },
  toughness: { name: 'Zähigkeit', desc: '+15 LP' },
  agility: { name: 'Flinkheit', desc: '+6 % Tempo' },
};

export const INVENTORY_SIZE = 24;

export interface Hero {
  name?: string;
  race?: Race;
  /** Gewähltes Aussehen (Oberteil und Waffe bestimmt die Ausrüstung). */
  appearance?: Appearance;
  level: number;
  xp: number;
  talentPoints: number;
  talents: Record<Talent, number>;
  shards: number;
  potions: number;
  equipped: Partial<Record<Slot, Item>>;
  inventory: Item[];
  quests?: QuestLog;
  /** Geöffnete Truhen (IDs) */
  opened?: string[];
  /** Gefundene Chronik-Fragmente (Indizes) */
  chronicle?: number[];
  title?: string;
}

export function newHero(): Hero {
  return { level: 1, xp: 0, talentPoints: 0, talents: { strength: 0, toughness: 0, agility: 0 }, shards: 0, potions: 1, equipped: {}, inventory: [] };
}

/** EP, die für den Aufstieg von `level` auf `level + 1` nötig sind. */
export function xpToNext(level: number): number {
  return Math.round(20 * level ** 1.6);
}

const XP_BASE: Record<EnemyKind, number> = { slime: 6, wisp: 9, drone: 10, bandit: 12 };

export function xpForKill(kind: EnemyKind, level: number, race: Race = 'human'): number {
  return Math.round(XP_BASE[kind] * (1 + 0.5 * (level - 1)) * (1 + (RACES[race].bonus.xp ?? 0)));
}

/** Fügt EP hinzu; gibt die Anzahl der Aufstiege zurück. */
export function gainXp(h: Hero, amount: number): number {
  h.xp += amount;
  let ups = 0;
  while (h.xp >= xpToNext(h.level)) {
    h.xp -= xpToNext(h.level);
    h.level++;
    h.talentPoints++;
    ups++;
  }
  return ups;
}

export interface FinalStats {
  maxHp: number;
  attack: number;
  defense: number;
  /** Faktor auf die Laufgeschwindigkeit */
  speed: number;
  regen: number;
}

export function finalStats(h: Hero): FinalStats {
  const s: FinalStats = {
    maxHp: 100 + (h.level - 1) * 8 + h.talents.toughness * 15,
    attack: 14 + (h.level - 1) * 2 + h.talents.strength * 3,
    defense: 2 + (h.level - 1),
    speed: 1 + h.talents.agility * 0.06,
    regen: 3,
  };
  const rb = RACES[h.race ?? 'human'].bonus;
  s.maxHp += rb.hp ?? 0;
  s.defense += rb.defense ?? 0;
  s.speed += rb.speed ?? 0;
  for (const it of Object.values(h.equipped)) {
    if (!it) continue;
    const b: Bonus = it.bonus;
    s.maxHp += b.hp ?? 0;
    s.attack += b.attack ?? 0;
    s.defense += b.defense ?? 0;
    s.speed += (b.speed ?? 0) / 100;
    s.regen += b.regen ?? 0;
  }
  return s;
}

export function spendTalent(h: Hero, t: Talent): boolean {
  if (h.talentPoints <= 0) return false;
  h.talentPoints--;
  h.talents[t]++;
  return true;
}

export function addItem(h: Hero, item: Item): boolean {
  if (h.inventory.length >= INVENTORY_SIZE) return false;
  h.inventory.push(item);
  return true;
}

/** Legt einen Gegenstand aus dem Inventar an; der bisherige wandert ins Inventar. */
export function equip(h: Hero, itemId: string): boolean {
  const idx = h.inventory.findIndex((i) => i.id === itemId);
  if (idx < 0) return false;
  const item = h.inventory[idx];
  h.inventory.splice(idx, 1);
  const old = h.equipped[item.slot];
  if (old) h.inventory.push(old);
  h.equipped[item.slot] = item;
  return true;
}

export function unequip(h: Hero, slot: Slot): boolean {
  const it = h.equipped[slot];
  if (!it || h.inventory.length >= INVENTORY_SIZE) return false;
  delete h.equipped[slot];
  h.inventory.push(it);
  return true;
}

export function discard(h: Hero, itemId: string): boolean {
  const idx = h.inventory.findIndex((i) => i.id === itemId);
  if (idx < 0) return false;
  h.inventory.splice(idx, 1);
  return true;
}

/** Trinkt einen Heiltrank: heilt 50 % der maximalen LP. Gibt die neuen LP zurück. */
export function drinkPotion(h: Hero, hp: number, maxHp: number): number {
  if (h.potions <= 0 || hp >= maxHp) return hp;
  h.potions--;
  return Math.min(maxHp, hp + Math.round(maxHp * 0.5));
}
