/** Kreaturen-Frames als Bogen (4-fach): npx vite-node tools/preview-creatures.ts out.png */
import { writeFileSync } from 'node:fs';
import { CREATURE_FRAMES, CREATURE_KINDS, generateCreature } from '../src/render/creatures';
import { encodePng } from './png';

const S = 4, CW = 36, CH = 34;
const W = CREATURE_FRAMES * CW * S, H = CREATURE_KINDS.length * CH * S;
const rgb = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) { rgb[i * 3] = 0x5c; rgb[i * 3 + 1] = 0xab; rgb[i * 3 + 2] = 0x44; }
CREATURE_KINDS.forEach((k, row) => {
  for (let f = 0; f < CREATURE_FRAMES; f++) {
    const p = generateCreature(k, f);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const s = (y * p.w + x) * 4;
      const a = p.data[s + 3] / 255;
      if (!a) continue;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const d = (((row * CH + y) * S + sy) * W + (f * CW + x) * S + sx) * 3;
        for (let c = 0; c < 3; c++) rgb[d + c] = Math.round(rgb[d + c] * (1 - a) + p.data[s + c] * a);
      }
    }
  }
});
writeFileSync(process.argv[2] ?? 'screenshots/creatures.png', encodePng(W, H, rgb));
