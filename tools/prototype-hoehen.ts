/** Prototyp (Vorschlag Höhenstufen): Stufen, Böschungen/Klippen, Seen in Senken, Sichtschatten. npx vite-node tools/prototype-hoehen.ts <seed> <tx> <ty> <cw> <ch> <out> before|after [step] [px] [py] */
import { writeFileSync } from 'node:fs';
import { CHUNK_PX, ChunkPainter, decorPos } from '../src/render/chunkPixels';
import { DECOR_VARIANTS, generateDecor } from '../src/render/procSprites';
import { BUILT } from '../src/world/biomes';
import { CHUNK_TILES, WorldGen, SEA_LEVEL } from '../src/world/WorldGen';
import { Simplex2 } from '../src/world/noise';
import { encodePng } from './png';

const [seed, txs, tys, cws, chs, out, mode, STEPs, pxs, pys] = process.argv.slice(2);
const STEP = Number(STEPs ?? 0.03);
const w = new WorldGen(seed);
const nA = new Simplex2(77), nB = new Simplex2(78);
const tx = Number(txs), ty = Number(tys), cw = Number(cws), ch = Number(chs);
const cx0 = Math.floor(tx / CHUNK_TILES) - Math.floor(cw / 2);
const cy0 = Math.floor(ty / CHUNK_TILES) - Math.floor(ch / 2);
const W = cw * CHUNK_PX, H = ch * CHUNK_PX;
const ox = cx0 * CHUNK_PX, oy = cy0 * CHUNK_PX;
const rgb = new Uint8Array(W * H * 3);
const p = new ChunkPainter(w);
const decos: any[] = [];
for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
  const px = p.paint(cx0 + cx, cy0 + cy);
  for (let y = 0; y < CHUNK_PX; y++) for (let x = 0; x < CHUNK_PX; x++) {
    const s = (y * CHUNK_PX + x) * 4, d = ((cy * CHUNK_PX + y) * W + cx * CHUNK_PX + x) * 3;
    rgb[d] = px[s]; rgb[d + 1] = px[s + 1]; rgb[d + 2] = px[s + 2];
  }
  decos.push(...w.chunk(cx0 + cx, cy0 + cy).decorations);
}
const after = mode === 'after';
// Höhenstufen auf 4-px-Zellen
const C = 4, CW = W / C, CH = H / C;
const lv = new Int16Array(CW * CH);
for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
  const e = w.elevation((ox + x * C + 2) / 32, (oy + y * C + 2) / 32);
  const wx = ox / 32 + x * C / 32, wy = oy / 32 + y * C / 32;
  const n1 = nA.fbm(wx / 26, wy / 26, 3), n2 = nB.fbm(wx / 9, wy / 9, 2);
  const ss = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const v = (e - SEA_LEVEL) / (1 - SEA_LEVEL) / STEP + 3 * ss(0.12, 0.2, n1) + 2 * ss(0.38, 0.44, n1) - 3 * ss(-0.3, -0.4, n1) + n2 * 0.9;
  lv[y * CW + x] = e < SEA_LEVEL ? -1 : Math.floor(v);
}
// Senken füllen (Priority-Flood): Wasser, wo der Überlaufpegel über dem Boden liegt
const fill = Int16Array.from(lv);
{ const done = new Uint8Array(CW * CH); const q: number[][] = Array.from({ length: 64 }, () => []);
  const push = (i: number, l: number) => { done[i] = 1; fill[i] = l; q[Math.max(0, l)].push(i); };
  for (let x = 0; x < CW; x++) { push(x, lv[x]); push((CH - 1) * CW + x, lv[(CH - 1) * CW + x]); }
  for (let y = 1; y < CH - 1; y++) { push(y * CW, lv[y * CW]); push(y * CW + CW - 1, lv[y * CW + CW - 1]); }
  for (let l = 0; l < 64; l++) while (q[l].length) { const i = q[l].pop()!; const x = i % CW, y = (i / CW) | 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= CW || Y >= CH) continue; const j = Y * CW + X; if (done[j]) continue; push(j, Math.max(lv[j], l)); } } }
const water = new Uint8Array(CW * CH);
for (let i = 0; i < CW * CH; i++) if (fill[i] > lv[i]) { water[i] = 1; lv[i] = fill[i]; }
const L = (x: number, y: number) => lv[Math.min(CH - 1, Math.max(0, y)) * CW + Math.min(CW - 1, Math.max(0, x))];
const get = (i: number) => [rgb[i], rgb[i + 1], rgb[i + 2]];
const put = (i: number, c: number[]) => { rgb[i] = c[0]; rgb[i + 1] = c[1]; rgb[i + 2] = c[2]; };
const mul = (c: number[], f: number) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
const faceAt = new Uint8Array(CW * CH);
const plx = Number(pxs ?? W / 2), ply = Number(pys ?? H / 2);
const pl = L(Math.floor(plx / C), Math.floor(ply / C));
if (after) {
  // Höhe leicht aufhellen (relativ zum Spieler)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = L(x >> 2, y >> 2); if (l < 0) continue;
    const i = (y * W + x) * 3; put(i, mul(get(i), 1 + Math.max(-0.2, Math.min(0.2, (l - pl) * 0.025))));
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const ci = (y >> 2) * CW + (x >> 2); if (!water[ci]) continue;
    const i = (y * W + x) * 3; const edge = !water[ci - CW] || !water[ci + CW] || !water[ci - 1] || !water[ci + 1];
    put(i, edge ? [70, 120, 150] : ((x * 13 + y * 7) % 37 === 0 ? [120, 180, 210] : [52, 98, 140])); }
  // Wände: unter einer höheren Zelle
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    const l = L(cx, cy); if (l < 0) continue;
    for (let k = 1; k <= 12; k++) {
      const lu = L(cx, cy - k);
      if (lu <= l) continue;
      const diff = lu - l;
      const hgt = diff === 1 ? 2 : Math.min(10, diff * 3);
      if (k <= hgt) { faceAt[cy * CW + cx] = diff === 1 ? 1 : 2; 
        for (let yy = 0; yy < C; yy++) for (let xx = 0; xx < C; xx++) {
          const X = cx * C + xx, Y = cy * C + yy, i = (Y * W + X) * 3;
          const t = ((k - 1) * C + yy) / (hgt * C); // 0 oben, 1 unten
          let c: number[];
          if (diff === 1) { const up = get(((cy - k) * C * W + X) * 3); c = mul(up, 0.62 - t * 0.1); if ((X * 7 + Y * 3) % 11 === 0) c = mul(c, 0.85); }
          else {
            const base = [128, 112, 96]; const stripe = ((X >> 1) * 2654435761 >>> 28) & 3;
            c = mul(base, 0.95 - t * 0.38 - stripe * 0.05);
            if (t < 0.06) c = mul(base, 1.2);
            if ((X + Math.floor(Y / 6) * 3) % 9 === 0) c = mul(c, 0.8);
          }
          put(i, c);
        }
        break; }
    }
  }
  // Kanten: Licht oben, Schatten seitlich
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = x >> 2, cy = y >> 2, l = L(cx, cy); if (l < 0 || faceAt[cy * CW + cx]) continue;
    const i = (y * W + x) * 3;
    if (L(x - 2 >> 2, cy) > l || L(x - 1 >> 2, cy) > l) put(i, mul(get(i), 0.7));
    else if (L((x + 2) >> 2, cy) > l) put(i, mul(get(i), 0.82));
    else if (L(cx, (y - 2) >> 2) < l && !faceAt[((y - 2) >> 2) * CW + cx]) put(i, mul(get(i), 1.18));
  }
}
decos.sort((a, b) => a.ty - b.ty);
const cache: Record<string, ReturnType<typeof generateDecor>> = {};
for (const d of decos) {
  const v = (d.variant >> 1) % DECOR_VARIANTS;
  const r = (cache[`${d.kind}:${v}`] ??= generateDecor(d.kind, v));
  const flip = BUILT.has(d.kind) ? 0 : d.variant & 1;
  const q = BUILT.has(d.kind) ? { x: d.tx * 32 + 16, y: d.ty * 32 + 32 } : decorPos(d);
  const bx = q.x - ox - Math.floor(r.w / 2), by = q.y - oy - r.h;
  if (after) { const fcx = (q.x - ox) >> 2, fcy = (q.y - oy - 2) >> 2; if (fcx >= 0 && fcy >= 0 && fcx < CW && fcy < CH && (faceAt[fcy * CW + fcx] || water[fcy * CW + fcx] || faceAt[Math.min(CH-1,fcy + 1) * CW + fcx])) continue; }
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const sx = flip ? r.w - 1 - x : x, s = (y * r.w + sx) * 4;
    if (!r.data[s + 3]) continue;
    const X = bx + x, Y = by + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const dd = (Y * W + X) * 3; rgb[dd] = r.data[s]; rgb[dd + 1] = r.data[s + 1]; rgb[dd + 2] = r.data[s + 2];
  }
}
if (after) {
  // Sichtschatten: Strahl auf 8-px-Zellen gegen Höhenstufen
  const V = 8, VW = W / V, VH = H / V;
  const eye = pl + 0.8;
  const vis = new Float32Array(VW * VH);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const X = x * V + 4, Y = y * V + 4; const tl = Math.max(0, L(X >> 2, Y >> 2)) + 0.3;
    const dist = Math.hypot(X - plx, Y - ply); const n = Math.ceil(dist / 6);
    let ok = 1;
    for (let s = 1; s < n; s++) { const f = s / n; const sx = plx + (X - plx) * f, sy = ply + (Y - ply) * f;
      if (L(sx >> 2, sy >> 2) > eye + (tl - eye) * f + 1) { ok = 0; break; } }
    vis[y * VW + x] = ok;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // weich: Mittel über 3×3 Sichtzellen
    let s = 0, n = 0; const vx = x / V - 0.5, vy = y / V - 0.5; const x0 = Math.floor(vx), y0 = Math.floor(vy), ax = vx - x0, ay = vy - y0;
    const g = (a: number, b: number) => vis[Math.min(VH - 1, Math.max(0, b)) * VW + Math.min(VW - 1, Math.max(0, a))];
    s = (g(x0, y0) * (1 - ax) + g(x0 + 1, y0) * ax) * (1 - ay) + (g(x0, y0 + 1) * (1 - ax) + g(x0 + 1, y0 + 1) * ax) * ay; n = 1;
    const v = s / n; if (v >= 0.999) continue;
    const i = (y * W + x) * 3; const c = get(i); const grey = (c[0] + c[1] + c[2]) / 3;
    const f = 0.62 + 0.38 * v; put(i, c.map((q) => Math.round((q * (0.35 + 0.65 * v) + grey * (1 - v) * 0.65 + 18 * (1 - v)) * f)));
  }
}
// Spielermarker
for (let y = -8; y <= 8; y++) for (let x = -6; x <= 6; x++) { const d = (x * x) / 36 + (y * y) / 64; if (d > 1) continue; const i = ((ply - 8 + y) * W + plx + x) * 3; put(i, d > 0.6 ? [20, 20, 20] : [235, 60, 60]); }
writeFileSync(out, encodePng(W, H, rgb));
console.log('player level', pl);
let best = [0, 0, -9]; for (let y = CH / 4; y < CH * 3 / 4; y++) for (let x = CW / 4; x < CW * 3 / 4; x++) if (lv[y * CW + x] > best[2] && !water[y * CW + x] && !faceAt[y*CW+x]) best = [x * 4, y * 4, lv[y * CW + x]];
console.log('top', best);
