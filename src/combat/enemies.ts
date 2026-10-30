/** Gegnerarten und seed-basiertes Auftreten. Rein, ohne Phaser. */
import { B, BIOMES, DECOR_BLOCK } from '../world/biomes';
import { hash2, mulberry32 } from '../world/rng';
import { CHUNK_TILES, type WorldGen } from '../world/WorldGen';
import { levelForDistance } from './combat';

export type EnemyKind = 'slime' | 'bandit' | 'drone' | 'wisp';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  base: { hp: number; attack: number; defense: number };
  speed: number;
  /** Ab dieser Entfernung (px) wird verfolgt. */
  aggro: number;
  /** Fliegt (ignoriert Hindernisse und Gelände). */
  flying: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  slime: { kind: 'slime', name: 'Schleim', base: { hp: 24, attack: 8, defense: 0 }, speed: 45, aggro: 150, flying: false },
  bandit: { kind: 'bandit', name: 'Räuber', base: { hp: 40, attack: 12, defense: 2 }, speed: 70, aggro: 190, flying: false },
  drone: { kind: 'drone', name: 'Drohne', base: { hp: 30, attack: 10, defense: 3 }, speed: 60, aggro: 230, flying: true },
  wisp: { kind: 'wisp', name: 'Irrlicht', base: { hp: 22, attack: 11, defense: 0 }, speed: 55, aggro: 200, flying: true },
};

/** Schleimfarbe je Biom (Index in die Farbpaletten der Kreaturen). */
export const SLIME_COLOR: Partial<Record<B, number>> = {
  [B.Grassland]: 0, [B.Forest]: 0, [B.Jungle]: 4, [B.Swamp]: 2, [B.Desert]: 3, [B.Savanna]: 3, [B.Snow]: 1, [B.Tundra]: 1, [B.Beach]: 3,
};

const BIOME_ENEMIES: Partial<Record<B, { chance: number; kinds: EnemyKind[] }>> = {
  [B.Grassland]: { chance: 0.35, kinds: ['slime', 'slime', 'bandit'] },
  [B.Forest]: { chance: 0.45, kinds: ['slime', 'bandit'] },
  [B.Jungle]: { chance: 0.5, kinds: ['slime', 'wisp'] },
  [B.Swamp]: { chance: 0.55, kinds: ['slime', 'wisp'] },
  [B.Savanna]: { chance: 0.4, kinds: ['bandit', 'slime'] },
  [B.Desert]: { chance: 0.4, kinds: ['slime', 'bandit'] },
  [B.Tundra]: { chance: 0.35, kinds: ['wisp', 'slime'] },
  [B.Snow]: { chance: 0.3, kinds: ['slime', 'wisp'] },
  [B.Mountain]: { chance: 0.35, kinds: ['drone', 'bandit'] },
  [B.Beach]: { chance: 0.2, kinds: ['slime'] },
  [B.CrystalGrove]: { chance: 0.6, kinds: ['wisp', 'wisp', 'slime'] },
  [B.ScrapWastes]: { chance: 0.65, kinds: ['drone', 'drone', 'bandit'] },
};

export const SAFE_RADIUS = 16;

export interface EnemySpawn {
  id: string;
  kind: EnemyKind;
  tx: number;
  ty: number;
  level: number;
  /** Farbvariante (Schleime). */
  color: number;
  /** Aussehen-Index für Räuber. */
  look: number;
}

export function enemiesForChunk(world: WorldGen, cx: number, cy: number, spawn: { tx: number; ty: number }): EnemySpawn[] {
  const rnd = mulberry32(hash2(world.seed, cx, cy, 777));
  const out: EnemySpawn[] = [];
  const groupRoll = rnd();
  const tx0 = cx * CHUNK_TILES + Math.floor(rnd() * CHUNK_TILES);
  const ty0 = cy * CHUNK_TILES + Math.floor(rnd() * CHUNK_TILES);
  const b = world.biomeAt(tx0, ty0);
  const cfg = BIOME_ENEMIES[b];
  if (!cfg || groupRoll > cfg.chance) return out;
  const kind = cfg.kinds[Math.floor(rnd() * cfg.kinds.length)];
  const count = 1 + Math.floor(rnd() * (kind === 'bandit' ? 2 : 3));
  for (let i = 0; i < count; i++) {
    const tx = tx0 + Math.floor(rnd() * 5) - 2;
    const ty = ty0 + Math.floor(rnd() * 5) - 2;
    const dist = Math.hypot(tx - spawn.tx, ty - spawn.ty);
    if (dist < SAFE_RADIUS) continue;
    const tb = world.biomeAt(tx, ty);
    if (!BIOMES[tb].walkable && !ENEMIES[kind].flying) continue;
    const deco = world.decorationAt(tx, ty, tb);
    if (deco && DECOR_BLOCK[deco.kind] && !ENEMIES[kind].flying) continue;
    out.push({ id: `e${cx},${cy},${i}`, kind, tx, ty, level: levelForDistance(dist), color: SLIME_COLOR[tb] ?? 0, look: Math.floor(rnd() * 4) });
  }
  return out;
}
