import Phaser from 'phaser';
import { BIOMES, BIOME_SPEED, BUILT, DECOR_BLOCK } from '../world/biomes';
import { overlaps, type Box } from '../world/collision';
import { CHUNK_TILES, WORLD_CHUNKS, type Decoration } from '../world/WorldGen';
import { CELL, cellsBlock, slopeSpeed } from '../world/terrain';
import { CHUNK_PX, FLAT_DECOR, TILE_PX, decorPos } from './chunkPixels';
import type { ChunkRequest, ChunkResult } from './chunkProtocol';
import { DECOR_VARIANTS } from './procSprites';
import { ATLAS } from './textures';

interface LoadedChunk {
  key: string;
  ground: Phaser.GameObjects.Image;
  objects: Phaser.GameObjects.Image[];
  biomes: Uint8Array;
  blockers: Box[];
  /** Geländeraster (M24) */
  levels: Uint8Array;
  kinds: Uint8Array;
  steep: Float32Array;
}

const CELLS = CHUNK_PX / CELL;


/**
 * Lädt Chunks rund um die Kamera über einen Pool von Web Workern nach und entlädt entfernte.
 */
export class ChunkManager {
  private readonly loaded = new Map<string, LoadedChunk>();
  private readonly pending = new Set<string>();
  private readonly workers: Worker[] = [];
  private readonly busy: number[] = [];
  private queue: { cx: number; cy: number; key: string }[] = [];
  private destroyed = false;
  /** Wird aufgerufen, wenn ein Chunk fertig geladen bzw. entladen wurde. */
  readonly onLoad: ((cx: number, cy: number) => void)[] = [];
  /** Erlaubt abweichende Frames (z. B. geöffnete Truhen). */
  frameHook?: (d: Decoration) => string | undefined;
  /** Zusätzliche Hindernisse außerhalb der Chunk-Daten (z. B. Ausbauten von Orten), nach Schlüssel. */
  readonly extraBlockers = new Map<string, Box[]>();
  /** Gebaute Objekte nach Kachel, um sie später umzuschalten. */
  readonly builtImages = new Map<string, Phaser.GameObjects.Image>();
  readonly onUnload: ((cx: number, cy: number) => void)[] = [];

  constructor(private readonly scene: Phaser.Scene, seed: string) {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<ChunkResult>) => this.onResult(i, ev.data);
      w.postMessage({ type: 'init', seed } satisfies ChunkRequest);
      this.workers.push(w);
      this.busy.push(0);
    }
  }

  get loadedCount(): number {
    return this.loaded.size;
  }

  get pendingCount(): number {
    return this.pending.size + this.queue.length;
  }

  /** Biom an einer Kachel, falls der Chunk geladen ist. */
  biomeAt(tx: number, ty: number): number | undefined {
    const c = this.loaded.get(key(Math.floor(tx / CHUNK_TILES), Math.floor(ty / CHUNK_TILES)));
    if (!c) return undefined;
    const lx = ((tx % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
    const ly = ((ty % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
    return c.biomes[ly * CHUNK_TILES + lx];
  }

  /** Stufe und Art einer Geländezelle (4 px), falls geladen. */
  cellAt(cx: number, cy: number): { level: number; kind: number } | undefined {
    const c = this.loaded.get(key(Math.floor(cx / CELLS), Math.floor(cy / CELLS)));
    if (!c) return undefined;
    const i = (((cy % CELLS) + CELLS) % CELLS) * CELLS + (((cx % CELLS) + CELLS) % CELLS);
    return { level: c.levels[i], kind: c.kinds[i] };
  }

  /** Nur Gelände (Wasser, Gipfel, Klippen, nicht geladen) – ohne Dekorationen. */
  terrainBlocked(b: Box): boolean {
    const t0x = Math.floor(b.x / TILE_PX);
    const t0y = Math.floor(b.y / TILE_PX);
    const t1x = Math.floor((b.x + b.w - 0.001) / TILE_PX);
    const t1y = Math.floor((b.y + b.h - 0.001) / TILE_PX);
    for (let ty = t0y; ty <= t1y; ty++) {
      for (let tx = t0x; tx <= t1x; tx++) {
        const biome = this.biomeAt(tx, ty);
        if (biome === undefined || !BIOMES[biome].walkable) return true;
      }
    }
    return cellsBlock(b.x, b.y, b.w, b.h, (cx, cy) => this.cellAt(cx, cy));
  }

  /** Ist eine Box (in Weltpixeln) blockiert? Nicht geladene Bereiche gelten als blockiert. */
  blocked(b: Box): boolean {
    const t0x = Math.floor(b.x / TILE_PX);
    const t0y = Math.floor(b.y / TILE_PX);
    const t1x = Math.floor((b.x + b.w - 0.001) / TILE_PX);
    const t1y = Math.floor((b.y + b.h - 0.001) / TILE_PX);
    for (let ty = t0y; ty <= t1y; ty++) {
      for (let tx = t0x; tx <= t1x; tx++) {
        const biome = this.biomeAt(tx, ty);
        if (biome === undefined || !BIOMES[biome].walkable) return true;
      }
    }
    if (cellsBlock(b.x, b.y, b.w, b.h, (cx, cy) => this.cellAt(cx, cy))) return true;
    const seen = new Set<LoadedChunk>();
    for (const list of this.extraBlockers.values()) for (const o of list) if (overlaps(b, o)) return true;
    // Dekorationen am Chunkrand ragen ein paar Pixel über; deshalb mit Rand nachsehen.
    const m = 8;
    for (const [px, py] of [[b.x - m, b.y - m], [b.x + b.w + m, b.y - m], [b.x - m, b.y + b.h + m], [b.x + b.w + m, b.y + b.h + m]]) {
      const c = this.loaded.get(key(Math.floor(px / CHUNK_PX), Math.floor(py / CHUNK_PX)));
      if (!c || seen.has(c)) continue;
      seen.add(c);
      for (const o of c.blockers) if (overlaps(b, o)) return true;
    }
    return false;
  }

  /** Geschwindigkeitsfaktor an einer Pixelposition. */
  speedAt(x: number, y: number): number {
    const tx = Math.floor(x / TILE_PX);
    const ty = Math.floor(y / TILE_PX);
    const biome = this.biomeAt(tx, ty);
    if (biome === undefined) return 1;
    const c = this.loaded.get(key(Math.floor(tx / CHUNK_TILES), Math.floor(ty / CHUNK_TILES)))!;
    const steep = c.steep[(((ty % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES) * CHUNK_TILES + (((tx % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES)];
    return BIOME_SPEED[biome as keyof typeof BIOME_SPEED] * slopeSpeed(steep);
  }

  /** Muss jeden Frame mit dem sichtbaren Weltausschnitt aufgerufen werden. */
  update(view: Phaser.Geom.Rectangle): void {
    const margin = CHUNK_PX * 0.5;
    const x0 = clampChunk(Math.floor((view.x - margin) / CHUNK_PX));
    const y0 = clampChunk(Math.floor((view.y - margin) / CHUNK_PX));
    const x1 = clampChunk(Math.floor((view.right + margin) / CHUNK_PX));
    const y1 = clampChunk(Math.floor((view.bottom + margin) / CHUNK_PX));

    // Entladen, was deutlich außerhalb liegt.
    for (const [k, c] of this.loaded) {
      const [cx, cy] = k.split(',').map(Number);
      if (cx < x0 - 1 || cx > x1 + 1 || cy < y0 - 1 || cy > y1 + 1) {
        c.ground.destroy();
        c.objects.forEach((o) => o.destroy());
        for (const [k2, img] of this.builtImages) if (!img.active) this.builtImages.delete(k2);
        this.scene.textures.remove(c.key);
        this.loaded.delete(k);
        this.onUnload.forEach((f) => f(cx, cy));
      }
    }

    // Neue Chunks anfordern, nächstgelegene zuerst.
    const centerX = view.centerX / CHUNK_PX;
    const centerY = view.centerY / CHUNK_PX;
    const wanted: { cx: number; cy: number; key: string; d: number }[] = [];
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = key(cx, cy);
        if (!this.loaded.has(k) && !this.pending.has(k)) wanted.push({ cx, cy, key: k, d: (cx + 0.5 - centerX) ** 2 + (cy + 0.5 - centerY) ** 2 });
      }
    }
    wanted.sort((a, b) => a.d - b.d);
    this.queue = wanted;
    this.dispatch();
  }

  private dispatch(): void {
    for (let i = 0; i < this.workers.length && this.queue.length; i++) {
      while (this.busy[i] < 2 && this.queue.length) {
        const job = this.queue.shift()!;
        this.pending.add(job.key);
        this.busy[i]++;
        this.workers[i].postMessage({ type: 'chunk', cx: job.cx, cy: job.cy } satisfies ChunkRequest);
      }
    }
  }

  private onResult(worker: number, r: ChunkResult): void {
    this.busy[worker]--;
    const k = key(r.cx, r.cy);
    this.pending.delete(k);
    if (this.destroyed) return;
    this.build(r, k);
    this.dispatch();
  }

  isLoaded(cx: number, cy: number): boolean {
    return this.loaded.has(key(cx, cy));
  }

  private build(r: ChunkResult, k: string): void {
    const texKey = `chunk:${k}`;
    const canvas = document.createElement('canvas');
    canvas.width = CHUNK_PX;
    canvas.height = CHUNK_PX;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.pixels), CHUNK_PX, CHUNK_PX), 0, 0);
    if (this.scene.textures.exists(texKey)) this.scene.textures.remove(texKey);
    this.scene.textures.addCanvas(texKey, canvas);
    const ground = this.scene.add.image(r.cx * CHUNK_PX, r.cy * CHUNK_PX, texKey).setOrigin(0, 0).setDepth(-1_000_000);
    // Flache Dekorationen und Schatten sind bereits ins Bodenbild gebacken
    const objects = r.decorations.filter((d) => !FLAT_DECOR.has(d.kind)).map((d) => this.decoration(d));
    const blockers: Box[] = [];
    for (const d of r.decorations) {
      const size = DECOR_BLOCK[d.kind];
      if (!size) continue;
      const p = BUILT.has(d.kind) ? { x: d.tx * TILE_PX + TILE_PX / 2, y: d.ty * TILE_PX + TILE_PX } : decorPos(d);
      blockers.push({ x: p.x - size.w / 2, y: p.y - size.h, w: size.w, h: size.h });
    }
    this.loaded.set(k, { key: texKey, ground, objects, biomes: new Uint8Array(r.biomes), blockers, levels: new Uint8Array(r.levels), kinds: new Uint8Array(r.kinds), steep: new Float32Array(r.steep) });
    this.onLoad.forEach((f) => f(r.cx, r.cy));
  }

  private decoration(d: Decoration): Phaser.GameObjects.Image {
    const { x, y } = decorPos(d);
    const frame = this.frameHook?.(d) ?? `${d.kind}:${(d.variant >> 1) % DECOR_VARIANTS}`;
    const built = BUILT.has(d.kind);
    const img = this.scene.add.image(built ? d.tx * TILE_PX + TILE_PX / 2 : x, built ? d.ty * TILE_PX + TILE_PX : y, ATLAS, frame)
      .setOrigin(0.5, 1)
      .setFlipX(!built && (d.variant & 1) === 1)
      .setDepth(y);
    if (built) this.builtImages.set(`${d.tx},${d.ty}`, img);
    return img;
  }


  destroy(): void {
    this.destroyed = true;
    this.workers.forEach((w) => w.terminate());
    for (const c of this.loaded.values()) this.scene.textures.remove(c.key);
    this.loaded.clear();
  }
}

const key = (cx: number, cy: number) => `${cx},${cy}`;
const clampChunk = (c: number) => Math.max(0, Math.min(WORLD_CHUNKS - 1, c));
