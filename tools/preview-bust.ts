/**
 * Screenshot-Bogen Oberweite (M30): je Kleidung ein Bild, Zeilen = Stufe × Richtung, Spalten = Laufen | Hieb | Zauber;
 * dazu eine Übersicht aller Kleidungen (Stand-Bild).
 * npx vite-node tools/preview-bust.ts [Ausgabe-Präfix, Standard screenshots/m30]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { applyWarp, bustMaps, bustWarps } from '../src/character/bust';
import { dress } from '../src/character/outfit';
import { ANIMS, BUST_MAX, DEFAULT_APPEARANCE, FRAME, layersFor, paintGlow, recolor, type Appearance, type Palettes } from '../src/character/lpc';
import type { Item } from '../src/rpg/items';
import { decodePng, encodePng } from './png';

const BASE = 'public/assets/lpc/';
const palettes = JSON.parse(readFileSync(`${BASE}palettes.json`, 'utf8')) as Palettes;
const prefix = process.argv[2] ?? 'screenshots/m30';
const S = 2;
const SHOWN = ['walk', 'slash', 'spellcast'];

const cache = new Map<string, { width: number; height: number; data: Uint8ClampedArray } | null>();
function img(path: string) {
  if (!cache.has(path)) {
    try {
      cache.set(path, decodePng(readFileSync(path)));
    } catch {
      cache.set(path, null);
    }
  }
  const c = cache.get(path);
  return c && { ...c, data: c.data.slice() };
}

/** Wie buildCharacter, nur ohne Canvas. */
function compose(a: Appearance, anim: string): Uint8ClampedArray {
  const def = ANIMS[anim];
  const w = def.frames * FRAME;
  const out = new Uint8ClampedArray(w * def.rows * FRAME * 4);
  const layers = layersFor(a);
  const head = layers.find((l) => l.dir.startsWith('head/heads/'))!;
  const level = a.bust ?? 0;
  const headImg = img(`${BASE}${head.dir}/${anim}.png`)!;
  const walkImg = img(`${BASE}${head.dir}/walk.png`)!;
  const maps = level ? bustMaps(level, headImg.data, headImg.width, def.frames, def.rows, walkImg.data, walkImg.width) : null;
  for (const l of layers) {
    const im = img(`${BASE}${l.dir}/${anim}.png`);
    if (!im) continue;
    if (l.material) recolor(im.data, palettes, l.material, l.color, l.base);
    if (l.eyes) recolor(im.data, palettes, 'eye', l.eyes);
    if (l.glow) paintGlow(im.data, palettes, l.color, l.glow);
    if (maps && bustWarps(l.dir)) maps.forEach((row, r) => row.forEach((m, f) => m && applyWarp(im.data, im.width, f, r, m)));
    for (let i = 0; i < out.length; i += 4) {
      const al = im.data[i + 3] / 255;
      if (!al) continue;
      for (let c = 0; c < 3; c++) out[i + c] = out[i + c] * (1 - al) + im.data[i + c] * al;
      out[i + 3] = Math.max(out[i + 3], im.data[i + 3]);
    }
  }
  return out;
}

const item = (slot: Item['slot'], base: string, color: string, style?: string): Item => ({ id: base, slot, base, name: base, rarity: 'common', level: 1, bonus: {}, color, style });
const outfits: Record<string, Partial<Record<Item['slot'], Item>>> = {
  hemd: { armor: item('armor', 'tunic', 'white', 'shirt'), legs: item('legs', 'pants', 'tan'), feet: item('feet', 'shoes', 'brown'), weapon: item('weapon', 'dagger', '') },
  bluse: { armor: item('armor', 'tunic', 'red', 'blouse'), legs: item('legs', 'pants', 'charcoal'), feet: item('feet', 'boots', 'black'), weapon: item('weapon', 'dagger', '') },
  korsett: { armor: item('armor', 'tunic', 'navy', 'corset'), legs: item('legs', 'pants', 'tan'), feet: item('feet', 'boots', 'brown'), weapon: item('weapon', 'dagger', '') },
  leder: { armor: item('armor', 'leather', ''), legs: item('legs', 'pants', 'brown'), feet: item('feet', 'boots', 'black'), weapon: item('weapon', 'dagger', '') },
  platte: { armor: item('armor', 'plate', 'steel'), legs: item('legs', 'pants', 'charcoal'), feet: item('feet', 'boots', 'black'), weapon: item('weapon', 'dagger', '') },
  ohne: {},
};

const cols = SHOWN.reduce((n, a) => n + ANIMS[a].frames, 0) + SHOWN.length - 1;
for (const [name, eq] of Object.entries(outfits)) {
  const W = cols * FRAME * S;
  const H = (BUST_MAX + 1) * 4 * FRAME * S;
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) rgb.set((Math.floor(i / W / (FRAME * S * 4)) % 2 ? [0x52, 0x9a, 0x3e] : [0x5c, 0xab, 0x44]), i * 3);
  for (let level = 0; level <= BUST_MAX; level++) {
    const look = dress({ ...DEFAULT_APPEARANCE, race: 'human', body: 'female', hair: 'ponytail', hairColor: 'chestnut', skin: 'light', bust: level }, eq);
    let col = 0;
    for (const anim of SHOWN) {
      const def = ANIMS[anim];
      const px = compose(look, anim);
      for (let r = 0; r < 4; r++) {
        for (let f = 0; f < def.frames; f++) {
          for (let y = 0; y < FRAME; y++) for (let x = 0; x < FRAME; x++) {
            const s = ((r * FRAME + y) * def.frames * FRAME + f * FRAME + x) * 4;
            const al = px[s + 3] / 255;
            if (!al) continue;
            for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
              const d = ((((level * 4 + r) * FRAME + y) * S + sy) * W + ((col + f) * FRAME + x) * S + sx) * 3;
              for (let c = 0; c < 3; c++) rgb[d + c] = Math.round(rgb[d + c] * (1 - al) + px[s + c] * al);
            }
          }
        }
      }
      col += def.frames + 1;
    }
  }
  writeFileSync(`${prefix}-${name}.png`, encodePng(W, H, rgb));
  console.log(`${prefix}-${name}.png`);
}

// Übersicht: je Kleidung ein Block (Stufen nebeneinander, Richtungen untereinander), Stand-Bild, 3-fach
{
  const Z = 3, CW = 36, CH = 50, X0 = 14, Y0 = 12;
  const names = Object.keys(outfits);
  const W = names.length * (BUST_MAX + 1) * CW * Z + (names.length - 1) * 8 * Z;
  const H = 4 * CH * Z;
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) rgb.set([0x5c, 0xab, 0x44], i * 3);
  names.forEach((name, n) => {
    for (let level = 0; level <= BUST_MAX; level++) {
      const look = dress({ ...DEFAULT_APPEARANCE, race: 'human', body: 'female', hair: 'ponytail', hairColor: 'chestnut', skin: 'light', bust: level }, outfits[name]);
      const px = compose(look, 'walk');
      const ox = (n * ((BUST_MAX + 1) * CW + 8) + level * CW) * Z;
      for (let r = 0; r < 4; r++) {
        for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
          const s = ((r * FRAME + Y0 + y) * 9 * FRAME + X0 + x) * 4;
          const al = px[s + 3] / 255;
          if (!al) continue;
          for (let sy = 0; sy < Z; sy++) for (let sx = 0; sx < Z; sx++) {
            const d = (((r * CH + y) * Z + sy) * W + ox + x * Z + sx) * 3;
            for (let c = 0; c < 3; c++) rgb[d + c] = Math.round(rgb[d + c] * (1 - al) + px[s + c] * al);
          }
        }
      }
    }
  });
  writeFileSync(`${prefix}-uebersicht.png`, encodePng(W, H, rgb));
  console.log(`${prefix}-uebersicht.png`);
}
