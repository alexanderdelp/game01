import { B, BIOMES } from '../world/biomes';
import { hash2 } from '../world/rng';

/** Kantenlänge der kachelbaren Bodenmuster in Pixeln. */
export const PATTERN = 128;

type Rgb = number;

const shade = (c: Rgb, f: number): Rgb => {
  const r = Math.min(255, Math.max(0, Math.round((c >> 16) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
};

/**
 * Erzeugt ein kachelbares Bodenmuster (RGB, PATTERN²) für ein Biom.
 * Rein prozedural: Grundfarbe, gestreute Pixel, biomtypische Strukturen.
 */
export function groundPattern(biome: B, seed = 1): Uint32Array {
  const [dark, mid, light, accent] = BIOMES[biome].palette;
  const px = new Uint32Array(PATTERN * PATTERN).fill(mid);
  const set = (x: number, y: number, c: Rgb) => {
    px[((y + PATTERN) % PATTERN) * PATTERN + ((x + PATTERN) % PATTERN)] = c;
  };
  const r = (x: number, y: number, salt: number) => hash2(seed + biome * 977, x, y, salt) / 4294967296;

  // Grobe Farbflecken (2×2), damit die Fläche nicht flach wirkt.
  for (let y = 0; y < PATTERN; y += 2) {
    for (let x = 0; x < PATTERN; x += 2) {
      const v = r(x, y, 1);
      const c = v < 0.18 ? dark : v > 0.84 ? light : mid;
      set(x, y, c); set(x + 1, y, c); set(x, y + 1, c); set(x + 1, y + 1, c);
    }
  }

  const count = (n: number, fn: (x: number, y: number, i: number) => void) => {
    n *= (PATTERN / 64) ** 2;
    for (let i = 0; i < n; i++) fn(Math.floor(r(i, 0, 2) * PATTERN), Math.floor(r(i, 0, 3) * PATTERN), i);
  };

  switch (biome) {
    case B.DeepOcean:
    case B.Ocean:
      // Wellenstriche
      count(biome === B.Ocean ? 26 : 14, (x, y, i) => {
        const len = 3 + (i % 4);
        for (let k = 0; k < len; k++) set(x + k, y, k === 0 || k === len - 1 ? light : accent);
      });
      break;
    case B.Grassland:
    case B.Forest:
    case B.Jungle:
    case B.Savanna:
    case B.CrystalGrove:
      // Grashalme
      count(140, (x, y, i) => {
        set(x, y, i % 3 === 0 ? accent : light);
        set(x, y + 1, dark);
      });
      break;
    case B.Beach:
    case B.Desert:
      // Sandkörner und Dünenlinien
      count(90, (x, y, i) => set(x, y, i % 2 ? dark : light));
      count(8, (x, y) => {
        for (let k = 0; k < 6; k++) set(x + k, y + (k > 2 ? 1 : 0), accent);
      });
      break;
    case B.Swamp:
      // Pfützen
      count(10, (x, y) => {
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 5; dx++) if (!((dy === 0 || dy === 2) && (dx === 0 || dx === 4))) set(x + dx, y + dy, 0x355a6a);
        set(x + 1, y + 1, 0x5a8aa0);
      });
      count(60, (x, y) => set(x, y, accent));
      break;
    case B.Tundra:
    case B.Snow:
      count(70, (x, y, i) => set(x, y, i % 4 === 0 ? 0xffffff : light));
      count(20, (x, y) => set(x, y, dark));
      break;
    case B.Mountain:
    case B.Peak:
      // Risse
      count(14, (x, y, i) => {
        let cx = x;
        for (let k = 0; k < 6; k++) {
          set(cx, y + k, accent);
          set(cx + 1, y + k, light);
          cx += r(i, k, 4) < 0.5 ? -1 : 1;
        }
      });
      break;
    case B.ScrapWastes: {
      // Platten mit Nieten und gelegentlichen Leuchtbahnen
      for (let k = 0; k < PATTERN; k++) {
        for (let g = 0; g < PATTERN; g += 32) {
          set(k, g, dark);
          set(g, k, dark);
        }
      }
      for (let gy = 0; gy < PATTERN; gy += 32) {
        for (let gx = 0; gx < PATTERN; gx += 32) {
          for (const [x, y] of [[3, 3], [29, 3], [3, 29], [29, 29]]) set(gx + x, gy + y, light);
        }
      }
      for (let t = 0; t < 3; t++) {
        let x = Math.floor(r(t, 1, 10) * PATTERN);
        let y = Math.floor(r(t, 2, 10) * PATTERN);
        for (let k = 0; k < 40; k++) {
          set(x, y, accent);
          if (r(k, t, 9) < 0.5) x++; else y++;
        }
        set(x, y, 0xc8fffa);
      }
      count(40, (x2, y2) => set(x2, y2, shade(mid, 0.85)));
      break;
    }
  }

  // Kristallhain: leuchtende Splitter
  if (biome === B.CrystalGrove) count(18, (x, y) => { set(x, y, 0xd8c4ff); set(x + 1, y, accent); });
  return px;
}

/** Kopfsteinpflaster für Plätze und Wege in Siedlungen. */
export function cobblePattern(seed = 1): Uint32Array {
  const px = new Uint32Array(PATTERN * PATTERN).fill(0x5a524a);
  const stones = [0x8a8278, 0x9a9288, 0x7a7268, 0xa8a094];
  for (let gy = 0; gy < PATTERN; gy += 8) {
    const off = (gy / 8) % 2 ? 4 : 0;
    for (let gx = 0; gx < PATTERN; gx += 8) {
      const c = stones[hash2(seed, gx, gy, 3) % stones.length];
      for (let y = 1; y < 7; y++) {
        for (let x = 1; x < 7; x++) {
          const corner = (x === 1 || x === 6) && (y === 1 || y === 6);
          if (corner) continue;
          const v = y < 3 ? 0x0a0a0a : 0;
          const col = v ? Math.min(0xffffff, c + 0x101010) : y > 5 ? c - 0x101010 : c;
          px[(gy + y) * PATTERN + ((gx + x + off) % PATTERN)] = col;
        }
      }
    }
  }
  return px;
}

/** Festgetretene Erde für Trampelpfade (M19): Brauntöne mit Kieseln und Fußspuren-Flecken. */
export function dirtPattern(seed = 1): Uint32Array {
  const px = new Uint32Array(PATTERN * PATTERN);
  const tones = [0x8a6a44, 0x94744c, 0x7e6040, 0x9c7c52];
  for (let y = 0; y < PATTERN; y++) {
    for (let x = 0; x < PATTERN; x++) {
      const h = hash2(seed, x >> 1, y >> 1, 11);
      let c = tones[h % tones.length];
      const k = hash2(seed, x, y, 12) % 1000;
      if (k < 6) c = 0xb8a88a;
      else if (k < 10) c = 0x5e4630;
      px[y * PATTERN + x] = c;
    }
  }
  return px;
}
