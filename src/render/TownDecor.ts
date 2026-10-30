import Phaser from 'phaser';
import { prosperityLevel, type WorldState } from '../state/worldState';
import { BIOMES } from '../world/biomes';
import type { Box } from '../world/collision';
import { hash2, mulberry32 } from '../world/rng';
import { CHUNK_TILES, type WorldGen } from '../world/WorldGen';
import type { ChunkManager } from './ChunkManager';
import { TILE_PX } from './chunkPixels';
import { ATLAS } from './textures';

/**
 * Sichtbarer Wohlstand der Orte (aus dem Weltzustand): Laternen, Banner, neue Häuser, Statue des Helden.
 * Wird mit dem Chunk der Ortsmitte erzeugt und bei Änderungen neu aufgebaut.
 */
export class TownDecor {
  private readonly objects = new Map<number, Phaser.GameObjects.GameObject[]>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: WorldGen,
    private readonly chunks: ChunkManager,
    private readonly state: WorldState,
    private readonly heroName: () => string,
  ) {
    chunks.onLoad.push((cx, cy) => this.forChunk(cx, cy, true));
    chunks.onUnload.push((cx, cy) => this.forChunk(cx, cy, false));
  }

  private forChunk(cx: number, cy: number, load: boolean): void {
    for (const s of this.world.meta.settlements) {
      if (Math.floor(s.tx / CHUNK_TILES) !== cx || Math.floor(s.ty / CHUNK_TILES) !== cy) continue;
      if (load) this.build(s.id);
      else this.clear(s.id);
    }
  }

  private clear(id: number): void {
    this.objects.get(id)?.forEach((o) => o.destroy());
    this.objects.delete(id);
    this.chunks.extraBlockers.delete(`town:${id}`);
  }

  /** Nach Wohlstandsänderung neu aufbauen (nur wenn der Ort gerade geladen ist). */
  refresh(id: number): void {
    const s = this.world.meta.settlements[id];
    if (!this.chunks.isLoaded(Math.floor(s.tx / CHUNK_TILES), Math.floor(s.ty / CHUNK_TILES))) return;
    this.build(id);
  }

  level(id: number): number {
    return prosperityLevel(this.state.d.prosperity.get(id) ?? 0);
  }

  private build(id: number): void {
    this.clear(id);
    const s = this.world.meta.settlements[id];
    const lvl = this.level(id);
    if (lvl === 0) return;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const blockers: Box[] = [];
    const rnd = mulberry32(hash2(this.world.seed, s.tx, s.ty, 2024));
    const free = (tx: number, ty: number) => BIOMES[this.world.biomeAt(tx, ty)].walkable && !this.world.decorationAt(tx, ty);
    const px = (tx: number) => tx * TILE_PX + TILE_PX / 2;
    const py = (ty: number) => ty * TILE_PX + TILE_PX;
    const add = (frame: string, tx: number, ty: number, block?: { w: number; h: number }) => {
      const img = this.scene.add.image(px(tx), py(ty), ATLAS, frame).setOrigin(0.5, 1).setDepth(py(ty));
      objs.push(img);
      if (block) blockers.push({ x: px(tx) - block.w / 2, y: py(ty) - block.h, w: block.w, h: block.h });
    };
    // Stufe 1: Laternen rund um den Platz
    for (const [dx, dy] of [[-4, -1], [4, -1], [-4, 3], [4, 3], [-1, -4], [1, 4]]) if (free(s.tx + dx, s.ty + dy)) add('lantern', s.tx + dx, s.ty + dy, { w: 8, h: 6 });
    // Stufe 2: Banner des Reichs und neue Häuser am Ortsrand
    if (lvl >= 2) {
      for (const [dx, dy] of [[-2, -3], [2, -3]]) if (free(s.tx + dx, s.ty + dy)) add(`banner:${s.realm}`, s.tx + dx, s.ty + dy, { w: 6, h: 6 });
      let built = 0;
      for (let k = 0; k < 24 && built < 3; k++) {
        const a = rnd() * Math.PI * 2;
        const d = s.radius + 1 + rnd() * 3;
        const tx = Math.round(s.tx + Math.cos(a) * d);
        const ty = Math.round(s.ty + Math.sin(a) * d);
        let ok = true;
        for (let yy = -2; yy <= 0 && ok; yy++) for (let xx = -1; xx <= 1 && ok; xx++) ok = free(tx + xx, ty + yy);
        if (!ok) continue;
        add(`house:${Math.floor(rnd() * 4)}`, tx, ty, { w: 60, h: 22 });
        built++;
      }
    }
    // Stufe 3: Statue des Helden auf dem Platz
    if (lvl >= 3) {
      add('statue', s.tx, s.ty - 3, { w: 28, h: 12 });
      const label = this.scene.add
        .text(px(s.tx), py(s.ty - 3) + 4, this.heroName(), { fontFamily: 'monospace', fontSize: '24px', color: '#ffd84a', stroke: '#0b0b14', strokeThickness: 4 })
        .setOrigin(0.5, 0)
        .setScale(0.25)
        .setResolution(4)
        .setDepth(py(s.ty - 3) + 1);
      objs.push(label);
    }
    this.objects.set(id, objs);
    this.chunks.extraBlockers.set(`town:${id}`, blockers);
  }
}
