import { B, BIOMES, BUILT, type DecorKind } from '../world/biomes';
import { Simplex2 } from '../world/noise';
import { hash2 } from '../world/rng';
import { CHUNK_TILES, WORLD_TILES, WorldGen, type Decoration } from '../world/WorldGen';
import { PATTERN, cobblePattern, dirtPattern, groundPattern } from './groundPatterns';
import { DECOR_VARIANTS, generateDecor, type Pixels } from './procSprites';

export const TILE_PX = 32;

/** Schattengröße (Breite, Höhe) je Dekorationsart – wird ins Bodenbild gebacken. */
export const DECOR_SHADOW: Partial<Record<DecorKind, [number, number]>> = {
  oak: [36, 10], youngoak: [24, 8], pine: [26, 8], youngpine: [18, 6], snowpine: [26, 8], palm: [26, 8], cactus: [16, 6], deadtree: [16, 6], boulder: [36, 10], crystal: [26, 8],
  pylon: [16, 6], scrap: [36, 10], bush: [26, 8], rock: [16, 6], chest: [16, 6], shrine: [26, 8], obelisk: [26, 8], well: [26, 8],
  ruin: [70, 16], ruinchest: [20, 7],
};
/** Flache Dekorationen, die komplett ins Bodenbild gebacken werden (keine eigenen Objekte). */
export const FLAT_DECOR = new Set<DecorKind>(['tuft', 'flowers']);
export const CHUNK_PX = CHUNK_TILES * TILE_PX;
/** Auflösung der Biomgrenzen in Pixeln (kleiner = feiner, aber teurer). */
const SUB = 2;
const SUBS = CHUNK_PX / SUB;

/** Pseudo-Biom für gepflasterte Flächen (nur im Renderer). */
const PLAZA = 255;
/** Pseudo-Biom für Trampelpfade (nur im Renderer). */
const ROAD = 254;
/** Rand des Kachelrasters um einen Chunk (Verwirbelung der Grenzen reicht bis zu ~1,5 Kacheln). */
const M = 2;
/** Biome mit Erdflecken und Laub im Boden. */
const SOIL = new Set<number>([B.Grassland, B.Forest, B.Jungle, B.Savanna]);
/** Biome mit verstreuten Kieseln. */
const STONY = new Set<number>([B.Mountain, B.Desert, B.Beach, B.Tundra, B.Savanna, B.ScrapWastes, B.Snow]);
const isWater = (b: number) => b === B.DeepOcean || b === B.Ocean;
const isHigh = (b: number) => b === B.Mountain || b === B.Peak;

/**
 * Rendert den Boden eines Chunks als RGBA-Pixel. Biomgrenzen werden auf einem 4-px-Raster mit
 * Rauschen verwirbelt, damit keine harten Kachelkanten entstehen. Keine Abhängigkeit von Phaser,
 * damit testbar und später in einen Worker verschiebbar.
 */
export class ChunkPainter {
  private readonly patterns: Uint32Array[];
  private readonly jitter: Simplex2;
  private readonly cobble: Uint32Array;
  private readonly dirt: Uint32Array;
  private readonly detail: Simplex2;

  constructor(private readonly world: WorldGen) {
    this.patterns = BIOMES.map((b) => groundPattern(b.id, world.seed));
    this.cobble = cobblePattern(world.seed);
    this.dirt = dirtPattern(world.seed);
    this.jitter = new Simplex2(world.seed ^ 0xabcdef);
    this.detail = new Simplex2(world.seed ^ 0x5eed5);
  }

  paint(cx: number, cy: number, out = new Uint8ClampedArray(CHUNK_PX * CHUNK_PX * 4)): Uint8ClampedArray {
    const T = CHUNK_TILES;
    const ox = cx * T;
    const oy = cy * T;

    // Biome und Höhen der Kacheln inkl. M Kacheln Rand (ein Klima-Aufruf je Kachel).
    const G = T + 2 * M;
    const grid = new Uint8Array(G * G);
    const elev = new Float32Array(G * G);
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const tx = ox + x - M;
        const ty = oy + y - M;
        if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) {
          grid[y * G + x] = B.DeepOcean;
          continue;
        }
        const c = this.world.climate(tx + 0.5, ty + 0.5);
        grid[y * G + x] = WorldGen.classify(c);
        elev[y * G + x] = c.elevation;
      }
    }
    // Pflaster und Pfade: Kennzeichnung als Pseudo-Biome (nur wenn begehbar)
    const meta = this.world.meta;
    const inTown = meta.settlements.some((s) => Math.abs(s.tx - (ox + T / 2)) < s.radius + T && Math.abs(s.ty - (oy + T / 2)) < s.radius + T);
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = y * G + x;
        if (!BIOMES[grid[i]].walkable) continue;
        if (inTown && meta.isPlaza(ox + x - M, oy + y - M)) grid[i] = PLAZA;
        else if (meta.isRoad(ox + x - M, oy + y - M)) grid[i] = ROAD;
      }
    }
    // Hangneigung je Kachel (Licht von Nordwesten) für die Höhenschattierung
    const slope = new Float32Array(G * G);
    for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) slope[y * G + x] = Math.tanh((elev[(y - 1) * G + x - 1] - elev[(y + 1) * G + x + 1]) * 60) * 0.14;

    // Verwirbelte Biome auf dem Sub-Raster inkl. 1 Sub-Zelle Rand.
    const S = SUBS + 2;
    const sub = new Uint8Array(S * S);
    const perTile = TILE_PX / SUB;
    for (let sy = 0; sy < S; sy++) {
      for (let sx = 0; sx < S; sx++) {
        const wsx = cx * SUBS + sx - 1;
        const wsy = cy * SUBS + sy - 1;
        // Grenzen großzügig verwirbeln (grob + fein), damit Biome ineinander ausfransen statt Kachelkanten zu zeigen
        const jx = this.jitter.noise(wsx / 26, wsy / 26);
        const jy = this.jitter.noise(wsx / 26 + 71.3, wsy / 26 - 12.9);
        const fx = (wsx + 0.5) / perTile + jx * 1.1 + this.jitter.noise(wsx / 7 + 9.1, wsy / 7) * 0.35;
        const fy = (wsy + 0.5) / perTile + jy * 1.1 + this.jitter.noise(wsx / 7, wsy / 7 - 4.4) * 0.35;
        const gx = Math.min(G - 1, Math.max(0, Math.floor(fx) - ox + M));
        const gy = Math.min(G - 1, Math.max(0, Math.floor(fy) - oy + M));
        // Pflaster und Pfade nur leicht verwirbeln (sonst franst der Ortsplatz aus)
        const lx = Math.floor((wsx + 0.5) / perTile + jx * 0.3) - ox + M;
        const ly = Math.floor((wsy + 0.5) / perTile + jy * 0.3) - oy + M;
        const built = grid[Math.min(G - 1, Math.max(0, ly)) * G + Math.min(G - 1, Math.max(0, lx))];
        const wild = grid[gy * G + gx];
        sub[sy * S + sx] = built === PLAZA || built === ROAD || wild === PLAZA || wild === ROAD ? built : wild;
      }
    }

    for (let sy = 0; sy < SUBS; sy++) {
      for (let sx = 0; sx < SUBS; sx++) {
        const i = (sy + 1) * S + sx + 1;
        const b = sub[i];
        const up = sub[i - S];
        const down = sub[i + S];
        const left = sub[i - 1];
        const right = sub[i + 1];
        if (b === PLAZA || b === ROAD) {
          const pat = b === PLAZA ? this.cobble : this.dirt;
          for (let py = 0; py < SUB; py++) {
            const wy = cy * CHUNK_PX + sy * SUB + py;
            for (let px = 0; px < SUB; px++) {
              const wx = cx * CHUNK_PX + sx * SUB + px;
              const c = pat[(wy & (PATTERN - 1)) * PATTERN + (wx & (PATTERN - 1))];
              const o = ((sy * SUB + py) * CHUNK_PX + sx * SUB + px) * 4;
              out[o] = c >> 16;
              out[o + 1] = (c >> 8) & 255;
              out[o + 2] = c & 255;
              out[o + 3] = 255;
            }
          }
          continue;
        }
        let mode = 0; // 0 normal, 1 Gischt, 2 nasser Rand, 3 Klippenschatten, 4 Klippenkante
        if (isWater(b)) {
          if (!isWater(up) || !isWater(down) || !isWater(left) || !isWater(right)) mode = 1;
        } else if (isWater(down) || isWater(left) || isWater(right) || isWater(up)) {
          mode = 2;
        } else if (isHigh(b) && !isHigh(down) && down !== PLAZA && down !== ROAD) {
          mode = 3;
        } else if (isHigh(b) && !isHigh(up)) {
          mode = 4;
        }
        const pat = this.patterns[b];
        // Höhenschattierung: Hangneigung bilinear zwischen den Kachelmitten
        const ftx = (sx + 0.5) / perTile - 0.5 + M;
        const fty = (sy + 0.5) / perTile - 0.5 + M;
        const ix = Math.floor(ftx);
        const iy = Math.floor(fty);
        const ax = ftx - ix;
        const ay = fty - iy;
        const sl = isWater(b)
          ? 0
          : (slope[iy * G + ix] * (1 - ax) + slope[iy * G + ix + 1] * ax) * (1 - ay) + (slope[(iy + 1) * G + ix] * (1 - ax) + slope[(iy + 1) * G + ix + 1] * ax) * ay;
        // Bodendetails: Erdflecken und Laub (in fruchtbaren Biomen), Kiesel (in steinigen)
        const wsx0 = cx * SUBS + sx;
        const wsy0 = cy * SUBS + sy;
        const soil = SOIL.has(b) ? this.detail.noise(wsx0 / 34, wsy0 / 34) + this.detail.noise(wsx0 / 9, wsy0 / 9) * 0.3 : -1;
        const litter = b === B.Forest || b === B.Jungle ? this.detail.noise(wsx0 / 18 + 50, wsy0 / 18) : -1;
        for (let py = 0; py < SUB; py++) {
          const wy = cy * CHUNK_PX + sy * SUB + py;
          for (let px = 0; px < SUB; px++) {
            const wx = cx * CHUNK_PX + sx * SUB + px;
            let c = pat[(wy & (PATTERN - 1)) * PATTERN + (wx & (PATTERN - 1))];
            const h = hash2(this.world.seed, wx, wy, 21) % 1000;
            if (soil > 0.76) c = blend(c, this.dirt[(wy & (PATTERN - 1)) * PATTERN + (wx & (PATTERN - 1))], soil > 0.84 || h < 500 ? 0.7 : 0.3);
            else if (litter > 0.45 && h < 220) c = blend(c, h < 80 ? 0xa07a2e : 0x6a4a22, 0.6);
            if (STONY.has(b) && h < 5) c = blend(c, 0xd8d0c4, 0.7);
            if (sl) c = sl > 0 ? blend(c, 0xfff4dc, sl) : blend(c, 0x141026, -sl * 1.4);
            if (mode === 1) c = ((wx + wy) & 3) === 0 ? 0xeaf6ff : blend(c, 0xbfe0f4, 0.45);
            else if (mode === 2) c = blend(c, 0x000000, 0.18);
            else if (mode === 3) c = blend(c, 0x1a1424, 0.45);
            else if (mode === 4) c = blend(c, 0xffffff, 0.2);
            const o = ((sy * SUB + py) * CHUNK_PX + sx * SUB + px) * 4;
            out[o] = c >> 16;
            out[o + 1] = (c >> 8) & 255;
            out[o + 2] = c & 255;
            out[o + 3] = 255;
          }
        }
      }
    }
    this.bake(cx, cy, grid, out);
    return out;
  }

  private readonly flatCache = new Map<string, Pixels>();

  /** Schatten und flache Dekorationen (inkl. 1 Kachel Rand der Nachbarn) ins Bodenbild malen. */
  private bake(cx: number, cy: number, grid: Uint8Array, out: Uint8ClampedArray): void {
    const T = CHUNK_TILES;
    const G = T + 2 * M;
    const ox = cx * T;
    const oy = cy * T;
    const decos: Decoration[] = [];
    // Nachbar-Dekorationen nur aus 1 Kachel Rand (Schatten/Blumen ragen nicht weiter)
    for (let y = M - 1; y < G - M + 1; y++) {
      for (let x = M - 1; x < G - M + 1; x++) {
        const b = grid[y * G + x];
        const tx = ox + x - M;
        const ty = oy + y - M;
        const d = this.world.decorationAt(tx, ty, b === PLAZA || b === ROAD ? this.world.biomeAt(tx, ty) : b);
        if (d) decos.push(d);
      }
    }
    const px0 = cx * CHUNK_PX;
    const py0 = cy * CHUNK_PX;
    const put = (x: number, y: number, r: number, g: number, bl: number, a: number) => {
      const lx = x - px0;
      const ly = y - py0;
      if (lx < 0 || ly < 0 || lx >= CHUNK_PX || ly >= CHUNK_PX || a <= 0) return;
      const o = (ly * CHUNK_PX + lx) * 4;
      out[o] = out[o] * (1 - a) + r * a;
      out[o + 1] = out[o + 1] * (1 - a) + g * a;
      out[o + 2] = out[o + 2] * (1 - a) + bl * a;
    };
    for (const d of decos) {
      const built = BUILT.has(d.kind);
      const p = built ? { x: d.tx * TILE_PX + TILE_PX / 2, y: d.ty * TILE_PX + TILE_PX } : decorPos(d);
      const sh = DECOR_SHADOW[d.kind];
      if (sh) {
        const [w, h] = sh;
        const cy0 = p.y - (built ? 2 : 2);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const dx = (x + 0.5 - w / 2) / (w / 2);
            const dy = (y + 0.5 - h / 2) / (h / 2);
            if (dx * dx + dy * dy <= 1) put(Math.round(p.x - w / 2 + x), Math.round(cy0 - h / 2 + y), 10, 8, 20, 0.35);
          }
        }
      }
      if (FLAT_DECOR.has(d.kind)) {
        const v = (d.variant >> 1) % DECOR_VARIANTS;
        const key = `${d.kind}:${v}`;
        let img = this.flatCache.get(key);
        if (!img) {
          img = generateDecor(d.kind, v);
          this.flatCache.set(key, img);
        }
        const flip = (d.variant & 1) === 1;
        const bx = Math.round(p.x - img.w / 2);
        const by = Math.round(p.y - img.h);
        for (let y = 0; y < img.h; y++) {
          for (let x = 0; x < img.w; x++) {
            const s = (y * img.w + (flip ? img.w - 1 - x : x)) * 4;
            const a = img.data[s + 3] / 255;
            if (a) put(bx + x, by + y, img.data[s], img.data[s + 1], img.data[s + 2], a);
          }
        }
      }
    }
  }
}

function blend(a: number, b: number, t: number): number {
  const r = ((a >> 16) * (1 - t) + (b >> 16) * t) | 0;
  const g = (((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) | 0;
  const bl = ((a & 255) * (1 - t) + (b & 255) * t) | 0;
  return (r << 16) | (g << 8) | bl;
}

/** Fußpunkt einer Dekoration in Weltpixeln (mit leichtem, seed-basiertem Versatz). */
export function decorPos(d: Decoration): { x: number; y: number } {
  return {
    x: d.tx * TILE_PX + TILE_PX / 2 + ((d.variant >> 2) % 9) - 4,
    y: d.ty * TILE_PX + TILE_PX - 4 + ((d.variant >> 5) % 5),
  };
}
