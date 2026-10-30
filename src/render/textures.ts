import Phaser from 'phaser';
import { CREATURE_FRAMES, CREATURE_KINDS, generateCreature } from './creatures';
import { DECOR_KINDS, DECOR_VARIANTS, generateDecor, type Pixels } from './procSprites';

export const ATLAS = 'decor';

/** Schattengrößen (Breite, Höhe) als eigene Frames. */
export const SHADOWS = { s: [16, 6], m: [26, 8], l: [36, 10] } as const;

function ellipse(w: number, h: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2);
      const dy = (y + 0.5 - h / 2) / (h / 2);
      if (dx * dx + dy * dy > 1) continue;
      const i = (y * w + x) * 4;
      data[i] = 10;
      data[i + 1] = 8;
      data[i + 2] = 20;
      data[i + 3] = 90;
    }
  }
  return { w, h, data };
}

/**
 * Erzeugt alle Dekorations-Sprites (alle Varianten) prozedural und packt sie in eine
 * Atlas-Textur, damit sie in einem Draw-Batch gezeichnet werden. Frames heißen "<art>:<variante>".
 */
export function createDecorAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS)) return;
  const entries: { key: string; img: Pixels }[] = [];
  for (const kind of DECOR_KINDS) for (let v = 0; v < DECOR_VARIANTS; v++) entries.push({ key: `${kind}:${v}`, img: generateDecor(kind, v) });
  for (const [k, [w, h]] of Object.entries(SHADOWS)) entries.push({ key: `shadow-${k}`, img: ellipse(w, h) });

  const pad = 2;
  const width = 512;
  let x = pad;
  let y = pad;
  let rowH = 0;
  const placed: { key: string; x: number; y: number; img: Pixels }[] = [];
  for (const e of entries) {
    if (x + e.img.w + pad > width) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    placed.push({ key: e.key, x, y, img: e.img });
    x += e.img.w + pad;
    rowH = Math.max(rowH, e.img.h);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = y + rowH + pad;
  const ctx = canvas.getContext('2d')!;
  for (const p of placed) ctx.putImageData(new ImageData(p.img.data as Uint8ClampedArray<ArrayBuffer>, p.img.w, p.img.h), p.x, p.y);

  const tex = scene.textures.addCanvas(ATLAS, canvas)!;
  for (const p of placed) tex.add(p.key, 0, p.x, p.y, p.img.w, p.img.h);
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

export const CREATURES = 'creatures';

/** Erzeugt alle Kreaturen-Frames in einer Atlas-Textur und legt Loop-Animationen "<art>:loop" an. */
export function createCreatureAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(CREATURES)) return;
  const frames: { key: string; img: Pixels }[] = [];
  for (const k of CREATURE_KINDS) for (let f = 0; f < CREATURE_FRAMES; f++) frames.push({ key: `${k}:${f}`, img: generateCreature(k, f) });
  const pad = 2;
  const cell = 34;
  const cols = CREATURE_FRAMES;
  const canvas = document.createElement('canvas');
  canvas.width = cols * (cell + pad);
  canvas.height = CREATURE_KINDS.length * (cell + pad);
  const ctx = canvas.getContext('2d')!;
  frames.forEach((f, i) => {
    const x = (i % cols) * (cell + pad);
    const y = Math.floor(i / cols) * (cell + pad);
    ctx.putImageData(new ImageData(f.img.data as Uint8ClampedArray<ArrayBuffer>, f.img.w, f.img.h), x, y);
  });
  const tex = scene.textures.addCanvas(CREATURES, canvas)!;
  frames.forEach((f, i) => tex.add(f.key, 0, (i % cols) * (cell + pad), Math.floor(i / cols) * (cell + pad), f.img.w, f.img.h));
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  const rates: Record<string, number> = { drone: 12, wisp: 8, bolt: 10 };
  for (const k of CREATURE_KINDS) {
    scene.anims.create({
      key: `${k}:loop`,
      frames: Array.from({ length: CREATURE_FRAMES }, (_, f) => ({ key: CREATURES, frame: `${k}:${f}` })),
      frameRate: rates[k] ?? 6,
      repeat: -1,
    });
  }
}
