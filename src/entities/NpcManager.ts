import Phaser from 'phaser';
import { buildCharacter } from '../character/CharacterFactory';
import type { Appearance } from '../character/lpc';
import type { ChunkManager } from '../render/ChunkManager';
import { TILE_PX } from '../render/chunkPixels';
import { ROLES, archetypes, npcsForChunk, wanderTarget, type NpcSpawn } from '../world/npcs';
import { hash2, mulberry32 } from '../world/rng';
import type { WorldGen } from '../world/WorldGen';
import { Actor } from './Actor';

const WANDER_RADIUS = 6;
const TALK_RANGE = 56;

/** Ein NPC: Figur + einfacher Wander-Automat. */
export class Npc {
  readonly actor: Actor;
  private state: 'idle' | 'walk' = 'idle';
  private timer: number;
  private target: { x: number; y: number } | null = null;
  private lastProgress = 0;
  private lastPos = { x: 0, y: 0 };
  /** Wie oft bereits gesprochen wurde (wählt den nächsten Satz). */
  talks = 0;
  talking = false;

  constructor(
    scene: Phaser.Scene,
    readonly spawn: NpcSpawn,
    prefix: string,
    private readonly rnd: () => number,
  ) {
    this.actor = new Actor(scene, spawn.tx * TILE_PX + TILE_PX / 2, spawn.ty * TILE_PX + TILE_PX - 1, prefix);
    this.actor.baseSpeed = 55;
    this.timer = 500 + rnd() * 3000;
  }

  get role() {
    return ROLES[this.spawn.role];
  }

  update(dt: number, chunks: ChunkManager, world: WorldGen, player: Actor): void {
    const a = this.actor;
    if (this.talking) {
      a.update(0, 0, false, dt, chunks);
      a.face(player.x, player.y);
      return;
    }
    this.timer -= dt * 1000;
    if (this.state === 'idle') {
      a.update(0, 0, false, dt, chunks);
      if (this.timer <= 0) {
        const t = wanderTarget(this.spawn, WANDER_RADIUS, this.rnd, (x, y) => world.isWalkable(x, y));
        if (t) {
          this.target = { x: t.tx * TILE_PX + TILE_PX / 2, y: t.ty * TILE_PX + TILE_PX - 1 };
          this.state = 'walk';
          this.lastProgress = 0;
          this.lastPos = { x: a.x, y: a.y };
        } else {
          this.timer = 2000;
        }
      }
      return;
    }
    const dx = this.target!.x - a.x;
    const dy = this.target!.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) return this.rest();
    a.update(dx / dist, dy / dist, false, dt, chunks);
    this.lastProgress += dt;
    if (this.lastProgress > 1) {
      // Festgelaufen? Dann ausruhen und später neues Ziel.
      if (Math.hypot(a.x - this.lastPos.x, a.y - this.lastPos.y) < 8) return this.rest();
      this.lastProgress = 0;
      this.lastPos = { x: a.x, y: a.y };
    }
  }

  private rest(): void {
    this.state = 'idle';
    this.target = null;
    this.timer = 1500 + this.rnd() * 4000;
  }

  destroy(): void {
    this.actor.destroy();
  }
}

/** Erzeugt NPCs mit ihren Chunks und entfernt sie wieder. */
export class NpcManager {
  readonly npcs = new Map<string, Npc>();
  private readonly byChunk = new Map<string, string[]>();
  private readonly looks: Appearance[];
  private readonly prefixes: (string | undefined)[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: WorldGen,
    private readonly chunks: ChunkManager,
  ) {
    this.looks = archetypes(world.seed);
    chunks.onLoad.push((cx, cy) => this.spawnChunk(cx, cy));
    chunks.onUnload.push((cx, cy) => this.despawnChunk(cx, cy));
  }

  /** Alle Ebenen, die für die Archetypen dieser Welt geladen werden müssen. */
  static appearances(world: WorldGen): Appearance[] {
    return archetypes(world.seed);
  }

  private prefix(i: number): string {
    return (this.prefixes[i] ??= buildCharacter(this.scene, this.looks[i], ['walk', 'idle']));
  }

  private spawnChunk(cx: number, cy: number): void {
    const ids: string[] = [];
    for (const s of npcsForChunk(this.world, cx, cy)) {
      if (this.npcs.has(s.id)) continue;
      let r = 0;
      for (let i = 0; i < s.id.length; i++) r = (r * 31 + s.id.charCodeAt(i)) | 0;
      const npc = new Npc(this.scene, s, this.prefix(s.archetype), mulberry32(hash2(this.world.seed, r, 0, 99)));
      this.npcs.set(s.id, npc);
      ids.push(s.id);
    }
    this.byChunk.set(`${cx},${cy}`, ids);
  }

  private despawnChunk(cx: number, cy: number): void {
    for (const id of this.byChunk.get(`${cx},${cy}`) ?? []) {
      this.npcs.get(id)?.destroy();
      this.npcs.delete(id);
    }
    this.byChunk.delete(`${cx},${cy}`);
  }

  update(dt: number, player: Actor): void {
    for (const n of this.npcs.values()) n.update(dt, this.chunks, this.world, player);
  }

  /** Nächster NPC in Sprechweite oder null. */
  nearest(player: Actor, range = TALK_RANGE): Npc | null {
    let best: Npc | null = null;
    let bestD = range;
    for (const n of this.npcs.values()) {
      const d = Math.hypot(n.actor.x - player.x, n.actor.y - player.y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }
}
