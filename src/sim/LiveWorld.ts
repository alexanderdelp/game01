import { debugState } from '../debug';
import type { NpcManager, Npc } from '../entities/NpcManager';
import type { ChunkManager } from '../render/ChunkManager';
import { TILE_PX } from '../render/chunkPixels';
import type { WorldState } from '../state/worldState';
import type { WorldGen } from '../world/WorldGen';
import { CHUNK_TILES } from '../world/WorldGen';
import { caravanPos, caravans, invasionAt, realmPower, townDrift, weatherAt, type Caravan, type Invasion, type Weather } from './simulation';

/** Weltzeit inkl. Test-Versatz. */
export const worldNow = () => Date.now() + (debugState.timeOffset ?? 0);

/** Verbindet die Simulation mit der laufenden Szene: Karawanen-NPCs, Grenzen, Invasionen, Wetter. */
export class LiveWorld {
  readonly caravans: Caravan[];
  invasion: Invasion | null = null;
  weather: Weather = 'klar';
  private readonly active = new Map<number, Npc>();
  private timer = 0;

  constructor(
    private readonly world: WorldGen,
    private readonly chunks: ChunkManager,
    private readonly npcs: NpcManager,
    private readonly state: WorldState,
  ) {
    this.caravans = caravans(world.meta, (x, y) => world.biomeAt(x, y), world.seed);
    this.tick(true);
  }

  drift(townId: number): number {
    return townDrift(this.world.seed, townId, worldNow());
  }

  /** Langsame Größen (Macht, Invasion) – einmal pro Sekunde. */
  private tick(force = false): boolean {
    const now = worldNow();
    const m = this.world.meta;
    m.powers = m.realms.map((r) => realmPower(this.world.seed, r.id, now, this.state.d.reputation.get(r.id) ?? 0));
    const inv = invasionAt(this.world.seed, m.realms, now);
    const changed = force || inv?.realm !== this.invasion?.realm || inv?.kind !== this.invasion?.kind;
    this.invasion = inv;
    return changed;
  }

  update(dt: number, player: { tile: { tx: number; ty: number } }): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1;
      this.tick();
      const { tx, ty } = player.tile;
      this.weather = weatherAt(this.world.seed, this.world.meta.realmAt(tx, ty).id, worldNow(), this.world.biomeAt(tx, ty));
    }
    // Karawanen: nur in geladenen Bereichen als NPC darstellen
    const now = worldNow();
    for (const c of this.caravans) {
      const p = caravanPos(c, now);
      const loaded = this.chunks.isLoaded(Math.floor(p.tx / CHUNK_TILES), Math.floor(p.ty / CHUNK_TILES));
      let npc = this.active.get(c.id);
      if (!loaded) {
        if (npc) {
          this.npcs.remove(npc.spawn.id);
          this.active.delete(c.id);
        }
        continue;
      }
      if (!npc) {
        npc = this.npcs.addScripted({ id: `car${c.id}`, tx: Math.round(p.tx), ty: Math.round(p.ty), role: 'merchant', name: `${c.name}`, archetype: c.id % 16 });
        this.active.set(c.id, npc);
      }
      const a = npc.actor;
      const x = p.tx * TILE_PX + TILE_PX / 2;
      const y = p.ty * TILE_PX + TILE_PX - 1;
      const dx = x - a.x;
      const dy = y - a.y;
      if (npc.talking || p.resting || Math.hypot(dx, dy) < 0.01) {
        a.update(0, 0, false, dt, { blocked: () => false, speedAt: () => 1 });
        if (!npc.talking) a.setPosition(x, y);
      } else {
        a.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
        a.setPosition(x, y);
        a.update(dx, dy, false, 0, { blocked: () => true, speedAt: () => 1 });
      }
    }
  }
}

