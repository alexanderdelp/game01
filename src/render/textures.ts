import Phaser from 'phaser';
import { SPRITES, rasterize } from './sprites';

export const ATLAS = 'decor';

/** Packt alle Dekorations-Sprites in eine Atlas-Textur (ein Draw-Batch) plus Schatten-Frame. */
export function createDecorAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS)) return;
  const entries = Object.entries(SPRITES).map(([key, def]) => ({ key, img: rasterize(def) }));
  const pad = 2;
  const width = 256;
  let x = pad;
  let y = pad;
  let rowH = 0;
  const placed: { key: string; x: number; y: number; w: number; h: number; data: Uint8ClampedArray }[] = [];
  for (const { key, img } of entries) {
    if (x + img.w + pad > width) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    placed.push({ key, x, y, w: img.w, h: img.h, data: img.data });
    x += img.w + pad;
    rowH = Math.max(rowH, img.h);
  }
  // Schatten: flache Ellipse
  const sw = 14;
  const sh = 5;
  if (x + sw + pad > width) {
    x = pad;
    y += rowH + pad;
    rowH = 0;
  }
  const shadow = { x, y };
  const height = y + Math.max(rowH, sh) + pad;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  for (const p of placed) ctx.putImageData(new ImageData(p.data as unknown as Uint8ClampedArray<ArrayBuffer>, p.w, p.h), p.x, p.y);
  ctx.fillStyle = 'rgba(10, 8, 20, 0.35)';
  for (let yy = 0; yy < sh; yy++) {
    const half = Math.round((sw / 2) * Math.sqrt(1 - ((yy + 0.5 - sh / 2) / (sh / 2)) ** 2));
    ctx.fillRect(shadow.x + sw / 2 - half, shadow.y + yy, half * 2, 1);
  }

  const tex = scene.textures.addCanvas(ATLAS, canvas)!;
  for (const p of placed) tex.add(p.key, 0, p.x, p.y, p.w, p.h);
  tex.add('shadow', 0, shadow.x, shadow.y, sw, sh);
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}
