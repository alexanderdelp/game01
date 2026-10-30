import { B, BIOMES } from '../world/biomes';
import { Simplex2 } from '../world/noise';
import { CHUNK_TILES, type WorldGen } from '../world/WorldGen';
import { PATTERN, groundPattern } from './groundPatterns';

export const TILE_PX = 16;
export const CHUNK_PX = CHUNK_TILES * TILE_PX;
/** Auflösung der Biomgrenzen in Pixeln (kleiner = feiner, aber teurer). */
const SUB = 2;
const SUBS = CHUNK_PX / SUB;

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

  constructor(private readonly world: WorldGen) {
    this.patterns = BIOMES.map((b) => groundPattern(b.id, world.seed));
    this.jitter = new Simplex2(world.seed ^ 0xabcdef);
  }

  paint(cx: number, cy: number, out = new Uint8ClampedArray(CHUNK_PX * CHUNK_PX * 4)): Uint8ClampedArray {
    const T = CHUNK_TILES;
    const ox = cx * T;
    const oy = cy * T;

    // Biome der Kacheln inkl. 1 Kachel Rand.
    const G = T + 2;
    const grid = new Uint8Array(G * G);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) grid[y * G + x] = this.world.biomeAt(ox + x - 1, oy + y - 1);

    // Verwirbelte Biome auf dem Sub-Raster inkl. 1 Sub-Zelle Rand.
    const S = SUBS + 2;
    const sub = new Uint8Array(S * S);
    const perTile = TILE_PX / SUB;
    for (let sy = 0; sy < S; sy++) {
      for (let sx = 0; sx < S; sx++) {
        const wsx = cx * SUBS + sx - 1;
        const wsy = cy * SUBS + sy - 1;
        const fx = (wsx + 0.5) / perTile + this.jitter.noise(wsx / 12, wsy / 12) * 0.6;
        const fy = (wsy + 0.5) / perTile + this.jitter.noise(wsx / 12 + 71.3, wsy / 12 - 12.9) * 0.6;
        const gx = Math.min(G - 1, Math.max(0, Math.floor(fx) - ox + 1));
        const gy = Math.min(G - 1, Math.max(0, Math.floor(fy) - oy + 1));
        sub[sy * S + sx] = grid[gy * G + gx];
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
        let mode = 0; // 0 normal, 1 Gischt, 2 nasser Rand, 3 Klippenschatten, 4 Klippenkante
        if (isWater(b)) {
          if (!isWater(up) || !isWater(down) || !isWater(left) || !isWater(right)) mode = 1;
        } else if (isWater(down) || isWater(left) || isWater(right) || isWater(up)) {
          mode = 2;
        } else if (isHigh(b) && !isHigh(down)) {
          mode = 3;
        } else if (isHigh(b) && !isHigh(up)) {
          mode = 4;
        }
        const pat = this.patterns[b];
        for (let py = 0; py < SUB; py++) {
          const wy = cy * CHUNK_PX + sy * SUB + py;
          for (let px = 0; px < SUB; px++) {
            const wx = cx * CHUNK_PX + sx * SUB + px;
            let c = pat[(wy & (PATTERN - 1)) * PATTERN + (wx & (PATTERN - 1))];
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
    return out;
  }
}

function blend(a: number, b: number, t: number): number {
  const r = ((a >> 16) * (1 - t) + (b >> 16) * t) | 0;
  const g = (((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) | 0;
  const bl = ((a & 255) * (1 - t) + (b & 255) * t) | 0;
  return (r << 16) | (g << 8) | bl;
}
