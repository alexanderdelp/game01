import Phaser from 'phaser';
import { PLAYER_SWING, SPELL, attackZone, knockback, regen, rollDamage, zoneBounds, zoneHits, type Stats, type Vec } from '../combat/combat';
import { CREATURES } from '../render/textures';
import { mulberry32 } from '../world/rng';
import type { Actor, MoveEnv } from './Actor';
import type { EnemyManager } from './Enemy';

const INVULN = 0.8;

/** Schwung-Bogen (M28): Radius der Sichelspur um die Körpermitte und Anzahl Bilder. */
const ARC_R = 34;
const ARC_FRAMES = 3;
const ARC_KEY = 'swing-arc';

/**
 * Erzeugt die Bilder des Schwung-Bogens im Code (keine Assets): eine Sichel nach rechts (Winkel 0),
 * die von Bild zu Bild weiter durchgezogen wird; das letzte Bild ist voll, aber blasser.
 */
function ensureArcTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(`${ARC_KEY}:0`)) return;
  const size = ARC_R * 2 + 8;
  const c = size / 2;
  const span = Math.PI * 0.75; // ±67,5°
  for (let f = 0; f < ARC_FRAMES; f++) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const end = -span / 2 + (span * (f + 1)) / ARC_FRAMES;
    const steps = 14;
    const outer: Vec[] = [];
    const inner: Vec[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = -span / 2 + (end + span / 2) * t;
      // Dick an der Spitze der Bewegung (vorn), dünn am Anfang der Spur
      const thick = 2 + 9 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)) * (0.4 + 0.6 * t);
      outer.push({ x: c + Math.cos(a) * ARC_R, y: c + Math.sin(a) * ARC_R });
      inner.push({ x: c + Math.cos(a) * (ARC_R - thick), y: c + Math.sin(a) * (ARC_R - thick) });
    }
    const pts = [...outer, ...inner.reverse()].map((p) => new Phaser.Math.Vector2(Math.round(p.x), Math.round(p.y)));
    g.fillStyle(0x9fe8ff, f === ARC_FRAMES - 1 ? 0.45 : 0.75);
    g.fillPoints(pts, true);
    // Heller Rand außen (Klingenspitze)
    g.lineStyle(2, 0xffffff, f === ARC_FRAMES - 1 ? 0.5 : 0.95);
    g.strokePoints(outer.map((p) => new Phaser.Math.Vector2(Math.round(p.x), Math.round(p.y))), false);
    g.generateTexture(`${ARC_KEY}:${f}`, size, size);
    g.destroy();
  }
}

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
  /** Hieb läuft (Figur darf dabei laufen). */
  swinging = false;
  private readonly rnd = mulberry32(Date.now() >>> 0);
  /** Schwung-Bogen des laufenden Hiebs (folgt der Figur). */
  private arc?: { img: Phaser.GameObjects.Image; aim: Vec; t: number };
  /** Anzahl gezeigter Schwung-Bögen (für Tests). */
  arcs = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly actor: Actor,
    private readonly enemies: EnemyManager,
    private readonly chunks: MoveEnv,
    private readonly respawn: () => void,
  ) {
    // Der Held zielt in 8 Richtungen und zeigt diagonal die Seitenansicht (M28).
    actor.diagonalFacing = 'side';
    ensureArcTextures(scene);
  }

  regenRate = 3;
  /** Abklingzeit des Zaubers in Sekunden (0 = bereit) */
  spellCooldown = 0;
  private readonly bolts: { sprite: Phaser.GameObjects.Sprite; x: number; y: number; vx: number; vy: number; travelled: number; hit: Set<string> }[] = [];

  /** Fernzauber „Splitterblitz“: Kristallgeschoss in Zielrichtung (8 Richtungen). */
  cast(): void {
    if (!this.alive || this.actor.busy || this.spellCooldown > 0) return;
    this.spellCooldown = SPELL.cooldown;
    this.actor.playAction('spellcast');
    this.scene.events.emit('sfx', 'cast');
    const v = { ...this.actor.aim };
    this.scene.time.delayedCall(SPELL.castDelay * 1000, () => {
      if (!this.alive) return;
      const x = this.actor.x + v.x * 18;
      const y = this.actor.y - 26 + v.y * 10;
      const sprite = this.scene.add.sprite(x, y, CREATURES, 'bolt:0').play('bolt:loop').setTint(0xc47aff).setScale(2.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(1_000_000 - 2).setRotation(Math.atan2(v.y, v.x));
      this.bolts.push({ sprite, x, y, vx: v.x * SPELL.speed, vy: v.y * SPELL.speed, travelled: 0, hit: new Set() });
    });
  }

  private updateBolts(dt: number): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.travelled += SPELL.speed * dt;
      b.sprite.setPosition(Math.round(b.x), Math.round(b.y));
      let done = b.travelled > SPELL.range;
      for (const e of this.enemies.inBox({ x: b.x - 8, y: b.y - 8, w: 16, h: 16 })) {
        if (b.hit.has(e.spawn.id)) continue;
        b.hit.add(e.spawn.id);
        const dmg = rollDamage(this.stats.attack * SPELL.damageFactor * (this.buffTime > 0 ? 1.25 : 1), e.stats.defense, this.rnd);
        const killed = e.hit(dmg, b.x - b.vx, b.y - b.vy);
        this.scene.events.emit('enemy-hit', { enemy: e.spawn.id, dmg, x: b.x - b.vx * 0.1, y: b.y - b.vy * 0.1 });
        this.scene.events.emit('damage', { x: e.x, y: e.body.y, amount: dmg, color: '#d8c4ff' });
        if (killed) {
          this.enemies.kill(e);
          this.scene.events.emit('defeated', e);
        }
        done = true;
        break;
      }
      if (done) {
        b.sprite.destroy();
        this.bolts.splice(i, 1);
      }
    }
  }
  private buffTime = 0;

  /** Schrein-Segen: +25 % Angriff für `seconds`. */
  buff(seconds: number): void {
    this.buffTime = seconds;
  }

  get buffed(): boolean {
    return this.buffTime > 0;
  }

  /** Übernimmt neue Endwerte (Stufe, Talente, Ausrüstung); LP-Zuwachs wird gutgeschrieben. */
  applyStats(s: { maxHp: number; attack: number; defense: number; regen: number }): void {
    const gained = s.maxHp - this.stats.maxHp;
    this.stats.maxHp = s.maxHp;
    this.stats.hp = Math.min(s.maxHp, this.stats.hp + Math.max(0, gained));
    this.stats.attack = s.attack;
    this.stats.defense = s.defense;
    this.regenRate = s.regen;
  }

  heal(hp: number): void {
    this.stats.hp = Math.min(this.stats.maxHp, hp);
  }

  /** Blockiert Rückstoß oder eine Aktion gerade die Steuerung? */
  get locked(): boolean {
    return !this.alive || (this.actor.busy && !this.swinging) || this.knock.t > 0;
  }

  attack(): void {
    if (!this.alive || this.actor.busy || this.cooldown > 0) return;
    this.swinging = true;
    this.actor.playAction(
      'slash',
      () => {
        this.swinging = false;
        this.cooldown = PLAYER_SWING.cooldown;
      },
      PLAYER_SWING.moveFactor,
    );
    this.attacks++;
    this.scene.events.emit('player-attack');
    // Der Hieb geht dorthin, wohin man beim Drücken zielte.
    const aim = { ...this.actor.aim };
    this.showArc(aim);
    this.scene.time.delayedCall(PLAYER_SWING.hitDelay * 1000, () => {
      if (!this.alive) return;
      const zone = attackZone(this.actor.x, this.actor.y, aim);
      for (const e of this.enemies.inBox(zoneBounds(zone)).filter((en) => zoneHits(zone, en.body))) {
        const dmg = rollDamage(this.stats.attack * (this.buffTime > 0 ? 1.25 : 1), e.stats.defense, this.rnd);
        // Rückstoß in Zielrichtung: Ursprung hinter dem Gegner, entgegen der Zielrichtung
        const killed = e.hit(dmg, e.x - aim.x * 40, e.y - aim.y * 40);
        this.scene.events.emit('enemy-hit', { enemy: e.spawn.id, dmg, x: this.actor.x, y: this.actor.y });
        this.scene.events.emit('damage', { x: e.x, y: e.body.y, amount: dmg, color: '#ffffff' });
        if (killed) {
          this.enemies.kill(e);
          this.scene.events.emit('defeated', e);
        }
      }
    });
  }

  /** Zeigt die Sichelspur des Hiebs in Zielrichtung (2–3 Bilder über die Hieb-Dauer). */
  private showArc(aim: Vec): void {
    this.arc?.img.destroy();
    const img = this.scene.add.image(0, 0, `${ARC_KEY}:0`).setBlendMode(Phaser.BlendModes.ADD).setRotation(Math.atan2(aim.y, aim.x));
    this.arc = { img, aim, t: 0 };
    this.arcs++;
    this.placeArc();
  }

  private placeArc(): void {
    const a = this.arc;
    if (!a) return;
    const cx = this.actor.x + a.aim.x * 6;
    const cy = this.actor.y - 18 + a.aim.y * 6;
    a.img.setPosition(Math.round(cx), Math.round(cy));
    // Nach oben hinter der Figur, sonst davor
    a.img.setDepth(this.actor.y + (a.aim.y < -0.1 ? -1 : 1));
  }

  private updateArc(dt: number): void {
    const a = this.arc;
    if (!a) return;
    a.t += dt;
    const total = PLAYER_SWING.frames / PLAYER_SWING.frameRate;
    const f = Math.floor((a.t / total) * ARC_FRAMES);
    if (f >= ARC_FRAMES || !this.alive) {
      a.img.destroy();
      this.arc = undefined;
      return;
    }
    a.img.setTexture(`${ARC_KEY}:${f}`);
    this.placeArc();
  }

  hurt(amount: number, fromX: number, fromY: number, ignoreInvuln = false): void {
    if (!this.alive || (this.invuln > 0 && !ignoreInvuln)) return;
    const dmg = Math.max(1, amount - Math.floor(this.stats.defense / 2));
    this.stats.hp = Math.max(0, this.stats.hp - dmg);
    this.invuln = INVULN;
    this.sinceHit = 0;
    const k = knockback(fromX, fromY, this.actor.x, this.actor.y, 28);
    this.knock = { x: k.x, y: k.y, t: PLAYER_SWING.knockLock };
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
        this.swinging = false;
        this.invuln = 1.5;
        cam.fadeIn(600, 0, 0, 0);
        this.scene.events.emit('player-respawned');
      });
    });
  }

  update(dt: number): void {
    this.invuln -= dt;
    this.buffTime -= dt;
    this.spellCooldown = Math.max(0, this.spellCooldown - dt);
    this.updateBolts(dt);
    this.updateArc(dt);
    this.sinceHit += dt;
    if (!this.actor.busy) this.cooldown -= dt;
    if (this.knock.t > 0) {
      this.knock.t -= dt;
      this.actor.push((this.knock.x * dt) / PLAYER_SWING.knockLock, (this.knock.y * dt) / PLAYER_SWING.knockLock, this.chunks);
    }
    this.stats.hp = regen(this.stats.hp, this.stats.maxHp, this.sinceHit, dt, 4, this.regenRate);
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
