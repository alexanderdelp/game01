/** Gegenstände: Erzeugung, Seltenheit, Namen. Rein, ohne Phaser. */

/** Ausrüstungsplätze; `armor` ist der Oberkörper (Name aus älteren Spielständen beibehalten). */
export type Slot = 'weapon' | 'armor' | 'legs' | 'feet' | 'amulet';
export const SLOTS: Slot[] = ['weapon', 'armor', 'legs', 'feet', 'amulet'];
export const SLOT_NAME: Record<Slot, string> = { weapon: 'Waffe', armor: 'Oberkörper', legs: 'Beine', feet: 'Füße', amulet: 'Amulett' };
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
  /** Sichtbarer Schnitt (z. B. Hemd-Schnitt, Stiefel) – das Aussehen der Figur kommt aus der Ausrüstung (M23). */
  style?: string;
  /** Farbe (Stoff-/Lederpalette bzw. Metall bei Platten). */
  color?: string;
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
    { id: 'tunic', name: 'Hemd' },
    { id: 'leather', name: 'Lederrüstung' },
    { id: 'leather', name: 'Harnisch' },
    { id: 'plate', name: 'Plattenpanzer' },
  ],
  legs: [
    { id: 'pants', name: 'Hose' },
    { id: 'pants', name: 'Beinkleid' },
    { id: 'pants', name: 'Reithose' },
  ],
  feet: [
    { id: 'shoes', name: 'Schuhe' },
    { id: 'boots', name: 'Stiefel' },
    { id: 'boots', name: 'Wanderstiefel' },
  ],
  amulet: [
    { id: 'amulet', name: 'Amulett' },
    { id: 'amulet', name: 'Talisman' },
    { id: 'amulet', name: 'Chip-Anhänger' },
  ],
};

const PREFIX = ['Neon', 'Runen', 'Chrom', 'Mond', 'Glut', 'Sturm', 'Kristall', 'Schatten', 'Funken', 'Eisen'];
const SUFFIX = ['des Fuchses', 'der Wacht', 'des Nordens', 'der Ödnis', 'des Leuchtens', 'der Stille', 'des Drachen', 'der Maschine'];

/** Stofffarben für Kleidung (LPC-Stoffpalette). */
export const CLOTH_COLORS = ['teal', 'blue', 'navy', 'sky', 'forest', 'green', 'maroon', 'red', 'rose', 'purple', 'lavender', 'yellow', 'orange', 'brown', 'tan', 'white', 'gray', 'charcoal', 'black', 'leather', 'walnut'];
const SHOE_COLORS = ['brown', 'black', 'charcoal', 'walnut', 'leather', 'tan', 'maroon'];
const METAL_COLORS = ['silver', 'steel', 'iron', 'brass', 'bronze', 'copper', 'gold'];
/** Schnitte von Stoff-Oberteilen (passen sie nicht zum Körper, wird das Hemd gezeigt). */
const TUNIC_STYLES = ['shirt', 'vneck', 'scoop', 'blouse', 'corset'];

/** Erzeugt einen Gegenstand einer Stufe. */
export function generateItem(level: number, rnd: () => number, slot?: Slot, minRarity: Rarity = 'common'): Item {
  const s: Slot = slot ?? (['weapon', 'armor', 'legs', 'feet', 'amulet'] as const)[Math.floor(rnd() * 5)];
  const roll = rnd();
  let rarity: Rarity = roll < 0.08 ? 'epic' : roll < 0.3 ? 'rare' : 'common';
  if (minRarity === 'rare' && rarity === 'common') rarity = roll < 0.6 ? 'rare' : roll < 0.75 ? 'epic' : 'rare';
  if (minRarity === 'epic') rarity = 'epic';
  const mult = rarity === 'epic' ? 1.8 : rarity === 'rare' ? 1.35 : 1;
  const base = BASES[s][Math.floor(rnd() * BASES[s].length)];
  const v = (x: number) => Math.max(1, Math.round(x * mult * (0.85 + rnd() * 0.3)));
  const bonus: Bonus = {};
  if (s === 'weapon') {
    bonus.attack = v(3 + level * 2);
    if (rarity !== 'common') bonus.speed = Math.round(2 + rnd() * 4);
  } else if (s === 'armor') {
    bonus.defense = v((base.id === 'plate' ? 3 : base.id === 'leather' ? 2 : 1) + level);
    bonus.hp = v(4 + level * 3);
  } else if (s === 'legs') {
    bonus.defense = v(1 + level * 0.6);
    if (rarity !== 'common') bonus.hp = v(2 + level * 2);
  } else if (s === 'feet') {
    bonus.speed = Math.round((base.id === 'shoes' ? 3 : 1) + rnd() * 3 * mult);
    if (base.id === 'boots') bonus.defense = v(0.5 + level * 0.5);
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
  const item: Item = { id: `i${Math.floor(rnd() * 1e9).toString(36)}`, slot: s, base: base.id, name, rarity, level, bonus };
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
  if (base.id === 'tunic') Object.assign(item, { style: pick(TUNIC_STYLES), color: pick(CLOTH_COLORS) });
  else if (base.id === 'plate') item.color = pick(METAL_COLORS);
  else if (s === 'legs') item.color = pick(CLOTH_COLORS);
  else if (s === 'feet') item.color = pick(SHOE_COLORS);
  return item;
}

/** Startausrüstung je Volk: Dolch und Kleidung (gewöhnlich, Stufe 1). */
export function starterKit(race: string, body: 'male' | 'female'): Item[] {
  const it = (slot: Slot, base: string, name: string, color: string, bonus: Bonus, style?: string): Item => ({ id: `start-${race}-${slot}`, slot, base, name, rarity: 'common', level: 1, bonus, color, style });
  return [it('weapon', 'dagger', 'Alter Dolch', '', { attack: 1 }), ...starterClothes(race, body, it)];
}

function starterClothes(race: string, body: 'male' | 'female', it: (slot: Slot, base: string, name: string, color: string, bonus: Bonus, style?: string) => Item): Item[] {
  switch (race) {
    case 'elf':
      return [it('armor', 'tunic', 'Waldläufer-Tunika', 'forest', { defense: 1 }, body === 'female' ? 'scoop' : 'vneck'), it('legs', 'pants', 'Lederhose', 'walnut', { defense: 1 }), it('feet', 'boots', 'Weiche Stiefel', 'leather', { speed: 2 })];
    case 'orc':
      return [it('armor', 'leather', 'Fellweste', '', { defense: 2 }), it('legs', 'pants', 'Grobe Hose', 'brown', { defense: 1 }), it('feet', 'boots', 'Schwere Stiefel', 'black', { defense: 1 })];
    case 'synth':
      return [it('armor', 'plate', 'Grundpanzerung', 'silver', { defense: 1 })];
    default:
      return [it('armor', 'tunic', 'Leinenhemd', 'white', { defense: 1 }, 'shirt'), it('legs', 'pants', 'Leinenhose', 'tan', { defense: 1 }), it('feet', 'shoes', 'Schuhe', 'brown', { speed: 2 })];
  }
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

export type Drop = { type: 'shards'; amount: number } | { type: 'potion' } | { type: 'item'; item: Item } | { type: 'quest'; questId: string; name: string };

/** Beute eines besiegten Gegners. */
export function rollDrops(level: number, rnd: () => number): Drop[] {
  const drops: Drop[] = [];
  drops.push({ type: 'shards', amount: 1 + Math.floor(rnd() * (2 + level * 2)) });
  if (rnd() < 0.15) drops.push({ type: 'potion' });
  if (rnd() < 0.25) drops.push({ type: 'item', item: generateItem(level, rnd) });
  return drops;
}
