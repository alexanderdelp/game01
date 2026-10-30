import Phaser from 'phaser';
import { BIOMES, BIOME_SPEED, BUILT, DECOR_BLOCK, type DecorKind } from '../world/biomes';
import { overlaps, type Box } from '../world/collision';
import { CHUNK_TILES, WORLD_CHUNKS, type Decoration } from '../world/WorldGen';
import { CHUNK_PX, TILE_PX, decorPos } from './chunkPixels';
import type { ChunkRequest, ChunkResult } from './chunkProtocol';
import { DECOR_VARIANTS } from './procSprites';
import { ATLAS } from './textures';

/** Schattengröße je Dekorationsart; flache Dekorationen liegen unter allem anderen. */
const SHADOW: Partial<Record<DecorKind, 's' | 'm' | 'l'>> = {
  oak: 'l', pine: 'm', snowpine: 'm', palm: 'm', cactus: 's', deadtree: 's', boulder: 'l', crystal: 'm', pylon: 's', scrap: 'l', bush: 'm', rock: 's',
  chest: 's', shrine: 'm', obelisk: 'm', well: 'm',
};
const FLAT = new Set<DecorKind>(['tuft', 'flowers']);

interface LoadedChunk {
  key: string;
  ground: Phaser.GameObjects.Image;
  objects: Phaser.GameObjects.Image[];
  biomes: Uint8Array;
  blockers: Box[];
}


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
    const seen = new Set<LoadedChunk>();
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
    const biome = this.biomeAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX));
    return biome === undefined ? 1 : BIOME_SPEED[biome as keyof typeof BIOME_SPEED];
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
    const objects = r.decorations.map((d) => this.decoration(d)).flat();
    const blockers: Box[] = [];
    for (const d of r.decorations) {
      const size = DECOR_BLOCK[d.kind];
      if (!size) continue;
      const p = BUILT.has(d.kind) ? { x: d.tx * TILE_PX + TILE_PX / 2, y: d.ty * TILE_PX + TILE_PX } : decorPos(d);
      blockers.push({ x: p.x - size.w / 2, y: p.y - size.h, w: size.w, h: size.h });
    }
    this.loaded.set(k, { key: texKey, ground, objects, biomes: new Uint8Array(r.biomes), blockers });
    this.onLoad.forEach((f) => f(r.cx, r.cy));
  }

  private decoration(d: Decoration): Phaser.GameObjects.Image[] {
    const { x, y } = decorPos(d);
    const frame = this.frameHook?.(d) ?? `${d.kind}:${(d.variant >> 1) % DECOR_VARIANTS}`;
    const built = BUILT.has(d.kind);
    const img = this.scene.add.image(built ? d.tx * TILE_PX + TILE_PX / 2 : x, built ? d.ty * TILE_PX + TILE_PX : y, ATLAS, frame)
      .setOrigin(0.5, 1)
      .setFlipX(!built && (d.variant & 1) === 1);
    if (built) this.builtImages.set(`${d.tx},${d.ty}`, img);
    img.setDepth(FLAT.has(d.kind) ? -999_999 : y);
    const size = SHADOW[d.kind];
    if (!size) return [img];
    const shadow = this.scene.add.image(x, y - 2, ATLAS, `shadow-${size}`).setDepth(-999_998);
    return [shadow, img];
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
