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
  }
}

export const DECOR_KINDS: DecorKind[] = [
  'oak', 'pine', 'snowpine', 'palm', 'cactus', 'deadtree', 'bush', 'flowers', 'rock', 'boulder', 'reeds', 'crystal', 'scrap', 'pylon', 'tuft',
];
