/** Prozedural animierte Kreaturen (Frames als RGBA-Pixel): Schleim, Drohne, Irrlicht, Energiekugel. */
import { mulberry32 } from '../world/rng';
import { Img, type Pixels } from './procSprites';

export const SLIME_PALETTES = [
  [0x1d5a1e, 0x2f8a2c, 0x4cb53e, 0x86dc62, 0xc8f4a0], // Grün
  [0x1e3f6a, 0x2f64a0, 0x4c94d0, 0x8cc8f0, 0xe0f4ff], // Eis
  [0x3a1a5a, 0x5a2a8a, 0x8a44b8, 0xb47ae0, 0xe0c4ff], // Gift
  [0x7a5420, 0xa8782e, 0xd0a048, 0xeac67a, 0xfff0c0], // Sand
  [0x0e4a44, 0x186e62, 0x24a088, 0x52d0b0, 0xb0f8e4], // Dschungel
];

export const CREATURE_FRAMES = 4;

function slime(color: number, frame: number): Pixels {
  const img = new Img(30, 26);
  const shapes = [
    [11, 7.5],
    [10, 8.5],
    [9, 10],
    [12, 6.5],
  ];
  const [rx, ry] = shapes[frame % shapes.length];
  const cx = 15;
  const bottom = 24;
  const cy = bottom - ry;
  const pal = SLIME_PALETTES[color % SLIME_PALETTES.length];
  const rnd = mulberry32(17 + frame);
  img.ball(cx, cy, rx, pal, rnd, 0.02, ry / rx);
  // Glanzpunkt und Augen
  img.set(cx - rx * 0.45, cy - ry * 0.45, 0xffffff);
  img.set(cx - rx * 0.45 + 1, cy - ry * 0.45, pal[4]);
  const ey = Math.round(cy - ry * 0.05);
  for (const ex of [cx - 4, cx + 3]) {
    img.set(ex, ey, 0x101018);
    img.set(ex, ey + 1, 0x101018);
  }
  img.outline(0x101018);
  return img.result();
}

function drone(frame: number): Pixels {
  const img = new Img(32, 30);
  const metal = [0x24242e, 0x3a3a46, 0x5c5c6c, 0x8a8a9a, 0xc0c0cc];
  const rnd = mulberry32(5);
  // Rotor (dreht: wechselnde Länge)
  const rl = [12, 6, 12, 2][frame % 4];
  img.rect(16 - rl, 4, rl * 2, 1, metal[3]);
  img.rect(15, 5, 2, 4, metal[2]);
  // Rumpf
  img.ball(16, 15, 10, metal, rnd, 0, 0.55);
  img.rect(7, 16, 18, 1, metal[1]);
  // Auge
  const eye = frame % 2 === 0 ? [0xff3a5a, 0xffc0c8] : [0xc01a3a, 0xff6070];
  img.rect(14, 14, 4, 3, eye[0]);
  img.set(15, 14, eye[1]);
  // Beinchen
  img.line(9, 19, 7, 23, metal[1]);
  img.line(23, 19, 25, 23, metal[1]);
  img.outline();
  // Düsenleuchten (transparent)
  const flick = frame % 2 === 0 ? 3 : 2;
  for (let y = 0; y < flick; y++) for (let x = -2; x <= 2; x++) img.glow(16 + x, 22 + y, 0x2fe0d8, 200 - y * 60 - Math.abs(x) * 30);
  return img.result();
}

function wisp(frame: number): Pixels {
  const img = new Img(26, 30);
  const core = [0x5a2ab0, 0x8a5af0, 0xc4a8ff, 0xffffff];
  const rnd = mulberry32(9 + frame);
  const r = [6, 6.5, 7, 6.5][frame % 4];
  // Flammenschweif nach oben
  for (let i = 0; i < 9; i++) {
    const w = (9 - i) / 2.2;
    const y = 18 - r - i;
    const sway = Math.sin(i * 0.8 + frame * 1.6) * 1.5;
    for (let x = -w; x <= w; x++) img.shade(13 + x + sway, y, 0.4 + (1 - Math.abs(x) / (w + 1)) * 0.5 - i * 0.04, core.slice(0, 3));
  }
  img.ball(13, 17, r, core, rnd, 0.05);
  img.set(11, 15, 0xffffff);
  img.set(15, 15, 0xffffff);
  // Leuchthof
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const d = Math.hypot(x - 13, y - 17);
      if (d < r + 5) img.glow(x, y, 0x9b6af0, Math.max(0, 110 - (d - r) * 22));
    }
  }
  return img.result();
}

function bolt(frame: number): Pixels {
  const img = new Img(12, 12);
  const pal = [0x0e8a88, 0x2fe0d8, 0xa8fff8, 0xffffff];
  img.ball(6, 6, frame % 2 ? 3.5 : 3, pal, mulberry32(1), 0);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const d = Math.hypot(x - 6, y - 6);
    if (d < 6) img.glow(x, y, 0x2fe0d8, Math.max(0, 140 - d * 30));
  }
  return img.result();
}

export type CreatureKind = 'slime0' | 'slime1' | 'slime2' | 'slime3' | 'slime4' | 'drone' | 'wisp' | 'bolt';
export const CREATURE_KINDS: CreatureKind[] = ['slime0', 'slime1', 'slime2', 'slime3', 'slime4', 'drone', 'wisp', 'bolt'];

export function generateCreature(kind: CreatureKind, frame: number): Pixels {
  if (kind.startsWith('slime')) return slime(Number(kind.slice(5)), frame);
  if (kind === 'drone') return drone(frame);
  if (kind === 'wisp') return wisp(frame);
  return bolt(frame);
}
