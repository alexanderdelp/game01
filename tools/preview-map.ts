/** Schreibt die Übersichtskarte eines Seeds als PNG: npx vite-node tools/preview-map.ts <seed> <out.png> */
import { writeFileSync } from 'node:fs';
import { BIOMES } from '../src/world/biomes';
import { WorldGen } from '../src/world/WorldGen';
import { encodePng } from './png';

const seed = process.argv[2] ?? 'test';
const out = process.argv[3] ?? 'screenshots/map.png';
const step = Number(process.argv[4] ?? 8);
const w = new WorldGen(seed);
const t0 = performance.now();
const { size, biomes } = w.overview(step);
const t1 = performance.now();
const rgb = new Uint8Array(size * size * 3);
const counts = new Array(BIOMES.length).fill(0);
biomes.forEach((b, i) => {
  counts[b]++;
  const c = BIOMES[b].mapColor;
  rgb[i * 3] = c >> 16;
  rgb[i * 3 + 1] = (c >> 8) & 255;
  rgb[i * 3 + 2] = c & 255;
});
const sp = w.findSpawn();
for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
  const i = (Math.floor(sp.ty / step) + dy) * size + Math.floor(sp.tx / step) + dx;
  rgb[i * 3] = 255; rgb[i * 3 + 1] = 0; rgb[i * 3 + 2] = 0;
}
writeFileSync(out, encodePng(size, size, rgb));
console.log(`seed=${seed} overview ${size}² in ${(t1 - t0).toFixed(0)} ms, spawn`, sp);
BIOMES.forEach((b, i) => console.log(b.name.padEnd(14), ((counts[i] / biomes.length) * 100).toFixed(1) + '%'));
