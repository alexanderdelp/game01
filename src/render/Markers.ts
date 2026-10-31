import Phaser from 'phaser';
import { DEATH_MS, type WorldState } from '../state/worldState';
import { CHUNK_TILES } from '../world/WorldGen';
import type { ChunkManager } from './ChunkManager';
import { TILE_PX } from './chunkPixels';
import { ATLAS } from './textures';

/** Botschaften (Schilder) und Gefallen-Marker aus dem Weltzustand, je geladenem Chunk. */
export class Markers {
  private readonly objects = new Map<string, Phaser.GameObjects.Image[]>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly chunks: ChunkManager,
    private readonly state: WorldState,
  ) {
    chunks.onLoad.push((cx, cy) => this.build(cx, cy));
    chunks.onUnload.push((cx, cy) => this.clear(`${cx},${cy}`));
  }

  private clear(key: string): void {
    this.objects.get(key)?.forEach((o) => o.destroy());
    this.objects.delete(key);
  }

  private build(cx: number, cy: number): void {
    const key = `${cx},${cy}`;
    this.clear(key);
    const objs: Phaser.GameObjects.Image[] = [];
    const inChunk = (tx: number, ty: number) => Math.floor(tx / CHUNK_TILES) === cx && Math.floor(ty / CHUNK_TILES) === cy;
    const add = (frame: string, tx: number, ty: number) => {
      const y = ty * TILE_PX + TILE_PX - 2;
      objs.push(this.scene.add.image(tx * TILE_PX + TILE_PX / 2, y, ATLAS, frame).setOrigin(0.5, 1).setDepth(y));
    };
    for (const s of this.state.d.signs.values()) if (inChunk(s.tx, s.ty)) add('sign', s.tx, s.ty);
    const now = Date.now();
    for (const d of this.state.d.deaths) if (now - d.t < DEATH_MS && inChunk(d.tx, d.ty)) add('grave', d.tx, d.ty);
    this.objects.set(key, objs);
  }

  /** Alle geladenen Chunks neu aufbauen. */
  refresh(): void {
    for (const key of [...this.objects.keys()]) {
      const [cx, cy] = key.split(',').map(Number);
      this.build(cx, cy);
    }
    // Chunks, die noch keine Marker hatten
    for (const s of this.state.d.signs.values()) {
      const cx = Math.floor(s.tx / CHUNK_TILES);
      const cy = Math.floor(s.ty / CHUNK_TILES);
      if (!this.objects.has(`${cx},${cy}`) && this.chunks.isLoaded(cx, cy)) this.build(cx, cy);
    }
  }

  /** Nächste Botschaft oder Grab in Reichweite (Pixel). */
  nearest(x: number, y: number, range = 48): { kind: 'sign' | 'grave'; text: string; by: string; dist: number } | null {
    let best: { kind: 'sign' | 'grave'; text: string; by: string; dist: number } | null = null;
    const check = (kind: 'sign' | 'grave', tx: number, ty: number, text: string, by: string) => {
      const dist = Math.hypot(tx * TILE_PX + TILE_PX / 2 - x, ty * TILE_PX + TILE_PX - y);
      if (dist < range && (!best || dist < best.dist)) best = { kind, text, by, dist };
    };
    for (const s of this.state.d.signs.values()) check('sign', s.tx, s.ty, s.text, s.by);
    const now = Date.now();
    for (const d of this.state.d.deaths) if (now - d.t < DEATH_MS) check('grave', d.tx, d.ty, `Hier fiel ${d.by}.`, d.by);
    return best;
  }
}
