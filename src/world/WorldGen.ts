import { B, BIOMES, type DecorKind } from './biomes';
import { Simplex2 } from './noise';
import { hashString, rand2 } from './rng';

export const WORLD_TILES = 4096;
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
  }

  /** Klima an einer (auch gebrochenen) Kachelposition. */
  climate(x: number, y: number): Climate {
    // Domain Warping für organische Küstenlinien.
    const wx = x + 140 * this.nWarpX.fbm(x / 700, y / 700, 3);
    const wy = y + 140 * this.nWarpY.fbm(x / 700, y / 700, 3);

    // Kontinentmaske: zur Weltmitte hin Land, am Rand Ozean.
    const nx = (x / WORLD_TILES) * 2 - 1;
    const ny = (y / WORLD_TILES) * 2 - 1;
    const d = Math.sqrt(nx * nx + ny * ny) / Math.SQRT2 + 0.5 * Math.max(Math.abs(nx), Math.abs(ny)) - 0.25;
    const mask = 1 - smoothstep(0.35, 0.92, d);

    // "Landanteil": > 0 ist Land. Kontinent-Rauschen plus Maske ergibt Buchten, Binnenmeere, Inseln.
    const continent = this.nElev.fbm(wx / 900, wy / 900, 7);
    const edge = Math.min(x, y, WORLD_TILES - x, WORLD_TILES - y);
    const land = continent * 0.75 + (mask - 0.5) * 0.9 + 0.06 - (1 - smoothstep(0, 160, edge)) * 1.5;

    // Gebirgsketten: gratförmiges Rauschen, nur im Landesinneren und nur in "Gebirgszonen".
    const ridge = 1 - Math.abs(this.nElev.fbm(wx / 420 + 91.7, wy / 420 - 43.1, 4));
    const zone = smoothstep(0.45, 0.75, this.nElev.noise(x / 1300 - 17.3, y / 1300 + 5.9) * 0.5 + 0.5);
    const r2 = ridge * ridge;
    const mountains = r2 * r2 * r2 * zone * smoothstep(0.02, 0.25, land) * 0.48;

    const lowland = land < 0 ? land * 0.3 : Math.min(land, 0.8) * 0.2;
    const elevation = Math.min(1, Math.max(0, SEA_LEVEL + lowland + mountains));

    const height = Math.max(0, (elevation - SEA_LEVEL) / (1 - SEA_LEVEL));
    const latitude = y / WORLD_TILES; // 0 = Norden (kalt), 1 = Süden (heiß)
    const temperature = Math.min(
      1,
      Math.max(0, 0.04 + latitude * 0.98 + this.nTemp.fbm(x / 600, y / 600, 4) * 0.25 - height * 0.4),
    );
    const moisture = Math.min(1, Math.max(0, this.nMoist.fbm(wx / 520, wy / 520, 5) * 0.62 + 0.5));
    const magic = this.nMagic.fbm(x / 380, y / 380, 3) * 0.5 + 0.5;
    const tech = this.nTech.fbm(x / 420, y / 420, 3) * 0.5 + 0.5;
    return { elevation, temperature, moisture, magic, tech };
  }

  /** Klassifiziert ein Klima in ein Biom. */
  static classify(c: Climate): B {
    const e = c.elevation;
    if (e < DEEP_LEVEL) return B.DeepOcean;
    if (e < SEA_LEVEL) return B.Ocean;
    const h = (e - SEA_LEVEL) / (1 - SEA_LEVEL);
    if (h > 0.6) return B.Peak;
    if (h > 0.44) return c.temperature < 0.3 ? B.Snow : B.Mountain;
    if (e < BEACH_LEVEL && c.temperature > 0.25) return B.Beach;

    if (c.magic > 0.74 && h < 0.35) return B.CrystalGrove;
    if (c.tech > 0.75 && h < 0.35) return B.ScrapWastes;

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

  biomeAt(tx: number, ty: number): B {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return B.DeepOcean;
    return WorldGen.classify(this.climate(tx + 0.5, ty + 0.5));
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
    const rules = BIOMES[b].decor;
    if (rules.length === 0) return null;
    let r = rand2(this.seed, tx, ty, 77);
    for (const rule of rules) {
      if (r < rule.density) {
        return { tx, ty, kind: rule.kind, variant: Math.floor(rand2(this.seed, tx, ty, 78) * 256) };
      }
      r -= rule.density;
    }
    return null;
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
