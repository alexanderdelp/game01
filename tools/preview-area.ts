/** Rendert einen Weltausschnitt (Boden + Dekorationen) als PNG: npx vite-node tools/preview-area.ts <seed> <tx> <ty> <chunksW> <chunksH> <out> */
import { writeFileSync } from 'node:fs';
import { CHUNK_PX, ChunkPainter, TILE_PX } from '../src/render/chunkPixels';
import { SPRITES, rasterize } from '../src/render/sprites';
import { CHUNK_TILES, WorldGen } from '../src/world/WorldGen';
import { encodePng } from './png';

const [seed = 'test', txs, tys, cws = '3', chs = '2', out = 'screenshots/area.png'] = process.argv.slice(2);
const w = new WorldGen(seed);
const sp = w.findSpawn();
const tx = txs ? Number(txs) : sp.tx;
const ty = tys ? Number(tys) : sp.ty;
const cw = Number(cws), ch = Number(chs);
const cx0 = Math.floor(tx / CHUNK_TILES) - Math.floor(cw / 2);
const cy0 = Math.floor(ty / CHUNK_TILES) - Math.floor(ch / 2);
const W = cw * CHUNK_PX, H = ch * CHUNK_PX;
const rgb = new Uint8Array(W * H * 3);
const p = new ChunkPainter(w);
const t0 = performance.now();
const decos = [];
for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
  const px = p.paint(cx0 + cx, cy0 + cy);
  for (let y = 0; y < CHUNK_PX; y++) for (let x = 0; x < CHUNK_PX; x++) {
    const s = (y * CHUNK_PX + x) * 4, d = ((cy * CHUNK_PX + y) * W + cx * CHUNK_PX + x) * 3;
    rgb[d] = px[s]; rgb[d + 1] = px[s + 1]; rgb[d + 2] = px[s + 2];
  }
  decos.push(...w.chunk(cx0 + cx, cy0 + cy).decorations);
}
console.log('paint ms/chunk', ((performance.now() - t0) / (cw * ch)).toFixed(1));
decos.sort((a, b) => a.ty - b.ty);
const cache: Record<string, ReturnType<typeof rasterize>> = {};
for (const d of decos) {
  const r = (cache[d.kind] ??= rasterize(SPRITES[d.kind]));
  const flip = d.variant & 1;
  const bx = (d.tx - cx0 * CHUNK_TILES) * TILE_PX + TILE_PX / 2 - Math.floor(r.w / 2) + ((d.variant >> 1) % 5) - 2;
  const by = (d.ty - cy0 * CHUNK_TILES) * TILE_PX + TILE_PX - r.h + ((d.variant >> 4) % 3) - 2;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const sx = flip ? r.w - 1 - x : x;
    const s = (y * r.w + sx) * 4;
    if (!r.data[s + 3]) continue;
    const X = bx + x, Y = by + y;
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const dd = (Y * W + X) * 3;
    rgb[dd] = r.data[s]; rgb[dd + 1] = r.data[s + 1]; rgb[dd + 2] = r.data[s + 2];
  }
}
writeFileSync(out, encodePng(W, H, rgb));
