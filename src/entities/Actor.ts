import Phaser from 'phaser';
import { FRAME } from '../character/lpc';
import { TILE_PX } from '../render/chunkPixels';
import { facingFrom, moveBox, type Box, type Facing } from '../world/collision';

/** Größe der Kollisionsbox am Fuß der Figur. */
export const FOOT_W = 16;
export const FOOT_H = 8;
/** Abstand von der Fußlinie zur Unterkante des 64-px-Frames. */
const FEET_OFFSET = 4;

export interface MoveEnv {
  blocked(b: Box): boolean;
  /** Geschwindigkeitsfaktor des Geländes an einer Pixelposition. */
  speedAt(x: number, y: number): number;
}

/** Eine laufende Figur (Spieler oder NPC): Position = Fußpunkt in Weltpixeln. */
export class Actor {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  facing: Facing = 'down';
  moving = false;
  baseSpeed = 150;

  constructor(
    scene: Phaser.Scene,
    public x: number,
    public y: number,
    readonly prefix: string,
  ) {
    this.shadow = scene.add.ellipse(x, y, 24, 8, 0x0a0814, 0.35);
    this.sprite = scene.add.sprite(x, y, `${prefix}:walk`, 18).setOrigin(0.5, (FRAME - FEET_OFFSET) / FRAME);
    this.sync();
  }

  get box(): Box {
    return { x: this.x - FOOT_W / 2, y: this.y - FOOT_H, w: FOOT_W, h: FOOT_H };
  }

  get tile(): { tx: number; ty: number } {
    return { tx: Math.floor(this.x / TILE_PX), ty: Math.floor((this.y - 1) / TILE_PX) };
  }

  /** Bewegt die Figur um eine Richtung (Länge ≤ 1) für `dt` Sekunden. */
  update(dirX: number, dirY: number, sprint: boolean, dt: number, env: MoveEnv): void {
    const len = Math.hypot(dirX, dirY);
    if (this.busy) {
      this.moving = false;
      this.sync();
      return;
    }
    this.moving = len > 0.15;
    if (this.moving) {
      const nx = dirX / Math.max(1, len);
      const ny = dirY / Math.max(1, len);
      const speed = this.baseSpeed * (sprint ? 1.6 : 1) * Math.max(0.3, env.speedAt(this.x, this.y - 2));
      const moved = moveBox(this.box, nx * speed * dt, ny * speed * dt, (b) => env.blocked(b));
      this.x = moved.x + FOOT_W / 2;
      this.y = moved.y + FOOT_H;
      this.facing = facingFrom(nx, ny, this.facing);
      this.play(`walk:${this.facing}`, sprint ? 1.5 : 1);
    } else {
      this.play(`idle:${this.facing}`, 1);
    }
    this.sync();
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.sync();
  }

  /** Läuft gerade eine Aktions-Animation (Angriff, Zusammensacken)? */
  busy = false;

  /** Spielt eine einmalige Animation (z. B. "slash"); Bewegungsanimationen pausieren solange. */
  playAction(anim: string, onDone?: () => void): void {
    const key = anim === 'hurt' ? `${this.prefix}:hurt:any` : `${this.prefix}:${anim}:${this.facing}`;
    this.busy = true;
    this.sprite.anims.timeScale = 1;
    this.sprite.play(key);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.busy = false;
      onDone?.();
    });
  }

  /** Dreht die Figur zu einem Punkt. */
  face(x: number, y: number): void {
    this.facing = facingFrom(x - this.x, y - this.y, this.facing);
    if (!this.busy) this.play(`idle:${this.facing}`, 1);
  }

  /** Verschiebt die Figur mit Kollision (Rückstoß). */
  push(dx: number, dy: number, env: MoveEnv): void {
    const moved = moveBox(this.box, dx, dy, (b) => env.blocked(b));
    this.x = moved.x + FOOT_W / 2;
    this.y = moved.y + FOOT_H;
    this.sync();
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
  }

  private play(anim: string, timeScale: number): void {
    const key = `${this.prefix}:${anim}`;
    if (this.sprite.anims.currentAnim?.key !== key) this.sprite.play(key);
    this.sprite.anims.timeScale = timeScale;
  }

  private sync(): void {
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y));
    this.sprite.setDepth(this.y);
    this.shadow.setPosition(Math.round(this.x), Math.round(this.y) - 1).setDepth(-999_998);
  }
}
