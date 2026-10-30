/** Biom-Definitionen. Die numerische ID wird in Chunk-Daten (Uint8Array) gespeichert. */

export enum B {
  DeepOcean = 0,
  Ocean = 1,
  Beach = 2,
  Grassland = 3,
  Forest = 4,
  Jungle = 5,
  Swamp = 6,
  Savanna = 7,
  Desert = 8,
  Tundra = 9,
  Snow = 10,
  Mountain = 11,
  Peak = 12,
  CrystalGrove = 13,
  ScrapWastes = 14,
}

export type DecorKind =
  | 'oak' | 'pine' | 'snowpine' | 'palm' | 'cactus' | 'deadtree' | 'bush' | 'flowers'
  | 'rock' | 'boulder' | 'reeds' | 'crystal' | 'scrap' | 'pylon' | 'tuft'
  | 'house' | 'tower' | 'neonhouse' | 'stall' | 'well' | 'chest' | 'shrine' | 'obelisk';

/** Von Menschen gebaute Dekorationen (werden nicht gespiegelt). */
export const BUILT = new Set<DecorKind>(['house', 'tower', 'neonhouse', 'stall', 'well', 'chest', 'shrine', 'obelisk']);

export interface DecorRule {
  kind: DecorKind;
  /** Wahrscheinlichkeit pro Kachel. */
  density: number;
}

export interface BiomeDef {
  id: B;
  name: string;
  walkable: boolean;
  /** Farbpalette für die prozedurale Bodentextur: [dunkel, mittel, hell, Akzent]. */
  palette: [number, number, number, number];
  /** Farbe auf der Weltkarte. */
  mapColor: number;
  decor: DecorRule[];
}

const def = (
  id: B, name: string, walkable: boolean, palette: BiomeDef['palette'], mapColor: number, decor: DecorRule[] = [],
): BiomeDef => ({ id, name, walkable, palette, mapColor, decor });

export const BIOMES: readonly BiomeDef[] = [
  def(B.DeepOcean, 'Tiefsee', false, [0x16285a, 0x1b3170, 0x223b80, 0x2b4a94], 0x172a5c),
  def(B.Ocean, 'Meer', false, [0x24529a, 0x2a5fae, 0x3170bf, 0x5a95d8], 0x2b5fae),
  def(B.Beach, 'Strand', true, [0xd8c48a, 0xe4d29a, 0xeedfae, 0xc7ae72], 0xe2cf96, [
    { kind: 'palm', density: 0.012 }, { kind: 'rock', density: 0.01 },
  ]),
  def(B.Grassland, 'Grasland', true, [0x4f9a3a, 0x5cab44, 0x6cbc4f, 0x8fd161], 0x62b04a, [
    { kind: 'tuft', density: 0.08 }, { kind: 'flowers', density: 0.03 }, { kind: 'bush', density: 0.015 },
    { kind: 'oak', density: 0.012 }, { kind: 'rock', density: 0.006 },
  ]),
  def(B.Forest, 'Wald', true, [0x2f6e2c, 0x377d33, 0x41903a, 0x5ba54c], 0x357a31, [
    { kind: 'oak', density: 0.16 }, { kind: 'pine', density: 0.06 }, { kind: 'bush', density: 0.04 }, { kind: 'tuft', density: 0.05 },
  ]),
  def(B.Jungle, 'Dschungel', true, [0x1f6a3a, 0x257b44, 0x2d8e4f, 0x3fa862], 0x23763f, [
    { kind: 'palm', density: 0.12 }, { kind: 'oak', density: 0.08 }, { kind: 'bush', density: 0.1 }, { kind: 'flowers', density: 0.03 },
  ]),
  def(B.Swamp, 'Sumpf', true, [0x3d5a3a, 0x466844, 0x51754d, 0x6b8f5a], 0x4a6a46, [
    { kind: 'reeds', density: 0.12 }, { kind: 'deadtree', density: 0.03 }, { kind: 'bush', density: 0.03 },
  ]),
  def(B.Savanna, 'Savanne', true, [0xa49a45, 0xb4aa4f, 0xc4ba5c, 0x8e8a3a], 0xb6ab50, [
    { kind: 'tuft', density: 0.1 }, { kind: 'oak', density: 0.008 }, { kind: 'bush', density: 0.02 }, { kind: 'rock', density: 0.008 },
  ]),
  def(B.Desert, 'Wüste', true, [0xd6a85e, 0xe0b46a, 0xeac27a, 0xc89650], 0xe0b26a, [
    { kind: 'cactus', density: 0.018 }, { kind: 'rock', density: 0.012 }, { kind: 'deadtree', density: 0.004 },
  ]),
  def(B.Tundra, 'Tundra', true, [0x7d8a72, 0x8a977e, 0x98a48b, 0xb5bfa9], 0x8d9a80, [
    { kind: 'rock', density: 0.03 }, { kind: 'snowpine', density: 0.03 }, { kind: 'tuft', density: 0.04 },
  ]),
  def(B.Snow, 'Schneefeld', true, [0xd6e0ea, 0xe2eaf2, 0xeef3f8, 0xbccbdb], 0xe6edf4, [
    { kind: 'snowpine', density: 0.04 }, { kind: 'boulder', density: 0.01 },
  ]),
  def(B.Mountain, 'Gebirge', true, [0x6e655c, 0x7c7268, 0x8a8076, 0x5a524a], 0x7a7066, [
    { kind: 'boulder', density: 0.06 }, { kind: 'rock', density: 0.06 }, { kind: 'pine', density: 0.02 },
  ]),
  def(B.Peak, 'Felsgipfel', false, [0x8c8c94, 0x9c9ca4, 0xb4b4bc, 0xe8eef4], 0xb0b0b8),
  def(B.CrystalGrove, 'Kristallhain', true, [0x4b3a7a, 0x56438a, 0x634f9c, 0x9b7fe0], 0x6a4fb0, [
    { kind: 'crystal', density: 0.07 }, { kind: 'tuft', density: 0.05 }, { kind: 'flowers', density: 0.03 },
  ]),
  def(B.ScrapWastes, 'Schrottödnis', true, [0x4a4440, 0x56504a, 0x625a52, 0x2fd0c8], 0x5a5048, [
    { kind: 'scrap', density: 0.06 }, { kind: 'pylon', density: 0.008 }, { kind: 'rock', density: 0.02 },
  ]),
];

export function biome(id: number): BiomeDef {
  return BIOMES[id];
}

/** Geschwindigkeitsfaktor zu Fuß je Biom. */
export const BIOME_SPEED: Record<B, number> = {
  [B.DeepOcean]: 0, [B.Ocean]: 0, [B.Beach]: 1, [B.Grassland]: 1, [B.Forest]: 0.95, [B.Jungle]: 0.8,
  [B.Swamp]: 0.65, [B.Savanna]: 1, [B.Desert]: 0.85, [B.Tundra]: 0.9, [B.Snow]: 0.75, [B.Mountain]: 0.75,
  [B.Peak]: 0, [B.CrystalGrove]: 1, [B.ScrapWastes]: 0.9,
};

/** Kollisionsbox (Breite, Höhe in px) am Fuß blockierender Dekorationen. */
export const DECOR_BLOCK: Partial<Record<DecorKind, { w: number; h: number }>> = {
  oak: { w: 12, h: 8 }, pine: { w: 10, h: 8 }, snowpine: { w: 10, h: 8 }, palm: { w: 10, h: 7 },
  cactus: { w: 10, h: 7 }, deadtree: { w: 10, h: 6 }, boulder: { w: 32, h: 14 }, crystal: { w: 20, h: 8 },
  scrap: { w: 32, h: 10 }, pylon: { w: 10, h: 6 }, bush: { w: 22, h: 8 },
  house: { w: 60, h: 22 }, tower: { w: 40, h: 22 }, neonhouse: { w: 60, h: 22 }, stall: { w: 44, h: 12 }, well: { w: 28, h: 14 },
  chest: { w: 20, h: 8 }, shrine: { w: 28, h: 12 }, obelisk: { w: 20, h: 10 },
};
