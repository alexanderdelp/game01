import Phaser from 'phaser';
import { buildCharacter } from '../character/CharacterFactory';
import { DEFAULT_APPEARANCE, type Appearance } from '../character/lpc';
import { DefeatLog, attackBox, knockback, rollDamage, scaleStats, type Stats } from '../combat/combat';
import { ENEMIES, enemiesForChunk, type EnemyDef, type EnemySpawn } from '../combat/enemies';
import type { ChunkManager } from '../render/ChunkManager';
import { TILE_PX } from '../render/chunkPixels';
import { CREATURES } from '../render/textures';
import { moveBox, overlaps, type Box, type Facing, facingFrom } from '../world/collision';
import { hash2, mulberry32 } from '../world/rng';
import { wanderTarget } from '../world/npcs';
import type { WorldGen } from '../world/WorldGen';
import { Actor } from './Actor';

const LEASH = 12 * TILE_PX;

/** Was ein Gegner von der Welt braucht. */
export interface CombatCtx {
  chunks: ChunkManager;
  world: WorldGen;
  player: Actor;
  playerAlive: boolean;
  /** Fügt dem Spieler Schaden zu (berücksichtigt Unverwundbarkeit). */
  hurtPlayer(amount: number, fromX: number, fromY: number): void;
  fireBolt(x: number, y: number, vx: number, vy: number, damage: number): void;
}

/** Aussehen der Räuber: Lederrüstung, dunkle Farben, Dolch. */
export const BANDIT_LOOKS: Appearance[] = [
  { ...DEFAULT_APPEARANCE, body: 'male', skin: 'taupe', hair: 'messy1', hairColor: 'black', torso: 'leather', legsColor: 'charcoal', feetColor: 'black' },
  { ...DEFAULT_APPEARANCE, body: 'female', skin: 'amber', hair: 'pixie', hairColor: 'red', torso: 'leather', legsColor: 'maroon', feetColor: 'black' },
  { ...DEFAULT_APPEARANCE, body: 'male', skin: 'brown', hair: 'none', hairColor: 'black', torso: 'leather', legsColor: 'black', feetColor: 'brown' },
  { ...DEFAULT_APPEARANCE, body: 'female', skin: 'light', hair: 'long', hairColor: 'dark_gray', torso: 'leather', legsColor: 'slate', feetColor: 'black' },
];

type State = 'wander' | 'chase' | 'windup' | 'attack' | 'return' | 'dead';

/** Ein Gegner. Räuber nutzen eine LPC-Figur, Kreaturen ein animiertes Sprite. */
export class Enemy {
  readonly def: EnemyDef;
  readonly stats: Stats;
  x: number;
  y: number;
  state: State = 'wander';
  facing: Facing = 'down';
  private readonly actor?: Actor;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly rnd: () => number;
  private timer = 0;
  private cooldown = 1;
  private target: { x: number; y: number } | null = null;
  private vel = { x: 0, y: 0 };
  private knock = { x: 0, y: 0, t: 0 };
  private flash = 0;
  private hitThisAttack = false;
  private bob = 0;

  constructor(
    scene: Phaser.Scene,
    readonly spawn: EnemySpawn,
    seed: number,
  ) {
    this.def = ENEMIES[spawn.kind];
    this.stats = scaleStats(this.def.base, spawn.level);
    this.x = spawn.tx * TILE_PX + TILE_PX / 2;
    this.y = spawn.ty * TILE_PX + TILE_PX - 2;
    this.rnd = mulberry32(hash2(seed, spawn.tx, spawn.ty, 31337));
    this.timer = this.rnd() * 2;
    if (spawn.kind === 'bandit') {
      const prefix = buildCharacter(scene, BANDIT_LOOKS[spawn.look % BANDIT_LOOKS.length], ['walk', 'idle', 'slash', 'hurt']);
      this.actor = new Actor(scene, this.x, this.y, prefix);
      this.actor.baseSpeed = this.def.speed;
      this.sprite = this.actor.sprite;
      this.shadow = this.actor.shadow;
    } else {
      const kind = spawn.kind === 'slime' ? `slime${spawn.color}` : spawn.kind;
      this.shadow = scene.add.ellipse(this.x, this.y, this.def.flying ? 16 : 22, 6, 0x0a0814, 0.35).setDepth(-999_998);
      this.sprite = scene.add.sprite(this.x, this.y, CREATURES, `${kind}:0`).setOrigin(0.5, 1);
      this.sprite.play({ key: `${kind}:loop`, startFrame: Math.floor(this.rnd() * 4) });
    }
    this.sync();
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  /** Trefferfläche des Körpers. */
  get body(): Box {
    const lift = this.def.flying ? 14 : 0;
    return this.actor ? { x: this.x - 10, y: this.y - 42, w: 20, h: 42 } : { x: this.x - 12, y: this.y - 22 - lift, w: 24, h: 22 };
  }

  private get foot(): Box {
    return { x: this.x - 7, y: this.y - 6, w: 14, h: 6 };
  }

  /** Erleidet Schaden; gibt true zurück, wenn der Gegner dabei besiegt wurde. */
  hit(amount: number, fromX: number, fromY: number): boolean {
    if (!this.alive) return false;
    this.stats.hp -= amount;
    const k = knockback(fromX, fromY, this.x, this.y, this.def.kind === 'bandit' ? 26 : 40);
    this.knock = { x: k.x, y: k.y, t: 0.15 };
    this.flash = 0.1;
    if (this.state === 'windup' || this.state === 'wander') this.enter('chase');
    if (this.stats.hp <= 0) {
      this.state = 'dead';
      return true;
    }
    return false;
  }

  private enter(s: State, timer = 0): void {
    this.state = s;
    this.timer = timer;
  }

  private move(dx: number, dy: number, ctx: CombatCtx): void {
    if (this.def.flying) {
      // Fliegende Gegner ignorieren Hindernisse, bleiben aber in geladenen Bereichen.
      if (ctx.chunks.biomeAt(Math.floor((this.x + dx) / TILE_PX), Math.floor((this.y + dy) / TILE_PX)) === undefined) return;
      this.x += dx;
      this.y += dy;
      return;
    }
    const m = moveBox(this.foot, dx, dy, (b) => ctx.chunks.blocked(b));
    this.x = m.x + 7;
    this.y = m.y + 6;
  }

  update(dt: number, ctx: CombatCtx): void {
    if (!this.alive) return;
    const p = ctx.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const dist = Math.hypot(dx, dy);
    const homeX = this.spawn.tx * TILE_PX + TILE_PX / 2;
    const homeY = this.spawn.ty * TILE_PX + TILE_PX - 2;
    const fromHome = Math.hypot(this.x - homeX, this.y - homeY);
    this.cooldown -= dt;
    this.timer -= dt;
    this.flash -= dt;
    this.bob += dt;
    let mx = 0;
    let my = 0;
    let speed = this.def.speed;

    if (this.knock.t > 0) {
      this.knock.t -= dt;
      this.move((this.knock.x * dt) / 0.15, (this.knock.y * dt) / 0.15, ctx);
    } else {
      if (this.state !== 'return' && fromHome > LEASH) this.enter('return');
      switch (this.state) {
        case 'wander': {
          if (ctx.playerAlive && dist < this.def.aggro) {
            this.enter('chase');
            break;
          }
          if (!this.target && this.timer <= 0) {
            const t = wanderTarget(this.spawn, 4, this.rnd, (x, y) => this.def.flying || ctx.world.isWalkable(x, y));
            this.target = t ? { x: t.tx * TILE_PX + 16, y: t.ty * TILE_PX + 30 } : null;
            this.timer = 2 + this.rnd() * 3;
          }
          if (this.target) {
            const tx = this.target.x - this.x;
            const ty = this.target.y - this.y;
            const d = Math.hypot(tx, ty);
            if (d < 4 || this.timer <= 0) this.target = null;
            else {
              mx = tx / d;
              my = ty / d;
              speed *= 0.5;
            }
          }
          break;
        }
        case 'chase': {
          if (!ctx.playerAlive || dist > this.def.aggro * 1.6) {
            this.enter('wander');
            break;
          }
          const k = this.def.kind;
          const range = k === 'bandit' ? 34 : k === 'slime' ? 80 : k === 'wisp' ? 110 : 180;
          if (k === 'drone') {
            // Abstand halten und schießen
            const want = dist > 150 ? 1 : dist < 100 ? -1 : 0;
            mx = (dx / dist) * want + (-dy / dist) * 0.5;
            my = (dy / dist) * want + (dx / dist) * 0.5;
            if (this.cooldown <= 0 && dist < range) {
              const sp = 140;
              ctx.fireBolt(this.x, this.y - 26, (dx / dist) * sp, ((dy - 0) / dist) * sp, this.stats.attack);
              this.cooldown = 1.8;
            }
          } else if (dist > range * 0.8 || this.cooldown > 0) {
            mx = dx / dist;
            my = dy / dist;
            if (dist < range * 0.6 && this.cooldown > 0) {
              mx *= -0.3;
              my *= -0.3;
            }
          } else {
            this.enter('windup', k === 'bandit' ? 0.3 : k === 'wisp' ? 0.4 : 0.35);
            this.facing = facingFrom(dx, dy, this.facing);
            this.actor?.face(p.x, p.y);
          }
          break;
        }
        case 'windup': {
          this.actor?.face(p.x, p.y);
          if (this.timer <= 0) {
            this.hitThisAttack = false;
            if (this.def.kind === 'bandit') {
              this.enter('attack', 0.4);
              this.actor!.playAction('slash');
            } else {
              const sp = this.def.kind === 'wisp' ? 300 : 250;
              this.vel = { x: (dx / dist) * sp, y: (dy / dist) * sp };
              this.enter('attack', this.def.kind === 'wisp' ? 0.35 : 0.3);
            }
          }
          break;
        }
        case 'attack': {
          if (this.def.kind === 'bandit') {
            if (!this.hitThisAttack && this.timer < 0.22) {
              this.hitThisAttack = true;
              const box = attackBox(this.x, this.y, this.actor!.facing);
              if (overlaps(box, { x: p.x - 10, y: p.y - 40, w: 20, h: 40 })) ctx.hurtPlayer(rollDamage(this.stats.attack, 0, this.rnd), this.x, this.y);
            }
          } else {
            this.move(this.vel.x * dt, this.vel.y * dt, ctx);
            if (!this.hitThisAttack && overlaps(this.body, { x: p.x - 10, y: p.y - 40, w: 20, h: 40 })) {
              this.hitThisAttack = true;
              ctx.hurtPlayer(rollDamage(this.stats.attack, 0, this.rnd), this.x, this.y);
            }
          }
          if (this.timer <= 0) {
            this.cooldown = this.def.kind === 'bandit' ? 0.9 : 1.4;
            this.enter('chase');
          }
          break;
        }
        case 'return': {
          const tx = homeX - this.x;
          const ty = homeY - this.y;
          const d = Math.hypot(tx, ty);
          if (d < 8) {
            this.stats.hp = this.stats.maxHp;
            this.enter('wander', 1);
          } else {
            mx = tx / d;
            my = ty / d;
          }
          break;
        }
      }
    }

    if (this.actor) {
      // Räuber: Bewegung und Animation über die LPC-Figur
      this.actor.x = this.x;
      this.actor.y = this.y;
      if (!this.actor.busy) this.actor.update(mx, my, false, dt, { blocked: (b) => ctx.chunks.blocked(b), speedAt: () => speed / this.def.speed });
      this.x = this.actor.x;
      this.y = this.actor.y;
    } else if (mx || my) {
      this.move(mx * speed * dt, my * speed * dt, ctx);
      if (Math.abs(mx) > 0.2) this.sprite.setFlipX(mx < 0);
    }
    this.sync();
  }

  private sync(): void {
    const lift = this.def.flying ? 14 + Math.sin(this.bob * 3) * 3 : 0;
    const windup = this.state === 'windup' && !this.actor;
    const jx = windup ? (Math.random() - 0.5) * 2 : 0;
    if (!this.actor) {
      this.sprite.setPosition(Math.round(this.x + jx), Math.round(this.y - lift)).setDepth(this.y);
      this.shadow.setPosition(Math.round(this.x), Math.round(this.y - 1));
    } else {
      this.actor.setPosition(this.x, this.y);
    }
    if (this.flash > 0) this.sprite.setTintFill(0xffffff);
    else if (windup) this.sprite.setTint(0xffa0a0);
    else this.sprite.clearTint();
  }

  /** Lebensleiste über dem Gegner (nur wenn verletzt). */
  drawBar(g: Phaser.GameObjects.Graphics): void {
    if (!this.alive || this.stats.hp >= this.stats.maxHp) return;
    const w = 24;
    const top = this.body.y - 6;
    g.fillStyle(0x0b0b14, 0.8).fillRect(this.x - w / 2 - 1, top - 1, w + 2, 4);
    g.fillStyle(0xe04a5a, 1).fillRect(this.x - w / 2, top, (w * Math.max(0, this.stats.hp)) / this.stats.maxHp, 2);
  }

  destroy(): void {
    if (this.actor) this.actor.destroy();
    else {
      this.sprite.destroy();
      this.shadow.destroy();
    }
  }
}

/** Energiekugel einer Drohne. */
interface Bolt {
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
}

/** Erzeugt Gegner mit ihren Chunks, verwaltet Geschosse und besiegte Gegner. */
export class EnemyManager {
  readonly enemies = new Map<string, Enemy>();
  private readonly byChunk = new Map<string, string[]>();
  private readonly bolts: Bolt[] = [];
  readonly defeated = new DefeatLog();
  private readonly bars: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: WorldGen,
    chunks: ChunkManager,
    private readonly spawnTile: { tx: number; ty: number },
  ) {
    chunks.onLoad.push((cx, cy) => this.spawnChunk(cx, cy));
    chunks.onUnload.push((cx, cy) => this.despawnChunk(cx, cy));
    this.bars = scene.add.graphics().setDepth(1_000_000);
  }

  private spawnChunk(cx: number, cy: number): void {
    const ids: string[] = [];
    const now = this.scene.time.now;
    for (const s of enemiesForChunk(this.world, cx, cy, this.spawnTile)) {
      if (this.enemies.has(s.id) || this.defeated.isDefeated(s.id, now)) continue;
      this.enemies.set(s.id, new Enemy(this.scene, s, this.world.seed));
      ids.push(s.id);
    }
    this.byChunk.set(`${cx},${cy}`, ids);
  }

  private despawnChunk(cx: number, cy: number): void {
    for (const id of this.byChunk.get(`${cx},${cy}`) ?? []) {
      this.enemies.get(id)?.destroy();
      this.enemies.delete(id);
    }
    this.byChunk.delete(`${cx},${cy}`);
  }

  fireBolt(x: number, y: number, vx: number, vy: number, damage: number): void {
    const sprite = this.scene.add.sprite(x, y, CREATURES, 'bolt:0').play('bolt:loop').setDepth(1_000_000 - 1);
    this.bolts.push({ sprite, x, y, vx, vy, life: 3, damage });
  }

  /** Entfernt einen besiegten Gegner (mit Platz-Effekt) und merkt ihn sich. */
  kill(e: Enemy): void {
    this.defeated.defeat(e.spawn.id, this.scene.time.now);
    burst(this.scene, e.x, e.body.y + e.body.h / 2, e.def.kind === 'drone' ? 0x2fe0d8 : e.def.kind === 'wisp' ? 0xc4a8ff : e.def.kind === 'bandit' ? 0xe04a5a : 0x86dc62);
    e.destroy();
    this.enemies.delete(e.spawn.id);
  }

  update(dt: number, ctx: CombatCtx): void {
    for (const e of this.enemies.values()) e.update(dt, ctx);
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.sprite.setPosition(Math.round(b.x), Math.round(b.y));
      const p = ctx.player;
      const hit = ctx.playerAlive && Math.abs(b.x - p.x) < 12 && b.y > p.y - 44 && b.y < p.y;
      if (hit) ctx.hurtPlayer(b.damage, b.x - b.vx, b.y - b.vy);
      if (hit || b.life <= 0) {
        b.sprite.destroy();
        this.bolts.splice(i, 1);
      }
    }
    this.bars.clear();
    for (const e of this.enemies.values()) e.drawBar(this.bars);
  }

  /** Gegner, deren Körper eine Box überlappt. */
  inBox(box: Box): Enemy[] {
    return [...this.enemies.values()].filter((e) => e.alive && overlaps(box, e.body));
  }
}

/** Kleiner Partikel-Effekt beim Besiegen. */
export function burst(scene: Phaser.Scene, x: number, y: number, color: number): void {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = scene.add.rectangle(x, y, 3, 3, i % 3 === 0 ? 0xffffff : color).setDepth(1_000_000);
    scene.tweens.add({
      targets: r,
      x: x + Math.cos(a) * (18 + Math.random() * 14),
      y: y + Math.sin(a) * (14 + Math.random() * 10),
      alpha: 0,
      duration: 380 + Math.random() * 200,
      ease: 'Quad.easeOut',
      onComplete: () => r.destroy(),
    });
  }
}
