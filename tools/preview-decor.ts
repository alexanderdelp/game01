/** Zeigt alle prozeduralen Dekorations-Sprites als Bogen (3-fach vergrößert): npx vite-node tools/preview-decor.ts out.png */
import { writeFileSync } from 'node:fs';
import { DECOR_KINDS, DECOR_VARIANTS, generateDecor } from '../src/render/procSprites';
import { encodePng } from './png';

const S = 3, CW = 50, CH = 66;
const W = DECOR_VARIANTS * CW * S, H = DECOR_KINDS.length * CH * S;
const rgb = new Uint8Array(W * H * 3).fill(0);
for (let i = 0; i < W * H; i++) { rgb[i * 3] = 0x5c; rgb[i * 3 + 1] = 0xab; rgb[i * 3 + 2] = 0x44; }
DECOR_KINDS.forEach((k, row) => {
  for (let v = 0; v < DECOR_VARIANTS; v++) {
    const p = generateDecor(k, v);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const s = (y * p.w + x) * 4;
      if (!p.data[s + 3]) continue;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const X = (v * CW + x) * S + sx, Y = (row * CH + (CH - p.h) + y) * S + sy;
        if (X >= W || Y >= H) continue;
        const d = (Y * W + X) * 3;
        rgb[d] = p.data[s]; rgb[d + 1] = p.data[s + 1]; rgb[d + 2] = p.data[s + 2];
      }
    }
  }
});
writeFileSync(process.argv[2] ?? 'screenshots/decor.png', encodePng(W, H, rgb));
