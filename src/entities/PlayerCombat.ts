import Phaser from 'phaser';
import { attackBox, knockback, regen, rollDamage, type Stats } from '../combat/combat';
import type { ChunkManager } from '../render/ChunkManager';
import { mulberry32 } from '../world/rng';
import type { Actor } from './Actor';
import type { EnemyManager } from './Enemy';

const INVULN = 0.8;
const ATTACK_COOLDOWN = 0.12;
/** Zeitpunkt in der Hieb-Animation, an dem getroffen wird (s). */
const HIT_DELAY = 0.14;

/** Kampfzustand des Spielers: Angriff, Leben, Unverwundbarkeit, Tod und Wiedererwachen. */
export class PlayerCombat {
  readonly stats: Stats = { maxHp: 100, hp: 100, attack: 14, defense: 2 };
  alive = true;
  /** Anzahl ausgeführter Angriffe (für Tests). */
  attacks = 0;
  private invuln = 0;
  private sinceHit = 99;
  private cooldown = 0;
  private knock = { x: 0, y: 0, t: 0 };
  private readonly rnd = mulberry32(Date.now() >>> 0);

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly actor: Actor,
    private readonly enemies: EnemyManager,
    private readonly chunks: ChunkManager,
    private readonly respawn: () => void,
  ) {}

  /** Blockiert Rückstoß oder eine Aktion gerade die Steuerung? */
  get locked(): boolean {
    return !this.alive || this.actor.busy || this.knock.t > 0;
  }

  attack(): void {
    if (!this.alive || this.actor.busy || this.cooldown > 0) return;
    this.actor.playAction('slash', () => (this.cooldown = ATTACK_COOLDOWN));
    this.attacks++;
    this.scene.time.delayedCall(HIT_DELAY * 1000, () => {
      if (!this.alive) return;
      const box = attackBox(this.actor.x, this.actor.y, this.actor.facing);
      for (const e of this.enemies.inBox(box)) {
        const dmg = rollDamage(this.stats.attack, e.stats.defense, this.rnd);
        const killed = e.hit(dmg, this.actor.x, this.actor.y);
        this.scene.events.emit('damage', { x: e.x, y: e.body.y, amount: dmg, color: '#ffffff' });
        if (killed) {
          this.enemies.kill(e);
          this.scene.events.emit('defeated', e);
        }
      }
    });
  }

  hurt(amount: number, fromX: number, fromY: number, ignoreInvuln = false): void {
    if (!this.alive || (this.invuln > 0 && !ignoreInvuln)) return;
    const dmg = Math.max(1, amount - Math.floor(this.stats.defense / 2));
    this.stats.hp = Math.max(0, this.stats.hp - dmg);
    this.invuln = INVULN;
    this.sinceHit = 0;
    const k = knockback(fromX, fromY, this.actor.x, this.actor.y, 28);
    this.knock = { x: k.x, y: k.y, t: 0.15 };
    this.scene.cameras.main.shake(120, 0.004);
    this.scene.events.emit('damage', { x: this.actor.x, y: this.actor.y - 44, amount: dmg, color: '#ff6070' });
    if (this.stats.hp <= 0) this.die();
  }

  private die(): void {
    this.alive = false;
    this.actor.sprite.clearTint().setAlpha(1);
    this.actor.playAction('hurt');
    this.scene.events.emit('player-died');
    const cam = this.scene.cameras.main;
    this.scene.time.delayedCall(1200, () => {
      cam.fadeOut(500, 0, 0, 0);
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.respawn();
        this.stats.hp = this.stats.maxHp;
        this.alive = true;
        this.actor.busy = false;
        this.invuln = 1.5;
        cam.fadeIn(600, 0, 0, 0);
        this.scene.events.emit('player-respawned');
      });
    });
  }

  update(dt: number): void {
    this.invuln -= dt;
    this.sinceHit += dt;
    if (!this.actor.busy) this.cooldown -= dt;
    if (this.knock.t > 0) {
      this.knock.t -= dt;
      this.actor.push((this.knock.x * dt) / 0.15, (this.knock.y * dt) / 0.15, this.chunks);
    }
    this.stats.hp = regen(this.stats.hp, this.stats.maxHp, this.sinceHit, dt);
    // Blinken während der Unverwundbarkeit
    if (this.alive && this.invuln > 0) {
      this.actor.sprite.setAlpha(Math.floor(this.invuln * 12) % 2 ? 0.4 : 1);
      if (this.sinceHit < 0.15) this.actor.sprite.setTint(0xff7070);
      else this.actor.sprite.clearTint();
    } else if (this.alive) {
      this.actor.sprite.setAlpha(1).clearTint();
    }
  }
}
