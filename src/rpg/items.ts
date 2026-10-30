/** Gegenstände: Erzeugung, Seltenheit, Namen. Rein, ohne Phaser. */

export type Slot = 'weapon' | 'armor' | 'amulet';
export type Rarity = 'common' | 'rare' | 'epic';

export interface Bonus {
  attack?: number;
  defense?: number;
  hp?: number;
  /** Tempo in Prozent */
  speed?: number;
  /** LP pro Sekunde zusätzlich */
  regen?: number;
}

export interface Item {
  id: string;
  slot: Slot;
  /** Grundtyp, z. B. "dagger", "tunic", "leather", "amulet" */
  base: string;
  name: string;
  rarity: Rarity;
  level: number;
  bonus: Bonus;
}

export const RARITY_COLOR: Record<Rarity, string> = { common: '#f4f0e8', rare: '#5aa8ff', epic: '#c47aff' };
export const RARITY_NAME: Record<Rarity, string> = { common: 'gewöhnlich', rare: 'selten', epic: 'episch' };

const BASES: Record<Slot, { id: string; name: string }[]> = {
  weapon: [
    { id: 'dagger', name: 'Dolch' },
    { id: 'dagger', name: 'Klinge' },
    { id: 'dagger', name: 'Messer' },
  ],
  armor: [
    { id: 'tunic', name: 'Tunika' },
    { id: 'leather', name: 'Lederrüstung' },
    { id: 'leather', name: 'Harnisch' },
  ],
  amulet: [
    { id: 'amulet', name: 'Amulett' },
    { id: 'amulet', name: 'Talisman' },
    { id: 'amulet', name: 'Chip-Anhänger' },
  ],
};

const PREFIX = ['Neon', 'Runen', 'Chrom', 'Mond', 'Glut', 'Sturm', 'Kristall', 'Schatten', 'Funken', 'Eisen'];
const SUFFIX = ['des Fuchses', 'der Wacht', 'des Nordens', 'der Ödnis', 'des Leuchtens', 'der Stille', 'des Drachen', 'der Maschine'];

/** Erzeugt einen Gegenstand einer Stufe. */
export function generateItem(level: number, rnd: () => number, slot?: Slot): Item {
  const s: Slot = slot ?? (['weapon', 'armor', 'amulet'] as const)[Math.floor(rnd() * 3)];
  const roll = rnd();
  const rarity: Rarity = roll < 0.08 ? 'epic' : roll < 0.3 ? 'rare' : 'common';
  const mult = rarity === 'epic' ? 1.8 : rarity === 'rare' ? 1.35 : 1;
  const base = BASES[s][Math.floor(rnd() * BASES[s].length)];
  const v = (x: number) => Math.max(1, Math.round(x * mult * (0.85 + rnd() * 0.3)));
  const bonus: Bonus = {};
  if (s === 'weapon') {
    bonus.attack = v(3 + level * 2);
    if (rarity !== 'common') bonus.speed = Math.round(2 + rnd() * 4);
  } else if (s === 'armor') {
    bonus.defense = v((base.id === 'leather' ? 2 : 1) + level);
    bonus.hp = v(4 + level * 3);
  } else {
    const k = Math.floor(rnd() * 3);
    if (k === 0) bonus.hp = v(6 + level * 3);
    if (k === 1) bonus.speed = Math.round(4 + rnd() * 4 * mult);
    if (k === 2) bonus.regen = Math.round((1 + level * 0.3) * mult * 10) / 10;
    if (rarity === 'epic') bonus.attack = v(1 + level);
  }
  let name = base.name;
  if (rarity !== 'common') name = `${PREFIX[Math.floor(rnd() * PREFIX.length)]}-${name}`;
  if (rarity === 'epic') name = `${name} ${SUFFIX[Math.floor(rnd() * SUFFIX.length)]}`;
  return { id: `i${Math.floor(rnd() * 1e9).toString(36)}`, slot: s, base: base.id, name, rarity, level, bonus };
}

export function describeBonus(b: Bonus): string {
  const parts: string[] = [];
  if (b.attack) parts.push(`+${b.attack} Angriff`);
  if (b.defense) parts.push(`+${b.defense} Vert.`);
  if (b.hp) parts.push(`+${b.hp} LP`);
  if (b.speed) parts.push(`+${b.speed}% Tempo`);
  if (b.regen) parts.push(`+${b.regen} LP/s`);
  return parts.join(', ');
}

export type Drop = { type: 'shards'; amount: number } | { type: 'potion' } | { type: 'item'; item: Item };

/** Beute eines besiegten Gegners. */
export function rollDrops(level: number, rnd: () => number): Drop[] {
  const drops: Drop[] = [];
  if (rnd() < 0.9) drops.push({ type: 'shards', amount: 1 + Math.floor(rnd() * (2 + level * 2)) });
  if (rnd() < 0.15) drops.push({ type: 'potion' });
  if (rnd() < 0.25) drops.push({ type: 'item', item: generateItem(level, rnd) });
  return drops;
}
