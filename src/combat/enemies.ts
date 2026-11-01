/** Gegnerarten und seed-basiertes Auftreten. Rein, ohne Phaser. */
import { B, BIOMES, DECOR_BLOCK } from '../world/biomes';
import { hash2, mulberry32 } from '../world/rng';
import { CHUNK_TILES, type WorldGen } from '../world/WorldGen';
import { levelForDistance } from './combat';
import { BEASTS } from '../history/names';

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
  [B.Grassland]: 0, [B.Hills]: 0, [B.Forest]: 0, [B.Jungle]: 4, [B.Swamp]: 2, [B.Desert]: 3, [B.Savanna]: 3, [B.Snow]: 1, [B.Tundra]: 1, [B.Beach]: 3,
};

const BIOME_ENEMIES: Partial<Record<B, { chance: number; kinds: EnemyKind[] }>> = {
  [B.Grassland]: { chance: 0.35, kinds: ['slime', 'slime', 'bandit'] },
  [B.Hills]: { chance: 0.4, kinds: ['bandit', 'slime'] },
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
  /** Elite: größer, stärker, bessere Beute (M14). */
  elite?: boolean;
}

export const ELITE_CHANCE = 0.06;

export function enemiesForChunk(
  world: WorldGen,
  cx: number,
  cy: number,
  spawn: { tx: number; ty: number },
  invasion?: { realm: number; kind: EnemyKind } | null,
): EnemySpawn[] {
  const rnd = mulberry32(hash2(world.seed, cx, cy, 777));
  const out: EnemySpawn[] = [];
  // Wächter der Ruinen (M14): immer Elite, etwas stärker
  for (const r of world.meta.ruins) {
    if (Math.floor(r.tx / CHUNK_TILES) !== cx || Math.floor(r.ty / CHUNK_TILES) !== cy) continue;
    const kind = (['bandit', 'drone', 'wisp'] as const)[r.id % 3];
    const dist = Math.hypot(r.tx - spawn.tx, r.ty - spawn.ty);
    out.push({ id: `g${r.id}`, kind, tx: r.tx, ty: r.ty + 3, level: levelForDistance(dist) + 3, color: 0, look: r.id % 4, elite: true });
  }
  // Vorgeschichte: Großbestien, die noch leben, wachen über ihren Hort
  const hist = world.history;
  if (hist) {
    for (const p of world.meta.historic) {
      if (p.kind !== 'lair' || p.site === undefined || Math.floor(p.tx / CHUNK_TILES) !== cx || Math.floor(p.ty / CHUNK_TILES) !== cy) continue;
      const beast = hist.figures[hist.sites[p.site].beast ?? -1];
      if (!beast || beast.died !== undefined) continue;
      const kind = BEASTS[beast.beastKind ?? 0].enemy;
      const dist = Math.hypot(p.tx - spawn.tx, p.ty - spawn.ty);
      out.push({ id: `b${p.site}`, kind, tx: p.tx, ty: p.ty + 3, level: levelForDistance(dist) + 5, color: 0, look: p.site % 4, elite: true });
    }
  }
  const groupRoll = rnd();
  const tx0 = cx * CHUNK_TILES + Math.floor(rnd() * CHUNK_TILES);
  const ty0 = cy * CHUNK_TILES + Math.floor(rnd() * CHUNK_TILES);
  const b = world.biomeAt(tx0, ty0);
  const cfg = BIOME_ENEMIES[b];
  const invaded = !!invasion && !!cfg && world.meta.realmAt(tx0, ty0).id === invasion.realm && (BIOMES[b].walkable || ENEMIES[invasion.kind].flying);
  if (!cfg || groupRoll > (invaded ? Math.min(0.95, cfg.chance * 2) : cfg.chance)) return out;
  const picked = cfg.kinds[Math.floor(rnd() * cfg.kinds.length)];
  const kind = invaded ? invasion!.kind : picked;
  const count = 1 + Math.floor(rnd() * (kind === 'bandit' ? 2 : 3));
  for (let i = 0; i < count; i++) {
    const tx = tx0 + Math.floor(rnd() * 5) - 2;
    const ty = ty0 + Math.floor(rnd() * 5) - 2;
    const dist = Math.hypot(tx - spawn.tx, ty - spawn.ty);
    if (dist < SAFE_RADIUS) continue;
    if (world.meta.settlementNear(tx, ty, 10)) continue;
    const tb = world.biomeAt(tx, ty);
    if (!BIOMES[tb].walkable && !ENEMIES[kind].flying) continue;
    const deco = world.decorationAt(tx, ty, tb);
    if (deco && DECOR_BLOCK[deco.kind] && !ENEMIES[kind].flying) continue;
    const elite = hash2(world.seed, tx, ty, 999) / 4294967296 < ELITE_CHANCE;
    out.push({ id: `e${cx},${cy},${i}`, kind, tx, ty, level: levelForDistance(dist) + (elite ? 2 : 0), color: SLIME_COLOR[tb] ?? 0, look: Math.floor(rnd() * 4), ...(elite ? { elite } : {}) });
  }
  return out;
}
