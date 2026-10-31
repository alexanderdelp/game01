/**
 * Prozedural erzeugte Pixel-Sprites im LPC-Maßstab (32-px-Kacheln): Bäume, Felsen, Kristalle, Schrott …
 * Rein (ohne DOM): liefert RGBA-Pixel. Schattierung von links oben, 1-px-Kontur, geordnetes Dithering.
 */
import type { DecorKind } from '../world/biomes';
import { mulberry32 } from '../world/rng';

export interface Pixels {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const OUTLINE = 0x1a1424;

export class Img {
  readonly data: Uint8ClampedArray;
  /** Hilfsebene: 1 = gehört zu einem Körper, für Kontur und Schatten. */
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x: number, y: number, c: number): void {
    x |= 0;
    y |= 0;
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c >> 16;
    this.data[i + 1] = (c >> 8) & 255;
    this.data[i + 2] = c & 255;
    this.data[i + 3] = 255;
  }

  /** Setzt einen Pixel mit Transparenz (für Leuchten), überschreibt nur Transparentes. */
  glow(x: number, y: number, c: number, alpha: number): void {
    x |= 0;
    y |= 0;
    if (!this.inside(x, y) || this.opaque(x, y)) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c >> 16;
    this.data[i + 1] = (c >> 8) & 255;
    this.data[i + 2] = c & 255;
    this.data[i + 3] = alpha;
  }

  get(x: number, y: number): number {
    const i = (y * this.w + x) * 4;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }

  opaque(x: number, y: number): boolean {
    return this.inside(x, y) && this.data[(y * this.w + x) * 4 + 3] === 255;
  }

  /** Wählt aus einer Palette (dunkel → hell) mit Dithering anhand eines Helligkeitswerts 0..1. */
  shade(x: number, y: number, light: number, pal: number[]): void {
    const v = Math.min(0.999, Math.max(0, light)) * (pal.length - 1);
    const i = Math.floor(v);
    const frac = v - i;
    const pick = frac > BAYER[(y & 3) * 4 + (x & 3)] ? i + 1 : i;
    this.set(x, y, pal[Math.min(pal.length - 1, pick)]);
  }

  /** Gefüllte, schattierte Kugel (für Baumkronen, Büsche, Felsen). */
  ball(cx: number, cy: number, r: number, pal: number[], rnd: () => number, bumpy = 0.15, squash = 1): void {
    for (let y = Math.floor(cy - r * squash) - 1; y <= cy + r * squash + 1; y++) {
      for (let x = Math.floor(cx - r) - 1; x <= cx + r + 1; x++) {
        const dx = (x + 0.5 - cx) / r;
        const dy = (y + 0.5 - cy) / (r * squash);
        const d = dx * dx + dy * dy;
        const edge = 1 - bumpy * rnd();
        if (d > edge) continue;
        const nz = Math.sqrt(Math.max(0, 1 - d));
        const light = 0.35 + (-dx * 0.55 - dy * 0.75 + nz * 0.6) * 0.5 + (rnd() - 0.5) * 0.12;
        this.shade(x, y, light, pal);
      }
    }
  }

  rect(x0: number, y0: number, w: number, h: number, c: number): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number | ((t: number) => number), width = 1): void {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const col = typeof c === 'number' ? c : c(t);
      const wd = typeof width === 'number' ? width : 1;
      for (let k = 0; k < wd; k++) this.set(x - Math.floor(wd / 2) + k, y, col);
    }
  }

  polygon(pts: [number, number][], fill: (x: number, y: number) => number | null): void {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) {
          const c = fill(x, y);
          if (c !== null) this.set(x, y, c);
        }
      }
    }
  }

  /** 1-px-Kontur um alle deckenden Pixel. */
  outline(c = OUTLINE): void {
    const mark: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.opaque(x, y)) continue;
        if (this.opaque(x - 1, y) || this.opaque(x + 1, y) || this.opaque(x, y - 1) || this.opaque(x, y + 1)) mark.push(x, y);
      }
    }
    for (let i = 0; i < mark.length; i += 2) this.set(mark[i], mark[i + 1], c);
  }

  result(): Pixels {
    return { w: this.w, h: this.h, data: this.data };
  }
}

const GREENS = [0x173d22, 0x225a2a, 0x2f7533, 0x47923d, 0x6cb04e, 0x9ccc6a];
const DARK_GREENS = [0x10301e, 0x173f28, 0x215532, 0x2d6b3c, 0x3f8549, 0x5c9e5a];
const BARK = [0x3a2418, 0x523424, 0x6e4a30, 0x8a6240];
const STONE = [0x3c3844, 0x55505e, 0x6f6a78, 0x8e8996, 0xb2aeba, 0xd4d0da];

function trunk(img: Img, cx: number, bottom: number, height: number, width: number, rnd: () => number): void {
  for (let y = bottom - height; y <= bottom; y++) {
    const flare = y > bottom - 3 ? bottom - y < 1 ? 2 : 1 : 0;
    const w = width + flare * 2;
    for (let x = Math.round(cx - w / 2); x < Math.round(cx + w / 2); x++) {
      const t = (x - (cx - w / 2)) / w;
      img.shade(x, y, 0.85 - t * 0.8 + (rnd() - 0.5) * 0.15, BARK);
    }
  }
}

function oak(rnd: () => number): Pixels {
  const img = new Img(44, 60);
  const cx = 22;
  trunk(img, cx, 58, 22, 7, rnd);
  const pal = rnd() < 0.3 ? DARK_GREENS : GREENS;
  const j = () => (rnd() - 0.5) * 4;
  const blobs: [number, number, number][] = [
    [cx + j(), 22 + j(), 13 + rnd() * 3],
    [cx - 9 + j(), 27 + j(), 9 + rnd() * 4],
    [cx + 9 + j(), 27 + j(), 9 + rnd() * 4],
    [cx - 5 + j(), 14 + j(), 8 + rnd() * 4],
    [cx + 6 + j(), 15 + j(), 8 + rnd() * 4],
  ];
  // Hintere, dunklere Kugeln zuerst, dann vordere.
  for (const [x, y, r] of blobs) img.ball(x, y + 2, r, pal.slice(0, 4), rnd, 0.2);
  for (const [x, y, r] of blobs) img.ball(x - 1, y - 1, r - 3, pal.slice(1), rnd, 0.25);
  // Blatt-Struktur: kleine helle Tupfer
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(cx - 16 + rnd() * 32);
    const y = Math.floor(6 + rnd() * 28);
    if (img.opaque(x, y) && img.opaque(x + 1, y)) {
      img.set(x, y, pal[4]);
      if (rnd() < 0.5) img.set(x + 1, y, pal[5]);
    }
  }
  img.outline();
  return img.result();
}

function pine(rnd: () => number, snow: boolean): Pixels {
  const img = new Img(34, 64);
  const cx = 17;
  trunk(img, cx, 62, 19, 5, rnd);
  const tiers = 4;
  const pal = snow ? [0x12302a, 0x1b4234, 0x26573f, 0x33704c, 0x4a8a5c] : [0x12301e, 0x1a4428, 0x245a32, 0x30723c, 0x4a8f4c];
  let top = 3;
  for (let t = 0; t < tiers; t++) {
    const h = 15;
    const bottom = top + h;
    const halfW = 7 + t * 3.2;
    for (let y = top; y <= bottom; y++) {
      const f = (y - top) / h;
      const w = halfW * f + 1 + (rnd() < 0.3 ? 1 : 0);
      for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) {
        const rel = (x - cx) / Math.max(1, w);
        let light = 0.55 - rel * 0.4 - f * 0.25 + (rnd() - 0.5) * 0.15;
        if (y === bottom || (f > 0.85 && rnd() < 0.5)) light -= 0.3;
        img.shade(x, y, light, pal);
      }
    }
    top = bottom - 6;
  }
  if (snow) {
    for (let y = 1; y < img.h - 12; y++) {
      for (let x = 0; x < img.w; x++) {
        if (!img.opaque(x, y)) continue;
        const above = !img.opaque(x, y - 1) || !img.opaque(x, y - 2);
        if (above && rnd() < 0.85) img.set(x, y, rnd() < 0.7 ? 0xf2f6fa : 0xc8d6e4);
      }
    }
  }
  img.outline();
  return img.result();
}

function palm(rnd: () => number): Pixels {
  const img = new Img(48, 60);
  const lean = (rnd() - 0.5) * 8;
  const topX = 24 + lean;
  const topY = 16;
  // Stamm mit Ringen
  for (let i = 0; i <= 42; i++) {
    const t = i / 42;
    const x = 24 + lean * t * t;
    const y = 58 - t * (58 - topY);
    const ring = i % 4 === 0;
    for (let k = -2; k <= 2; k++) img.shade(x + k, y, ring ? 0.15 : 0.75 - (k + 2) * 0.15, [0x5a4026, 0x7a5a34, 0x9a7844, 0xb8955a]);
  }
  // Wedel
  const fronds = 6 + Math.floor(rnd() * 2);
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rnd() * 0.4;
    const len = 15 + rnd() * 6;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const x = topX + Math.cos(a) * i;
      const y = topY + Math.sin(a) * i * 0.6 + t * t * 9;
      const w = Math.max(1, Math.round(3.5 * (1 - t) + 1));
      for (let k = -w; k <= w; k++) {
        const light = 0.7 - Math.abs(k) / (w + 1) * 0.5 - (Math.sin(a) > 0 ? 0.25 : 0);
        img.shade(x + (Math.abs(Math.sin(a)) > 0.7 ? k : 0), y + (Math.abs(Math.sin(a)) > 0.7 ? 0 : k * 0.5), light, GREENS.slice(1));
      }
    }
  }
  img.ball(topX, topY + 2, 3, [0x5a3a1a, 0x7a5228, 0x9a6a34], rnd, 0);
  img.outline();
  return img.result();
}

function deadtree(rnd: () => number): Pixels {
  const img = new Img(36, 48);
  const col = (t: number) => (t < 0.5 ? 0x4a3c30 : 0x6e5a48);
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    img.line(x, y, x2, y2, col, w);
    if (depth <= 0) return;
    branch(x2, y2, a - 0.4 - rnd() * 0.4, len * 0.7, Math.max(1, w - 1), depth - 1);
    branch(x2, y2, a + 0.4 + rnd() * 0.4, len * 0.7, Math.max(1, w - 1), depth - 1);
  };
  branch(18, 46, -Math.PI / 2 + (rnd() - 0.5) * 0.3, 16, 4, 3);
  img.outline();
  return img.result();
}

function bush(rnd: () => number): Pixels {
  const img = new Img(28, 20);
  img.ball(9, 12, 7, GREENS.slice(0, 5), rnd, 0.25);
  img.ball(19, 12, 7, GREENS.slice(0, 5), rnd, 0.25);
  img.ball(14, 9, 7, GREENS.slice(1), rnd, 0.25);
  if (rnd() < 0.4) for (let i = 0; i < 5; i++) img.set(6 + rnd() * 16, 5 + rnd() * 10, rnd() < 0.5 ? 0xe04a5a : 0xf2d24a);
  img.outline();
  return img.result();
}

function rock(rnd: () => number, big: boolean): Pixels {
  const img = big ? new Img(40, 30) : new Img(20, 14);
  if (big) {
    img.ball(16, 18, 12, STONE, rnd, 0.1, 0.8);
    img.ball(26, 19, 10, STONE, rnd, 0.1, 0.8);
    img.ball(20, 12, 9, STONE.slice(1), rnd, 0.1, 0.85);
  } else {
    img.ball(10, 8, 8, STONE, rnd, 0.12, 0.65);
  }
  // Riss
  let x = img.w * (0.35 + rnd() * 0.3);
  for (let y = Math.floor(img.h * 0.3); y < img.h * 0.75; y++) {
    if (img.opaque(Math.round(x), y)) img.set(x, y, STONE[0]);
    x += rnd() < 0.5 ? -1 : 1;
  }
  img.outline();
  return img.result();
}

function cactus(rnd: () => number): Pixels {
  const img = new Img(26, 40);
  const pal = [0x1f5a2e, 0x2f7a3e, 0x46a050, 0x6cc46a, 0x9adc8a];
  const bar = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const t = (x - x0 + 0.5) / w;
        const round = y < y0 + 2 && (x === x0 || x === x0 + w - 1);
        if (round) continue;
        img.shade(x, y, 0.95 - Math.abs(t - 0.35) * 1.6 + ((x - x0) % 3 === 0 ? -0.2 : 0), pal);
      }
    }
  };
  bar(10, 4, 7, 35);
  const lh = 6 + Math.floor(rnd() * 8);
  bar(3, lh, 5, 12);
  bar(3, lh + 10, 8, 4);
  if (rnd() < 0.7) {
    const rh = 10 + Math.floor(rnd() * 8);
    bar(19, rh, 5, 10);
    bar(16, rh + 8, 8, 4);
  }
  img.outline();
  return img.result();
}

const CRYSTAL_PALS = [
  [0x2a1650, 0x4b2a8a, 0x6a3ab0, 0x9b6af0, 0xd8c4ff, 0xffffff],
  [0x0e3044, 0x14566e, 0x1c8aa0, 0x3fc4d4, 0xa8f4f8, 0xffffff],
  [0x4a1038, 0x7a1c5a, 0xb02a7a, 0xe05aa8, 0xffb8e0, 0xffffff],
];

function crystal(rnd: () => number, variant: number): Pixels {
  const img = new Img(30, 40);
  const pal = CRYSTAL_PALS[variant % CRYSTAL_PALS.length];
  const shards: [number, number, number, number][] = [
    [15, 38, 5, 30 + rnd() * 6],
    [8, 38, 4, 18 + rnd() * 6],
    [22, 38, 4, 16 + rnd() * 8],
  ];
  if (rnd() < 0.5) shards.push([11, 38, 3, 10 + rnd() * 5]);
  for (const [x, bottom, hw, h] of shards) {
    const lean = (x - 15) * 0.25;
    const top = bottom - h;
    img.polygon(
      [
        [x - hw, bottom],
        [x - hw + lean, top + 4],
        [x + lean, top],
        [x + hw + lean, top + 4],
        [x + hw, bottom],
      ],
      (px, py) => {
        const left = px < x + lean * ((bottom - py) / h);
        const l = (left ? 0.85 : 0.45) - ((py - top) / h) * 0.3;
        return pal[Math.max(0, Math.min(pal.length - 1, Math.round(l * (pal.length - 1) + (BAYER[(py & 3) * 4 + (px & 3)] - 0.5))))];
      },
    );
    img.set(x - hw + 1 + lean, top + 5, pal[5]);
  }
  img.outline(0x140a24);
  return img.result();
}

function scrap(rnd: () => number): Pixels {
  const img = new Img(40, 26);
  const metal = [0x2e2e36, 0x4a4a52, 0x6c6c78, 0x9a9aa6, 0xc4c4ce];
  const rust = [0x4a2414, 0x6e3a1e, 0x8a4a2a, 0xaa6a3a];
  for (let i = 0; i < 6; i++) {
    const w = 6 + Math.floor(rnd() * 12);
    const h = 4 + Math.floor(rnd() * 8);
    const x0 = 2 + Math.floor(rnd() * (36 - w));
    const y0 = 25 - h - Math.floor(rnd() * 10);
    const pal = rnd() < 0.3 ? rust : metal;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.shade(x, y, 0.8 - (y - y0) / h * 0.5 - (x - x0) / w * 0.2, pal);
    img.line(x0, y0, x0 + w - 1, y0, pal[pal.length - 1]);
  }
  // Zahnrad
  const gx = 10 + rnd() * 20;
  img.ball(gx, 12, 5, metal, rnd, 0);
  for (let a = 0; a < 8; a++) img.set(gx + Math.cos((a * Math.PI) / 4) * 6, 12 + Math.sin((a * Math.PI) / 4) * 6, metal[2]);
  img.set(gx, 12, metal[0]);
  // Leuchtende Leitung
  let x = 4 + rnd() * 30;
  let y = 14 + rnd() * 8;
  for (let i = 0; i < 10; i++) {
    if (img.opaque(Math.round(x), Math.round(y))) img.set(x, y, i % 3 ? 0x2fe0d8 : 0xc8fffa);
    x += rnd() < 0.6 ? 1 : 0;
    y += rnd() < 0.3 ? 1 : 0;
  }
  img.outline();
  return img.result();
}

function pylon(rnd: () => number): Pixels {
  const img = new Img(22, 64);
  const metal = [0x24242e, 0x3a3a46, 0x5c5c6c, 0x8a8a9a];
  for (let y = 10; y < 62; y++) for (let x = 9; x < 13; x++) img.shade(x, y, 0.9 - (x - 9) * 0.25, metal);
  for (const y of [18, 34]) img.rect(4, y, 14, 2, metal[2]);
  img.rect(3, 60, 16, 3, metal[1]);
  // Neonlicht
  const neon = rnd() < 0.5 ? [0x2fe0d8, 0xc8fffa] : [0xf04ab0, 0xffc0e8];
  img.ball(11, 6, 5, [neon[0], neon[0], neon[1]], rnd, 0);
  for (let y = 20; y < 58; y += 4) img.set(10, y, neon[0]);
  // Kabel
  img.line(4, 19, 0, 30, metal[0]);
  img.line(17, 35, 21, 46, metal[0]);
  img.outline();
  return img.result();
}

function tuft(rnd: () => number): Pixels {
  const img = new Img(14, 10);
  for (let i = 0; i < 6; i++) {
    const x = 1 + rnd() * 12;
    const h = 4 + rnd() * 5;
    const lean = (rnd() - 0.5) * 3;
    img.line(x, 9, x + lean, 9 - h, (t) => (t < 0.4 ? 0x2f7533 : t < 0.8 ? 0x47923d : 0x8fd161));
  }
  return img.result();
}

function flowers(rnd: () => number): Pixels {
  const img = new Img(16, 12);
  const colors = [0xe04a5a, 0xf2d24a, 0xf6f0f0, 0xb86ae0, 0x4ab0f0];
  const c = colors[Math.floor(rnd() * colors.length)];
  for (let i = 0; i < 4; i++) {
    const x = 2 + rnd() * 12;
    const y = 3 + rnd() * 6;
    img.line(x, y + 1, x, 11, 0x2f7533);
    img.set(x - 1, y, c);
    img.set(x + 1, y, c);
    img.set(x, y - 1, c);
    img.set(x, y + 1, c);
    img.set(x, y, 0xf2d24a);
  }
  return img.result();
}

function reeds(rnd: () => number): Pixels {
  const img = new Img(16, 24);
  for (let i = 0; i < 6; i++) {
    const x = 1 + rnd() * 14;
    const h = 12 + rnd() * 10;
    img.line(x, 23, x + (rnd() - 0.5) * 2, 23 - h, (t) => (t < 0.5 ? 0x4a6a30 : 0x86a84a));
    if (rnd() < 0.6) img.rect(Math.round(x), Math.round(23 - h), 2, 4, 0x7a5232);
  }
  return img.result();
}

/** Anzahl Varianten je Dekorationsart. */
export const DECOR_VARIANTS = 4;

export function generateDecor(kind: DecorKind, variant: number): Pixels {
  const rnd = mulberry32(0x5eed + variant * 7919 + kind.length * 104729 + kind.charCodeAt(0) * 31);
  switch (kind) {
    case 'oak': return oak(rnd);
    case 'pine': return pine(rnd, false);
    case 'snowpine': return pine(rnd, true);
    case 'palm': return palm(rnd);
    case 'deadtree': return deadtree(rnd);
    case 'bush': return bush(rnd);
    case 'rock': return rock(rnd, false);
    case 'boulder': return rock(rnd, true);
    case 'cactus': return cactus(rnd);
    case 'crystal': return crystal(rnd, variant);
    case 'scrap': return scrap(rnd);
    case 'pylon': return pylon(rnd);
    case 'tuft': return tuft(rnd);
    case 'flowers': return flowers(rnd);
    case 'reeds': return reeds(rnd);
    case 'house': return house(rnd, variant);
    case 'tower': return tower(rnd, variant);
    case 'neonhouse': return neonhouse(rnd, variant);
    case 'stall': return stall(rnd, variant);
    case 'well': return well(rnd, variant);
    case 'chest': return chest(rnd, variant % 2 === 1);
    case 'shrine': return shrine(rnd);
    case 'obelisk': return obelisk(rnd);
  }
}

export const DECOR_KINDS: DecorKind[] = [
  'oak', 'pine', 'snowpine', 'palm', 'cactus', 'deadtree', 'bush', 'flowers', 'rock', 'boulder', 'reeds', 'crystal', 'scrap', 'pylon', 'tuft',
  'house', 'tower', 'neonhouse', 'stall', 'well', 'chest', 'shrine', 'obelisk',
];

/** Kleine Symbole (16×16) für Beute und Inventar. */
export const ICON_KINDS = ['shards', 'potion', 'dagger', 'tunic', 'leather', 'amulet', 'questitem'] as const;
export type IconKind = (typeof ICON_KINDS)[number];

export function generateIcon(kind: IconKind): Pixels {
  const img = new Img(16, 16);
  const rnd = mulberry32(kind.length * 31 + kind.charCodeAt(0));
  switch (kind) {
    case 'shards': {
      const pal = [0x0e3044, 0x1c8aa0, 0x3fc4d4, 0xa8f4f8, 0xffffff];
      img.polygon([[4, 14], [5, 6], [7, 3], [9, 6], [8, 14]], (x, y) => pal[x < 6 ? 3 : y > 10 ? 1 : 2]);
      img.polygon([[8, 14], [10, 8], [12, 6], [13, 9], [12, 14]], (x) => pal[x < 11 ? 2 : 1]);
      img.set(6, 5, pal[4]);
      break;
    }
    case 'potion': {
      img.rect(7, 2, 3, 3, 0xb0a090);
      img.rect(6, 1, 5, 1, 0x7a5232);
      img.ball(8.5, 10, 5, [0x6a0e1e, 0xa01a30, 0xd83048, 0xff7080], rnd, 0);
      img.set(6, 8, 0xffffff);
      break;
    }
    case 'dagger': {
      img.line(4, 12, 12, 4, (t) => (t < 0.5 ? 0xc0c0cc : 0xe8eef4), 2);
      img.line(3, 9, 7, 13, 0xd0a048);
      img.line(1, 15, 4, 12, 0x7a5232, 2);
      break;
    }
    case 'tunic':
    case 'leather': {
      const pal = kind === 'tunic' ? [0x14566e, 0x1c8aa0, 0x3fc4d4, 0xa8f4f8] : [0x4a2a14, 0x6e4a30, 0x8a6240, 0xb08a5a];
      img.polygon([[2, 5], [5, 2], [11, 2], [14, 5], [12, 8], [11, 7], [11, 14], [5, 14], [5, 7], [4, 8]], (x, y) => img_shade(pal, x, y));
      if (kind === 'leather') img.rect(5, 10, 6, 1, 0xd0a048);
      break;
    }
    case 'questitem': {
      // Leuchtendes Bündel mit Fragezeichen-Glanz
      img.ball(8, 9, 5.5, [0x6a4a10, 0xa07a20, 0xe0b030, 0xffe890], rnd, 0.05);
      img.rect(7, 5, 2, 1, 0xffffff);
      img.rect(8, 6, 1, 3, 0xffffff);
      img.set(8, 11, 0xffffff);
      break;
    }
    case 'amulet': {
      img.line(3, 2, 8, 8, 0xd0a048);
      img.line(13, 2, 8, 8, 0xd0a048);
      img.ball(8, 11, 3.5, [0x2a1650, 0x6a3ab0, 0x9b6af0, 0xd8c4ff], rnd, 0);
      break;
    }
  }
  img.outline();
  return img.result();
}

function img_shade(pal: number[], x: number, y: number): number {
  const l = 0.9 - (x / 16) * 0.5 - (y / 16) * 0.3;
  return pal[Math.max(0, Math.min(pal.length - 1, Math.round(l * (pal.length - 1))))];
}

// ---------------------------------------------------------------- Gebäude und Geheimnisse

const WOOD = [0x3a2418, 0x5a3a24, 0x7a5232, 0x9a6e44];
const PLASTER = [0x9a8a70, 0xc8b898, 0xe4d8bc, 0xf4ecd8];
const ROOFS = [
  [0x5a1a14, 0x8a2a1e, 0xb0402c, 0xd0644a],
  [0x1e3a5a, 0x2a5280, 0x3a6ea8, 0x5a8ec8],
  [0x2a4a1e, 0x3a6a2a, 0x4e8a38, 0x6aa84c],
  [0x4a3a2a, 0x6a523a, 0x8a6e4e, 0xa88a64],
];
const METAL = [0x1c1c26, 0x2c2c3a, 0x40404e, 0x5c5c6c, 0x8a8a9a];
const NEONS = [0x2fe0d8, 0xf04ab0, 0xffd84a, 0x9b6af0];

function house(rnd: () => number, v: number): Pixels {
  const img = new Img(72, 76);
  const roof = ROOFS[v % ROOFS.length];
  const wallTop = 36;
  // Wände (Fachwerk)
  for (let y = wallTop; y < 74; y++) for (let x = 8; x < 64; x++) img.shade(x, y, 0.75 - (x - 8) / 56 * 0.35, PLASTER);
  for (const x of [8, 22, 36, 50, 63]) img.rect(x, wallTop, 3, 38, WOOD[1]);
  img.rect(8, wallTop, 56, 3, WOOD[1]);
  img.rect(8, 54, 56, 2, WOOD[1]);
  img.line(11, 54, 21, 38, WOOD[2], 2);
  img.line(53, 38, 62, 54, WOOD[2], 2);
  // Tür und Fenster
  img.rect(31, 56, 10, 18, WOOD[0]);
  img.rect(32, 57, 8, 17, WOOD[2]);
  img.set(38, 65, 0xd0a048);
  for (const wx of [13, 49]) {
    img.rect(wx, 60, 9, 8, WOOD[0]);
    img.rect(wx + 1, 61, 7, 6, rnd() < 0.5 ? 0xf4d27a : 0x3a5a7a);
    img.rect(wx + 4, 61, 1, 6, WOOD[0]);
  }
  // Dach
  img.polygon([[2, 40], [36, 4], [70, 40]], (x, y) => {
    const row = Math.floor((y - 4) / 4) % 2;
    const l = 0.85 - (x - 2) / 68 * 0.5 + (row ? -0.1 : 0);
    return roof[Math.max(0, Math.min(3, Math.round(l * 3)))];
  });
  for (let y = 8; y < 40; y += 4) img.line(36 - (y - 4), y, 36 + (y - 4), y, roof[0]);
  // Schornstein
  img.rect(50, 10, 6, 14, 0x6a6a74);
  img.rect(49, 9, 8, 2, 0x4a4a54);
  img.outline();
  return img.result();
}

function tower(rnd: () => number, v: number): Pixels {
  const img = new Img(52, 104);
  const roof = ROOFS[v % ROOFS.length];
  for (let y = 34; y < 102; y++) {
    for (let x = 8; x < 44; x++) {
      const brick = ((y >> 2) % 2 === 0 ? x : x + 3) % 7 === 0 || y % 4 === 0;
      img.shade(x, y, 0.8 - (x - 8) / 36 * 0.5 + (brick ? -0.2 : 0) + (rnd() - 0.5) * 0.06, STONE);
    }
  }
  img.rect(20, 82, 12, 20, WOOD[0]);
  img.rect(21, 83, 10, 19, WOOD[2]);
  for (const wy of [44, 62]) {
    img.rect(23, wy, 6, 10, 0x1a1424);
    img.rect(24, wy + 1, 4, 8, v % 2 ? 0x9b6af0 : 0xf4d27a);
  }
  img.polygon([[2, 38], [26, 0], [50, 38]], (x) => roof[Math.max(0, Math.min(3, Math.round((0.9 - (x - 2) / 48 * 0.6) * 3)))]);
  img.rect(4, 34, 44, 4, STONE[1]);
  img.outline();
  return img.result();
}

function neonhouse(rnd: () => number, v: number): Pixels {
  const img = new Img(72, 80);
  const neon = NEONS[v % NEONS.length];
  // Kastenbau mit Flachdach und Aufbau
  for (let y = 22; y < 78; y++) for (let x = 6; x < 66; x++) img.shade(x, y, 0.7 - (x - 6) / 60 * 0.4 + (y % 12 === 0 ? -0.2 : 0), METAL);
  for (let y = 12; y < 22; y++) for (let x = 36; x < 60; x++) img.shade(x, y, 0.6 - (x - 36) / 24 * 0.3, METAL);
  img.rect(4, 20, 64, 3, METAL[4]);
  // Fensterbänder mit Licht
  for (const wy of [30, 46]) {
    img.rect(10, wy, 52, 8, 0x0e0e18);
    for (let x = 12; x < 60; x += 6) if (rnd() < 0.7) img.rect(x, wy + 2, 4, 4, rnd() < 0.5 ? 0xf4d27a : neon);
  }
  // Tür
  img.rect(30, 60, 12, 18, 0x0e0e18);
  img.rect(31, 61, 10, 2, neon);
  // Leuchtschild und Kanten
  img.rect(8, 23, 56, 1, neon);
  img.rect(14, 4, 18, 10, 0x0e0e18);
  for (let x = 16; x < 30; x += 2) img.rect(x, 7, 1, 4, neon);
  img.line(22, 14, 22, 20, METAL[2]);
  // Antenne
  img.line(54, 12, 54, 0, METAL[3]);
  img.set(54, 0, 0xff3a5a);
  img.outline();
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (!img.opaque(x, y) && y > 20 && y < 26) img.glow(x, y, neon, 60);
  return img.result();
}

function stall(rnd: () => number, v: number): Pixels {
  const img = new Img(52, 44);
  const cloth = [[0xb0402c, 0xf4ecd8], [0x2a5280, 0xf4ecd8], [0x3a6a2a, 0xe0b030], [0x6a3ab0, 0x2fe0d8]][v % 4];
  img.rect(6, 16, 3, 26, WOOD[1]);
  img.rect(43, 16, 3, 26, WOOD[1]);
  img.rect(4, 28, 44, 6, WOOD[2]);
  img.rect(4, 34, 44, 6, WOOD[1]);
  for (let i = 0; i < 6; i++) img.ball(9 + i * 7, 26, 2.5, [0x6a1a1a, 0xc04030, 0xf08a3a, 0xffd84a].map((c) => (rnd() < 0.5 ? c : c ^ 0x204000)), rnd, 0);
  img.polygon([[0, 18], [6, 4], [46, 4], [52, 18]], (x) => cloth[Math.floor(x / 6) % 2]);
  img.outline();
  return img.result();
}

function well(rnd: () => number, v: number): Pixels {
  const img = new Img(40, 44);
  if (v % 2 === 0) {
    for (let y = 26; y < 42; y++) for (let x = 6; x < 34; x++) img.shade(x, y, 0.8 - (x - 6) / 28 * 0.5 + ((x + (y >> 2)) % 6 === 0 ? -0.2 : 0), STONE);
    img.rect(9, 26, 22, 4, 0x1a3a6a);
    img.rect(8, 6, 3, 22, WOOD[1]);
    img.rect(29, 6, 3, 22, WOOD[1]);
    img.polygon([[4, 10], [20, 0], [36, 10]], (x) => ROOFS[0][Math.round((0.9 - x / 40 * 0.6) * 3)]);
    img.line(20, 10, 20, 22, 0x6a6a74);
    img.rect(18, 22, 5, 4, WOOD[2]);
  } else {
    // Holo-Brunnen der Technokratie
    for (let y = 30; y < 42; y++) for (let x = 4; x < 36; x++) img.shade(x, y, 0.7 - (x - 4) / 32 * 0.4, METAL);
    img.rect(6, 30, 28, 2, 0x2fe0d8);
    img.ball(20, 16, 8, [0x0e8a88, 0x2fe0d8, 0xa8fff8, 0xffffff], rnd, 0.1);
    for (let y = 0; y < 30; y++) for (let x = 0; x < 40; x++) if (Math.hypot(x - 20, y - 16) < 13) img.glow(x, y, 0x2fe0d8, 70);
  }
  img.outline();
  return img.result();
}

function chest(rnd: () => number, open: boolean): Pixels {
  const img = new Img(24, 22);
  const top = open ? 10 : 6;
  for (let y = top + 4; y < 21; y++) for (let x = 2; x < 22; x++) img.shade(x, y, 0.8 - (x - 2) / 20 * 0.4 + (y % 5 === 0 ? -0.25 : 0), WOOD);
  if (open) {
    img.rect(3, 2, 18, 6, WOOD[1]);
    img.rect(4, 11, 16, 3, 0x1a1424);
    for (let i = 0; i < 4; i++) img.set(6 + i * 3, 12, 0xffd84a);
  } else {
    img.polygon([[2, 10], [4, 4], [20, 4], [22, 10]], (x) => WOOD[x < 12 ? 3 : 2]);
  }
  img.rect(2, top + 4, 20, 2, 0xd0a048);
  img.rect(10, top + 4, 4, 5, 0xe0b030);
  img.set(11 + Math.floor(rnd() * 2), top + 6, 0x3a2418);
  img.outline();
  return img.result();
}

function shrine(rnd: () => number): Pixels {
  const img = new Img(36, 44);
  for (let y = 30; y < 42; y++) for (let x = 4; x < 32; x++) img.shade(x, y, 0.8 - (x - 4) / 28 * 0.5, STONE);
  for (let y = 22; y < 30; y++) for (let x = 10; x < 26; x++) img.shade(x, y, 0.85 - (x - 10) / 16 * 0.5, STONE);
  const pal = CRYSTAL_PALS[1];
  img.polygon([[14, 22], [15, 8], [18, 2], [21, 8], [22, 22]], (x) => pal[x < 18 ? 4 : 2]);
  img.outline();
  for (let y = 0; y < 30; y++) for (let x = 0; x < 36; x++) {
    const d = Math.hypot(x - 18, y - 12);
    if (d < 14) img.glow(x, y, 0x3fc4d4, Math.max(0, 90 - d * 6));
  }
  void rnd;
  return img.result();
}

function obelisk(rnd: () => number): Pixels {
  const img = new Img(28, 72);
  img.polygon([[6, 70], [8, 12], [14, 2], [20, 12], [22, 70]], (x, y) => {
    const l = (x < 14 ? 0.55 : 0.3) + (rnd() - 0.5) * 0.08 - y / 72 * 0.1;
    return [0x14121c, 0x22202e, 0x302c40, 0x423c56][Math.max(0, Math.min(3, Math.round(l * 3)))];
  });
  // Leuchtende Runen
  for (let y = 18; y < 62; y += 7) {
    const x = 11 + Math.floor(rnd() * 5);
    img.rect(x, y, 3, 1, 0x9b6af0);
    img.rect(x + 1, y + 1, 1, 3, 0xd8c4ff);
  }
  img.rect(3, 66, 22, 6, STONE[1]);
  img.outline();
  for (let y = 0; y < 72; y++) {
    for (let x = 0; x < 28; x++) {
      if (img.opaque(x, y) || y < 10 || y > 64) continue;
      if (img.opaque(x - 2, y) || img.opaque(x + 2, y) || img.opaque(x - 1, y) || img.opaque(x + 1, y)) img.glow(x, y, 0x9b6af0, 70);
    }
  }
  return img.result();
}

// ---------------------------------------------------------------- Wohlstand: Laterne, Banner, Statue

export function lantern(): Pixels {
  const img = new Img(14, 36);
  img.rect(6, 10, 2, 24, METAL[2]);
  img.rect(3, 33, 8, 3, METAL[1]);
  img.rect(3, 2, 8, 9, METAL[1]);
  img.rect(4, 3, 6, 7, 0xffd84a);
  img.rect(5, 4, 2, 3, 0xfff4c0);
  img.rect(2, 1, 10, 2, METAL[3]);
  img.outline();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 14; x++) if (Math.hypot(x - 7, y - 6) < 8) img.glow(x, y, 0xffd84a, Math.max(0, 80 - Math.hypot(x - 7, y - 6) * 10));
  return img.result();
}

export function banner(color: number): Pixels {
  const img = new Img(18, 44);
  img.rect(2, 2, 2, 42, WOOD[1]);
  const shade = (f: number) => (Math.round((color >> 16) * f) << 16) | (Math.round(((color >> 8) & 255) * f) << 8) | Math.round((color & 255) * f);
  img.polygon([[4, 4], [17, 4], [17, 26], [10, 21], [4, 26]], (x) => shade(x < 10 ? 1 : 0.8));
  img.rect(8, 9, 5, 5, 0xf4f0e8);
  img.rect(3, 1, 15, 2, 0xd0a048);
  img.outline();
  return img.result();
}

export function statue(): Pixels {
  const img = new Img(40, 72);
  const pal = STONE;
  // Sockel
  for (let y = 56; y < 72; y++) for (let x = 6; x < 34; x++) img.shade(x, y, 0.8 - (x - 6) / 28 * 0.5 + (y === 56 ? 0.2 : 0), pal);
  // Figur: Beine, Körper, Kopf, erhobenes Schwert
  for (let y = 40; y < 56; y++) for (let x = 15; x < 25; x++) if (x < 19 || x > 20) img.shade(x, y, 0.7 - (x - 15) / 10 * 0.4, pal);
  for (let y = 22; y < 41; y++) for (let x = 13; x < 27; x++) img.shade(x, y, 0.85 - (x - 13) / 14 * 0.5, pal);
  img.ball(20, 16, 6, pal.slice(1), mulberry32(3), 0);
  img.line(27, 26, 32, 18, pal[3], 3);
  img.line(32, 18, 32, 2, pal[5], 2);
  img.rect(29, 17, 7, 2, pal[2]);
  img.line(13, 26, 9, 38, pal[2], 3);
  img.outline();
  return img.result();
}

// ---------------------------------------------------------------- Botschaften und Gefallen-Marker

export function signpost(): Pixels {
  const img = new Img(26, 34);
  img.rect(11, 12, 4, 22, WOOD[1]);
  for (let y = 2; y < 14; y++) for (let x = 1; x < 25; x++) img.shade(x, y, 0.85 - (y - 2) / 12 * 0.4, WOOD);
  for (const y of [5, 8, 11]) img.rect(4, y, 18, 1, WOOD[0]);
  img.outline();
  return img.result();
}

export function grave(): Pixels {
  const img = new Img(20, 26);
  img.polygon([[3, 25], [3, 8], [6, 3], [14, 3], [17, 8], [17, 25]], (x, y) => STONE[Math.max(0, Math.min(5, Math.round((0.85 - (x - 3) / 14 * 0.5 - y / 26 * 0.1) * 5)))]);
  img.rect(9, 8, 2, 10, STONE[1]);
  img.rect(6, 11, 8, 2, STONE[1]);
  img.rect(1, 23, 18, 3, 0x4a6a3a);
  img.outline();
  return img.result();
}
