import { B, BIOMES, BUILT, type DecorKind } from '../world/biomes';
import { Simplex2 } from '../world/noise';
import { hash2 } from '../world/rng';
import { CHUNK_TILES, WORLD_TILES, WorldGen, type Decoration } from '../world/WorldGen';
import { BASE_LEVEL, CELL, CellKind, buildCells, levelAt, type ChunkCells } from '../world/terrain';
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
const isWater = (b: number) => b === B.DeepOcean || b === B.Ocean || b === B.River || b === B.Lake;
/** Felsfarben der Klippen: [hell, mittel, dunkel] – Schnee-/Tundragebirge heller. */
const ROCK = [0x9a8c7c, 0x7c6e60, 0x4e4238];
const ROCK_COLD = [0xb4b8c0, 0x8e929c, 0x5a5e6a];
/** Reichweite der Kantenzeichnung in Zellen (Lippe, Felsband, Schatten). */
const EDGE_REACH = 2;

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
    return this.paintWithCells(cx, cy, out).pixels;
  }

  /** Bodenbild und Geländeraster (Stufen, Wände, Treppen) eines Chunks. */
  paintWithCells(cx: number, cy: number, out = new Uint8ClampedArray(CHUNK_PX * CHUNK_PX * 4)): { pixels: Uint8ClampedArray; cells: ChunkCells } {
    const T = CHUNK_TILES;
    const ox = cx * T;
    const oy = cy * T;

    // Biome und Höhen der Kacheln inkl. M Kacheln Rand (ein Klima-Aufruf je Kachel).
    const G = T + 2 * M;
    const grid = new Uint8Array(G * G);
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const tx = ox + x - M;
        const ty = oy + y - M;
        if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) {
          grid[y * G + x] = B.DeepOcean;
          continue;
        }
        const c = this.world.climate(tx + 0.5, ty + 0.5);
        grid[y * G + x] = this.world.withWater(tx, ty, WorldGen.classify(c));
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
    // Hang je Kachel (M24): Licht von Nordwesten, in Stufen für Pixel-Art
    const hs = new Float32Array(G * G);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) hs[y * G + x] = this.world.ground(ox + x - M, oy + y - M).s;
    const slope = new Float32Array(G * G);
    for (let y = 1; y < G - 1; y++) {
      for (let x = 1; x < G - 1; x++) {
        const lit = Math.tanh((hs[(y + 1) * G + x + 1] - hs[(y - 1) * G + x - 1]) * 0.45) * 0.36;
        slope[y * G + x] = lit;
      }
    }
    const cells = buildCells(this.world, cx, cy, T, (tx, ty) => meta.isRoad(tx, ty));
    const CN = cells.n;
    this.prepareEdges(cx, cy, cells);

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
        // Pflaster, Pfade, Brücken und Flüsse nur leicht verwirbeln (sonst fransen sie aus)
        const lx = Math.floor((wsx + 0.5) / perTile + jx * 0.3) - ox + M;
        const ly = Math.floor((wsy + 0.5) / perTile + jy * 0.3) - oy + M;
        const built = grid[Math.min(G - 1, Math.max(0, ly)) * G + Math.min(G - 1, Math.max(0, lx))];
        const wild = grid[gy * G + gx];
        const crisp = (v: number) => v === PLAZA || v === ROAD || v === B.Bridge || v === B.River;
        sub[sy * S + sx] = crisp(built) || crisp(wild) ? built : wild;
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
              // Pfade über Klippen werden zu Treppen (M24)
              const c = this.cliff(pat[(wy & (PATTERN - 1)) * PATTERN + (wx & (PATTERN - 1))], cells, CN, sx * SUB + px, sy * SUB + py, wx, b);
              const o = ((sy * SUB + py) * CHUNK_PX + sx * SUB + px) * 4;
              out[o] = c >> 16;
              out[o + 1] = (c >> 8) & 255;
              out[o + 2] = c & 255;
              out[o + 3] = 255;
            }
          }
          continue;
        }
        let mode = 0; // 0 normal, 1 Gischt, 2 nasser Rand
        if (isWater(b)) {
          if (!isWater(up) || !isWater(down) || !isWater(left) || !isWater(right)) mode = 1;
        } else if (isWater(down) || isWater(left) || isWater(right) || isWater(up)) {
          mode = 2;
        }
        const pat = this.patterns[b];
        // Höhenschattierung: Hangneigung bilinear zwischen den Kachelmitten
        const ftx = (sx + 0.5) / perTile - 0.5 + M;
        const fty = (sy + 0.5) / perTile - 0.5 + M;
        const ix = Math.floor(ftx);
        const iy = Math.floor(fty);
        const ax = ftx - ix;
        const ay = fty - iy;
        // in Stufen (Pixel-Art): klare Bänder statt weicher Verläufe
        const sl = isWater(b)
          ? 0
          : Math.round(((slope[iy * G + ix] * (1 - ax) + slope[iy * G + ix + 1] * ax) * (1 - ay) + (slope[(iy + 1) * G + ix] * (1 - ax) + slope[(iy + 1) * G + ix + 1] * ax) * ay) * 9) / 9;
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
            if (!isWater(b)) c = this.cliff(c, cells, CN, sx * SUB + px, sy * SUB + py, wx, b);
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
    return { pixels: out, cells };
  }

  /** Felswände, Treppen und Kanten der Stufen (M24) an einem Pixel des Chunks. */
  private cliff(c: number, cells: ChunkCells, n: number, lx: number, ly: number, wx: number, b: number): number {
    const x = (lx / CELL) | 0;
    const y = (ly / CELL) | 0;
    const i = y * n + x;
    const k = cells.faceK[i];
    if (k) {
      // Position in der Wand: 0 = Oberkante, 1 = Fuß
      const p = (k - 1) * CELL + (ly % CELL);
      const len = cells.faceLen[i] * CELL;
      const t = p / len;
      if (cells.kind[i] === CellKind.Stairs) {
        // Steinstufen mit Seitenwangen
        const step = p % 6;
        const edge = cells.kind[i - 1] !== CellKind.Stairs || cells.kind[i + 1] !== CellKind.Stairs;
        if (edge) return 0x5a5044;
        return step < 2 ? 0xc0b49e : step < 5 ? 0x948872 : 0x5a5044;
      }
      const rock = b === B.Snow || b === B.Tundra ? ROCK_COLD : ROCK;
      if (p < 2) return blend(rock[0], 0xffffff, 0.15);
      // senkrechte Felsrippen und eine dunkle Fußzone
      const rib = hash2(this.world.seed, wx >> 2, 0, 31) % 3;
      let col = t > 0.82 ? rock[2] : rib === 0 ? rock[2] : rib === 1 ? rock[1] : rock[0];
      if (rib !== 0 && t > 0.5) col = blend(col, rock[2], (t - 0.5) * 0.9);
      if ((hash2(this.world.seed, wx, ly, 32) & 31) === 0) col = blend(col, 0x000000, 0.25);
      return col;
    }
    const l = cells.level[i];
    // Schlagschatten am Fuß einer Wand
    if (y > 0 && cells.faceK[i - n] && cells.kind[i - n] === CellKind.Wall) return blend(c, 0x141026, ly % CELL < 2 ? 0.4 : 0.2);
    // Oberkante einer Wand: helle Lippe
    if (y + 1 < n && cells.faceK[i + n] === 1 && cells.level[i + n] < l && ly % CELL >= 2) return blend(c, 0xfff4dc, 0.28);
    if (!this.near[i] || cells.kind[i] === CellKind.Stairs) return c;
    return this.dropEdge(c, l, x, y, lx, ly, wx, b);
  }

  /** Stufen inkl. 2 Zellen Rand (auch aus Nachbar-Chunks) und Merker „Kante in der Nähe“ je Zelle (M26). */
  private pad = new Uint8Array(0);
  private near = new Uint8Array(0);
  private padW = 0;

  private prepareEdges(cx: number, cy: number, cells: ChunkCells): void {
    const n = cells.n;
    const P = EDGE_REACH;
    const W = n + 2 * P;
    this.padW = W;
    if (this.pad.length !== W * W) this.pad = new Uint8Array(W * W);
    if (this.near.length !== n * n) this.near = new Uint8Array(n * n);
    const pad = this.pad;
    const near = this.near;
    near.fill(0);
    // Ohne Stufenwechsel im Chunk und am Rand gibt es keine Kanten
    let flat = cells.level.every((v) => v === BASE_LEVEL);
    if (flat) {
      const t0x = cx * CHUNK_TILES - 1;
      const t0y = cy * CHUNK_TILES - 1;
      for (let t = 0; t < CHUNK_TILES + 2 && flat; t++) {
        if (this.world.ground(t0x + t, t0y).rug > 0 || this.world.ground(t0x + t, t0y + CHUNK_TILES + 1).rug > 0) flat = false;
        if (this.world.ground(t0x, t0y + t).rug > 0 || this.world.ground(t0x + CHUNK_TILES + 1, t0y + t).rug > 0) flat = false;
      }
    }
    if (flat) return;
    const ox = cx * n - P;
    const oy = cy * n - P;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const ix = x - P;
        const iy = y - P;
        pad[y * W + x] = ix >= 0 && iy >= 0 && ix < n && iy < n
          ? cells.level[iy * n + ix]
          : levelAt(this.world, ((ox + x + 0.5) * CELL) / TILE_PX, ((oy + y + 0.5) * CELL) / TILE_PX);
      }
    }
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const l = pad[(y + P) * W + x + P];
        let hit = 0;
        for (let dy = -P; dy <= P && !hit; dy++) for (let dx = -P; dx <= P; dx++) if (pad[(y + P + dy) * W + x + P + dx] !== l) { hit = 1; break; }
        near[y * n + x] = hit;
      }
    }
  }

  /**
   * Abbruchkante einer Stufe, deren tiefere Seite nördlich oder seitlich liegt (M26): auf der oberen Seite helle
   * Lippe und schmales Felsband, auf der tieferen Seite Schatten. Abstand zu den Zellmitten statt Zellgrenzen –
   * so wird die Kante eine zusammenhängende Linie mit weichen Ecken statt einer Treppe.
   */
  private dropEdge(c: number, l: number, x: number, y: number, lx: number, ly: number, wx: number, b: number): number {
    const P = EDGE_REACH;
    const W = this.padW;
    const pad = this.pad;
    const fx = lx + 0.5;
    const fy = ly + 0.5;
    let best = 99;
    let north = false;
    let lower = false;
    for (let dy = -P; dy <= P; dy++) {
      for (let dx = -P; dx <= P; dx++) {
        const m = pad[(y + P + dy) * W + x + P + dx];
        if (m === l) continue;
        // tiefer: nur nördlich/seitlich (südlich liegt eine Felswand); höher: nur südlich/seitlich
        if (m < l ? dy > 0 : dy < 0) continue;
        const vx = (x + dx + 0.5) * CELL - fx;
        const vy = (y + dy + 0.5) * CELL - fy;
        const d = Math.sqrt(vx * vx + vy * vy) - CELL / 2;
        if (d < best) {
          best = d;
          north = Math.abs(vy) >= Math.abs(vx);
          lower = m > l;
        }
      }
    }
    if (best >= 5) return c;
    if (lower) {
      // tiefere Seite: die Stufe wirft Schatten
      if (north) return blend(c, 0x141026, best < 2 ? 0.5 : 0.28);
      return best < 2 ? blend(c, 0x141026, 0.38) : best < 3.5 ? blend(c, 0x141026, 0.18) : c;
    }
    const rock = b === B.Snow || b === B.Tundra ? ROCK_COLD : ROCK;
    if (north) {
      if (best < 1) return rock[2];
      if (best < 3.5) return (hash2(this.world.seed, wx >> 1, 0, 33) & 3) === 0 ? rock[0] : rock[1];
      return blend(c, 0xfff4dc, 0.5);
    }
    // seitlich: dieselbe Bildsprache, schmaler
    if (best < 1) return rock[2];
    if (best < 2.5) return blend(rock[1], c, 0.3);
    if (best < 3.5) return blend(c, 0xfff4dc, 0.35);
    return c;
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
