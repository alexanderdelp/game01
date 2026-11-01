/// <reference lib="webworker" />
/** Web Worker: erzeugt Chunk-Daten und Bodenpixel abseits des Haupt-Threads. */
import { WorldGen } from '../world/WorldGen';
import { ChunkPainter } from './chunkPixels';
import { steepness } from '../world/terrain';
import { CHUNK_TILES } from '../world/WorldGen';
import type { ChunkRequest, ChunkResult, OverviewResult, RegionResult } from './chunkProtocol';

let world: WorldGen | null = null;
let painter: ChunkPainter | null = null;

self.onmessage = (ev: MessageEvent<ChunkRequest>) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    world = new WorldGen(msg.seed, msg.opts);
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
  const { pixels, cells } = painter.paintWithCells(msg.cx, msg.cy);
  const steep = new Float32Array(CHUNK_TILES * CHUNK_TILES);
  for (let y = 0; y < CHUNK_TILES; y++) for (let x = 0; x < CHUNK_TILES; x++) steep[y * CHUNK_TILES + x] = steepness(world, msg.cx * CHUNK_TILES + x, msg.cy * CHUNK_TILES + y);
  const result: ChunkResult = {
    type: 'chunk',
    cx: msg.cx,
    cy: msg.cy,
    pixels: pixels.buffer as ArrayBuffer,
    biomes: data.biomes.buffer as ArrayBuffer,
    decorations: data.decorations,
    levels: cells.level.buffer as ArrayBuffer,
    kinds: cells.kind.buffer as ArrayBuffer,
    steep: steep.buffer as ArrayBuffer,
  };
  scope.postMessage(result, [result.pixels, result.biomes, result.levels, result.kinds, result.steep]);
};
