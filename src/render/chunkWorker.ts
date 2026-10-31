/// <reference lib="webworker" />
/** Web Worker: erzeugt Chunk-Daten und Bodenpixel abseits des Haupt-Threads. */
import { WorldGen } from '../world/WorldGen';
import { ChunkPainter } from './chunkPixels';
import type { ChunkRequest, ChunkResult, OverviewResult, RegionResult } from './chunkProtocol';

let world: WorldGen | null = null;
let painter: ChunkPainter | null = null;

self.onmessage = (ev: MessageEvent<ChunkRequest>) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    world = new WorldGen(msg.seed);
    painter = new ChunkPainter(world);
    return;
  }
  if (!world || !painter) return;
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  if (msg.type === 'overview') {
    const o = world.overview(msg.step);
    const res: OverviewResult = { type: 'overview', size: o.size, biomes: o.biomes.buffer as ArrayBuffer };
    scope.postMessage(res, [res.biomes]);
    return;
  }
  if (msg.type === 'region') {
    const biomes = new Uint8Array(msg.size * msg.size);
    const half = msg.step >> 1;
    for (let y = 0; y < msg.size; y++) for (let x = 0; x < msg.size; x++) biomes[y * msg.size + x] = world.biomeAt(msg.x0 + x * msg.step + half, msg.y0 + y * msg.step + half);
    const res: RegionResult = { ...msg, biomes: biomes.buffer as ArrayBuffer };
    scope.postMessage(res, [res.biomes]);
    return;
  }
  const data = world.chunk(msg.cx, msg.cy);
  const pixels = painter.paint(msg.cx, msg.cy);
  const result: ChunkResult = {
    type: 'chunk',
    cx: msg.cx,
    cy: msg.cy,
    pixels: pixels.buffer as ArrayBuffer,
    biomes: data.biomes.buffer as ArrayBuffer,
    decorations: data.decorations,
  };
  scope.postMessage(result, [result.pixels, result.biomes]);
};
