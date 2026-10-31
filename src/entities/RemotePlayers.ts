import Phaser from 'phaser';
import { buildCharacter, preloadCharacter } from '../character/CharacterFactory';
import { appearanceKey, layersFor, type Appearance } from '../character/lpc';
import { applyMsg, pruneStale, smoothStep, type LiveMsg, type Remote } from '../net/live';
import { Actor } from './Actor';

/** Darstellung der live verbundenen Mitspieler. */
export class RemotePlayers {
  readonly remotes = new Map<string, Remote>();
  private readonly actors = new Map<string, Actor>();
  private readonly loading = new Set<string>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly selfPid: string,
  ) {}

  /** Eingehende Nachricht; gibt den betroffenen Mitspieler zurück. */
  onMsg(msg: LiveMsg): Remote | null {
    const r = applyMsg(this.remotes, msg, this.selfPid, Date.now());
    if (r && msg.type === 'attack') this.actors.get(r.pid)?.playAction('slash');
    return r;
  }

  private ensureActor(r: Remote): Actor | null {
    const a = this.actors.get(r.pid);
    if (a) return a;
    const look: Appearance = { ...r.look, weapon: 'dagger' };
    const key = appearanceKey(look);
    const missing = layersFor(look).some((l) => (l.anims ?? ['walk']).includes('walk') && !this.scene.textures.exists(`lpc:${l.dir}/walk`));
    if (missing) {
      if (this.loading.has(key)) return null;
      this.loading.add(key);
      preloadCharacter(this.scene, look);
      this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => this.loading.delete(key));
      this.scene.load.start();
      return null;
    }
    const actor = new Actor(this.scene, r.x, r.y, buildCharacter(this.scene, look, ['walk', 'idle', 'slash', 'hurt']));
    this.actors.set(r.pid, actor);
    return actor;
  }

  update(dt: number): void {
    for (const pid of pruneStale(this.remotes, Date.now())) {
      this.actors.get(pid)?.destroy();
      this.actors.delete(pid);
    }
    for (const r of this.remotes.values()) {
      smoothStep(r, dt);
      const a = this.ensureActor(r);
      if (!a) continue;
      a.setPosition(r.x, r.y);
      if (a.busy) continue;
      a.facing = r.facing;
      const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[r.facing];
      // Nur Animation, keine Bewegung (Position kommt vom Netz)
      a.update(r.moving ? d[0] : 0, r.moving ? d[1] : 0, false, 0, { blocked: () => true, speedAt: () => 1 });
    }
  }

  /** Positionen der Mitspieler (für die Gegner-KI). */
  positions(): { x: number; y: number }[] {
    return [...this.remotes.values()].map((r) => ({ x: r.x, y: r.y }));
  }

  destroy(): void {
    for (const a of this.actors.values()) a.destroy();
    this.actors.clear();
  }
}
