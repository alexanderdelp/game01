import { B, BIOMES, type DecorKind } from './biomes';

const TREES = new Set<DecorKind>(['oak', 'pine', 'snowpine', 'palm', 'deadtree', 'cactus']);
/** Biome mit geschlossenem Baumbestand (Lichtungen statt Haine). */
const WOODED = new Set<B>([B.Forest, B.Jungle, B.Tundra, B.Snow, B.Swamp]);
const YOUNG: Partial<Record<DecorKind, DecorKind>> = { oak: 'youngoak', pine: 'youngpine' };
import { Simplex2 } from './noise';
import { WorldMeta } from './meta';
import { hashString, rand2 } from './rng';

/** Version der Weltgenerierung (2 = M19: große Welt, große Biome, Pfade). */
export const WORLD_VERSION = 2;
export const WORLD_TILES = 8192;
/** Maßstab gegenüber der ersten Weltgröße (4096): Abstände in Weltlogik und Platzierung wachsen mit. */
export const SCALE = WORLD_TILES / 4096;
export const CHUNK_TILES = 16;
export const WORLD_CHUNKS = WORLD_TILES / CHUNK_TILES;

export interface Climate {
  /** Höhe in [0, 1]; Meeresspiegel bei SEA_LEVEL. */
  elevation: number;
  /** Temperatur in [0, 1] (0 = eisig). */
  temperature: number;
  /** Feuchtigkeit in [0, 1]. */
  moisture: number;
  /** Magie-Feld in [0, 1] (Kristallhaine). */
  magic: number;
  /** Technik-Feld in [0, 1] (Schrottödnis). */
  tech: number;
}

export interface Decoration {
  tx: number;
  ty: number;
  kind: DecorKind;
  /** Zufallsvariante 0..255 (Spiegelung, Farbe, Versatz). */
  variant: number;
}

export interface ChunkData {
  cx: number;
  cy: number;
  /** Biome der Kacheln, zeilenweise, CHUNK_TILES². */
  biomes: Uint8Array;
  decorations: Decoration[];
}

export const SEA_LEVEL = 0.42;
/** Höhe (über dem Meer, 0–1), ab der Gebirge bzw. Felsgipfel beginnen. */
export const MOUNTAIN_H = 0.44;
export const PEAK_H = 0.6;
const DEEP_LEVEL = 0.3;
const BEACH_LEVEL = 0.431;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Die Welt als reine Funktion des Seeds. Jede Abfrage ist deterministisch und unabhängig
 * davon, in welcher Reihenfolge Chunks erzeugt werden.
 */
export class WorldGen {
  readonly seedName: string;
  readonly seed: number;
  private readonly nElev: Simplex2;
  private readonly nWarpX: Simplex2;
  private readonly nWarpY: Simplex2;
  private readonly nTemp: Simplex2;
  private readonly nMoist: Simplex2;
  private readonly nMagic: Simplex2;
  private readonly nTech: Simplex2;
  private readonly nGrove: Simplex2;
  private readonly nPatch: Simplex2;

  private metaCache?: WorldMeta;

  /** Reiche, Siedlungen, Geheimnisse, Chronik (lazy, deterministisch). */
  get meta(): WorldMeta {
    // Die Metadaten sehen das Gelände ohne Flüsse (die legen sie selbst an)
    return (this.metaCache ??= new WorldMeta({ seed: this.seed, biomeAt: (x, y) => this.baseBiomeAt(x, y), elevationAt: (x, y) => this.elevation(x, y) }));
  }

  constructor(seedName: string) {
    this.seedName = seedName;
    this.seed = hashString(seedName);
    const s = this.seed;
    this.nElev = new Simplex2(s ^ 0x1001);
    this.nWarpX = new Simplex2(s ^ 0x2002);
    this.nWarpY = new Simplex2(s ^ 0x3003);
    this.nTemp = new Simplex2(s ^ 0x4004);
    this.nMoist = new Simplex2(s ^ 0x5005);
    this.nMagic = new Simplex2(s ^ 0x6006);
    this.nTech = new Simplex2(s ^ 0x7007);
    this.nGrove = new Simplex2(s ^ 0x8008);
    this.nPatch = new Simplex2(s ^ 0x9009);
  }

  /** Klima an einer (auch gebrochenen) Kachelposition. */
  climate(x: number, y: number): Climate {
    const { elevation, wx, wy } = this.relief(x, y);
    const S = SCALE;
    const height = Math.max(0, (elevation - SEA_LEVEL) / (1 - SEA_LEVEL));
    const latitude = y / WORLD_TILES; // 0 = Norden (kalt), 1 = Süden (heiß)
    const temperature = Math.min(
      1,
      Math.max(0, 0.04 + latitude * 0.98 + this.nTemp.fbm(x / (900 * S), y / (900 * S), 3) * 0.25 - height * 0.4),
    );
    const moisture = Math.min(1, Math.max(0, this.nMoist.fbm(wx / (800 * S), wy / (800 * S), 3) * 0.62 + 0.5));
    const magic = this.nMagic.fbm(wx / (600 * S), wy / (600 * S), 4) * 0.5 + 0.5;
    const tech = this.nTech.fbm(wx / (640 * S), wy / (640 * S), 4) * 0.5 + 0.5;
    return { elevation, temperature, moisture, magic, tech };
  }

  /** Nur die Geländehöhe (günstiger als das volle Klima; für Flussläufe). */
  elevation(x: number, y: number): number {
    return this.relief(x, y).elevation;
  }

  /** Höhe und verwirbelte Koordinaten (Grundlage des Klimas). */
  private relief(x: number, y: number): { elevation: number; wx: number; wy: number } {
    // Domain Warping für organische Küstenlinien.
    const S = SCALE;
    const wx = x + 140 * S * this.nWarpX.fbm(x / (700 * S), y / (700 * S), 3);
    const wy = y + 140 * S * this.nWarpY.fbm(x / (700 * S), y / (700 * S), 3);

    // Kontinentmaske: zur Weltmitte hin Land, am Rand Ozean.
    const nx = (x / WORLD_TILES) * 2 - 1;
    const ny = (y / WORLD_TILES) * 2 - 1;
    const d = Math.sqrt(nx * nx + ny * ny) / Math.SQRT2 + 0.5 * Math.max(Math.abs(nx), Math.abs(ny)) - 0.25;
    const mask = 1 - smoothstep(0.35, 0.92, d);

    // "Landanteil": > 0 ist Land. Kontinent-Rauschen plus Maske ergibt Buchten, Binnenmeere, Inseln.
    const continent = this.nElev.fbm(wx / (900 * S), wy / (900 * S), 7);
    const edge = Math.min(x, y, WORLD_TILES - x, WORLD_TILES - y);
    const land = continent * 0.75 + (mask - 0.5) * 0.9 + 0.06 - (1 - smoothstep(0, 160 * S, edge)) * 1.5;

    // Gebirgsketten: gratförmiges Rauschen, nur im Landesinneren und nur in "Gebirgszonen".
    const ridge = 1 - Math.abs(this.nElev.fbm(wx / (420 * S) + 91.7, wy / (420 * S) - 43.1, 4));
    const zone = smoothstep(0.45, 0.75, this.nElev.noise(x / (1300 * S) - 17.3, y / (1300 * S) + 5.9) * 0.5 + 0.5);
    const r2 = ridge * ridge;
    const mountains = r2 * r2 * r2 * zone * smoothstep(0.02, 0.25, land) * 0.48;

    const lowland = land < 0 ? land * 0.3 : Math.min(land, 0.8) * 0.2;
    const elevation = Math.min(1, Math.max(0, SEA_LEVEL + lowland + mountains));
    return { elevation, wx, wy };
  }

  /** Klassifiziert ein Klima in ein Biom. */
  static classify(c: Climate): B {
    const e = c.elevation;
    if (e < DEEP_LEVEL) return B.DeepOcean;
    if (e < SEA_LEVEL) return B.Ocean;
    const h = (e - SEA_LEVEL) / (1 - SEA_LEVEL);
    if (h > PEAK_H) return B.Peak;
    if (h > MOUNTAIN_H) return c.temperature < 0.3 ? B.Snow : B.Mountain;
    if (e < BEACH_LEVEL && c.temperature > 0.25) return B.Beach;

    if (c.magic > 0.755 && h < 0.35) return B.CrystalGrove;
    if (c.tech > 0.755 && h < 0.35) return B.ScrapWastes;

    const t = c.temperature;
    const m = c.moisture;
    if (t < 0.17) return B.Snow;
    if (t < 0.28) return B.Tundra;
    if (m > 0.78 && h < 0.12) return B.Swamp;
    if (t > 0.68) {
      if (m < 0.36) return B.Desert;
      if (m < 0.56) return B.Savanna;
      return B.Jungle;
    }
    if (m < 0.48) return B.Grassland;
    return B.Forest;
  }

  /** Biom ohne Flüsse und Brücken. */
  baseBiomeAt(tx: number, ty: number): B {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return B.DeepOcean;
    return WorldGen.classify(this.climate(tx + 0.5, ty + 0.5));
  }

  biomeAt(tx: number, ty: number): B {
    return this.withWater(tx, ty, this.baseBiomeAt(tx, ty));
  }

  /** Legt Flüsse und Brücken über ein Grundbiom. */
  withWater(tx: number, ty: number, b: B): B {
    const w = this.meta.waterAt(tx, ty);
    return w === 'bridge' ? B.Bridge : w === 'river' ? B.River : b;
  }

  isWalkable(tx: number, ty: number): boolean {
    return BIOMES[this.biomeAt(tx, ty)].walkable;
  }

  /** Erzeugt die Daten eines Chunks. */
  chunk(cx: number, cy: number): ChunkData {
    const biomes = new Uint8Array(CHUNK_TILES * CHUNK_TILES);
    const decorations: Decoration[] = [];
    const ox = cx * CHUNK_TILES;
    const oy = cy * CHUNK_TILES;
    for (let y = 0; y < CHUNK_TILES; y++) {
      for (let x = 0; x < CHUNK_TILES; x++) {
        const tx = ox + x;
        const ty = oy + y;
        const b = this.biomeAt(tx, ty);
        biomes[y * CHUNK_TILES + x] = b;
        const d = this.decorationAt(tx, ty, b);
        if (d) decorations.push(d);
      }
    }
    return { cx, cy, biomes, decorations };
  }

  decorationAt(tx: number, ty: number, b: B = this.biomeAt(tx, ty)): Decoration | null {
    const meta = this.meta;
    const building = meta.buildingAt(tx, ty);
    if (building) return { tx, ty, kind: building.kind, variant: building.variant << 1 };
    const ruin = meta.ruinAt(tx, ty);
    if (ruin) return { tx, ty, kind: 'ruin', variant: (ruin.id % 4) << 1 };
    const poi = meta.poiAt(tx, ty);
    if (poi) return { tx, ty, kind: poi.kind, variant: 0 };
    if (meta.ruinNear(tx, ty, 4)) return null;
    if (meta.isRoad(tx, ty)) return null;
    const inTown = meta.settlementNear(tx, ty, 2);
    if (inTown && (meta.isPlaza(tx, ty) || rand2(this.seed, tx, ty, 79) < 0.85)) return null;
    const rules = BIOMES[b].decor;
    if (rules.length === 0) return null;
    const v = this.vegetation(tx, ty, b);
    let r = rand2(this.seed, tx, ty, 77);
    for (const rule of rules) {
      const tree = TREES.has(rule.kind);
      const density = rule.density * (tree ? v.trees : rule.kind === 'bush' ? 0.4 + v.trees * 0.5 : rule.kind === 'flowers' ? v.flowers : rule.kind === 'rock' || rule.kind === 'boulder' ? v.rocks : 1);
      if (r < density) {
        if (inTown && rule.kind !== 'flowers' && rule.kind !== 'tuft') return null;
        const variant = Math.floor(rand2(this.seed, tx, ty, 78) * 256);
        // Am Rand eines Hains wachsen junge, kleinere Bäume
        const young = tree && v.edge && YOUNG[rule.kind] && rand2(this.seed, tx, ty, 80) < 0.65;
        return { tx, ty, kind: young ? YOUNG[rule.kind]! : rule.kind, variant };
      }
      r -= density;
    }
    return null;
  }

  /**
   * Pflanzen wachsen gehäuft statt gleichmäßig (Feedback: „baukastenhaft“): Faktoren für Bäume (Haine und
   * Lichtungen), Blumen- und Steinflecken. `edge` = Rand eines Hains (dort junge Bäume).
   */
  vegetation(tx: number, ty: number, b: B): { trees: number; edge: boolean; flowers: number; rocks: number } {
    const g = this.nGrove.fbm(tx / 22, ty / 22, 2);
    let trees: number;
    let edge: boolean;
    if (WOODED.has(b)) {
      const t = smoothstep(-0.42, 0.22, g);
      trees = t * 1.6;
      edge = t > 0.05 && t < 0.55;
    } else {
      const t = smoothstep(0.18, 0.5, g);
      trees = 0.15 + t * 5;
      edge = t > 0.05 && t < 0.5;
    }
    const p = this.nPatch.noise(tx / 9, ty / 9);
    const q = this.nPatch.noise(tx / 14 + 33.3, ty / 14 - 8.1);
    return { trees, edge, flowers: smoothstep(0.25, 0.6, p) * 4, rocks: 0.2 + smoothstep(0.3, 0.65, q) * 3 };
  }

  /** Sucht einen begehbaren Startpunkt nahe der Weltmitte (in gemäßigtem Klima). */
  findSpawn(): { tx: number; ty: number } {
    const c = WORLD_TILES / 2;
    const good = (tx: number, ty: number) => {
      const b = this.biomeAt(tx, ty);
      if (b !== B.Grassland && b !== B.Forest && b !== B.Savanna) return false;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!this.isWalkable(tx + dx, ty + dy)) return false;
      return true;
    };
    for (let r = 0; r < WORLD_TILES / 2; r += 12) {
      const steps = Math.max(1, Math.floor((2 * Math.PI * r) / 12));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const tx = Math.round(c + Math.cos(a) * r);
        const ty = Math.round(c + Math.sin(a) * r);
        if (good(tx, ty)) return { tx, ty };
      }
    }
    // Fallback: irgendein begehbares Land.
    for (let ty = 0; ty < WORLD_TILES; ty += 8) for (let tx = 0; tx < WORLD_TILES; tx += 8) if (this.isWalkable(tx, ty)) return { tx, ty };
    return { tx: c, ty: c };
  }

  /** Übersichtskarte: ein Biom pro `step` × `step` Kacheln. */
  overview(step: number): { size: number; biomes: Uint8Array } {
    const size = Math.floor(WORLD_TILES / step);
    const biomes = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        biomes[y * size + x] = this.biomeAt(x * step + (step >> 1), y * step + (step >> 1));
      }
    }
    return { size, biomes };
  }
}
