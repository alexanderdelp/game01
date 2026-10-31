import Phaser from 'phaser';
import { buildCharacter, preloadCharacter } from '../character/CharacterFactory';
import { dress } from '../character/outfit';
import { starterKit, type Item, type Slot } from '../rpg/items';
import { ANIMS, DEFAULT_APPEARANCE, ROWS, type Appearance } from '../character/lpc';
import { PLAYER_MOVE, PLAYER_SWING, swingCycle } from '../combat/combat';
import type { EnemyKind } from '../combat/enemies';
import { DEFAULTS, TUNABLES, applySnapshot, exportCode, snapshot } from '../combat/tuning';
import { debugState } from '../debug';
import { Actor } from '../entities/Actor';
import { BANDIT_LOOKS, EnemyManager, type CombatCtx, type CombatTerrain } from '../entities/Enemy';
import { PlayerCombat } from '../entities/PlayerCombat';
import { load, save } from '../game/save';
import { TILE_PX } from '../render/chunkPixels';
import { PATTERN, groundPattern } from '../render/groundPatterns';
import { ATLAS, createCreatureAtlas, createDecorAtlas } from '../render/textures';
import { B } from '../world/biomes';
import { overlaps, type Box } from '../world/collision';
import { buildPanel } from './panel';

/** Größe der Arena in Kacheln. */
const W = 26;
const H = 16;
/** Säulen als Hindernisse (Kachelkoordinaten). */
const PILLARS = [
  { tx: 7, ty: 5 },
  { tx: 18, ty: 5 },
  { tx: 7, ty: 11 },
  { tx: 18, ty: 11 },
];
const PILLAR_BOXES: Box[] = PILLARS.map((p) => ({ x: p.tx * TILE_PX + TILE_PX / 2 - 16, y: p.ty * TILE_PX + TILE_PX - 14, w: 32, h: 14 }));

/**
 * Kampf-Arena (`?arena=1`): kleine, abgeschlossene Fläche ohne Weltgenerierung, um Steuerung und Kampfgefühl
 * schnell und gezielt auszuprobieren. Gegner per Knopf, Kampfwerte live per Regler (siehe `panel.ts`).
 */
export class ArenaScene extends Phaser.Scene {
  player!: Actor;
  combat!: PlayerCombat;
  enemies!: EnemyManager;
  private ctx!: CombatCtx;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud?: HTMLElement;
  private hudAt = 0;
  private look: Appearance = DEFAULT_APPEARANCE;
  private counter = 0;
  /** Gegner bewegen sich nicht (zum Üben von Trefferabstand und Timing). */
  frozen = false;
  /** Besiegte Gegner kommen nach kurzer Zeit wieder. */
  endless = true;
  level = 1;
  elite = false;
  private stats = { hits: 0, damage: 0, kills: 0, taken: 0, log: [] as { t: number; dmg: number }[] };

  constructor() {
    super('arena');
  }

  init(): void {
    // Aussehen des zuletzt gespielten Helden, sonst Standard
    const seed = (load<string[]>('recent') ?? [])[0];
    const hero = seed ? load<{ appearance?: Appearance; equipped?: Partial<Record<Slot, Item>> }>(`hero:${seed}`) : null;
    const body = { ...DEFAULT_APPEARANCE, ...hero?.appearance };
    this.look = dress(body, hero?.equipped ?? Object.fromEntries(starterKit(body.race ?? 'human', body.body).map((i) => [i.slot, i])));
    applySnapshot(load<Record<string, number>>('arena:tuning'));
  }

  preload(): void {
    preloadCharacter(this, this.look);
    for (const a of BANDIT_LOOKS) preloadCharacter(this, a);
  }

  create(): void {
    debugState.scene = 'arena';
    createDecorAtlas(this);
    createCreatureAtlas(this);
    this.drawArena();

    this.player = new Actor(this, (W / 2) * TILE_PX, (H / 2) * TILE_PX, buildCharacter(this, this.look));
    this.player.baseSpeed = PLAYER_MOVE.speed;
    const terrain: CombatTerrain = {
      biomeAt: (tx, ty) => (tx >= 0 && ty >= 0 && tx < W && ty < H ? B.Grassland : undefined),
      blocked: (b) => this.blocked(b),
      terrainBlocked: (b) => this.blocked(b),
      speedAt: () => 1,
      isWalkable: (tx, ty) => tx >= 1 && ty >= 1 && tx < W - 1 && ty < H - 1 && !PILLARS.some((p) => p.tx === tx && p.ty === ty),
    };
    this.enemies = new EnemyManager(this, 1);
    this.combat = new PlayerCombat(this, this.player, this.enemies, terrain, () => this.player.setPosition((W / 2) * TILE_PX, (H / 2) * TILE_PX));
    this.combat.regenRate = 20;
    this.ctx = {
      terrain,
      player: this.player,
      playerAlive: true,
      others: [],
      hurtPlayer: (a, x, y) => {
        const before = this.combat.stats.hp;
        this.combat.hurt(a, x, y);
        this.stats.taken += before - this.combat.stats.hp;
      },
      fireBolt: (x, y, vx, vy, d) => this.enemies.fireBolt(x, y, vx, vy, d),
    };

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x14101c);
    cam.setZoom(2);
    cam.setBounds(-2 * TILE_PX, -2 * TILE_PX, (W + 4) * TILE_PX, (H + 4) * TILE_PX);
    cam.startFollow(this.player.sprite, true, 0.2, 0.2);
    cam.setRoundPixels(true);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-SPACE', () => this.combat.attack());
    kb.on('keydown-J', () => this.combat.attack());
    kb.on('keydown-K', () => this.combat.cast());

    this.events.on('damage', (d: { x: number; y: number; amount: number; color: string }) => this.floatText(d.x, d.y, String(d.amount), d.color));
    this.events.on('enemy-hit', (h: { dmg: number }) => {
      this.stats.hits++;
      this.stats.damage += h.dmg;
      this.stats.log.push({ t: this.time.now, dmg: h.dmg });
    });
    this.events.on('defeated', (e: { spawn: { kind: EnemyKind } }) => {
      this.stats.kills++;
      if (this.endless) this.time.delayedCall(900, () => this.spawn(e.spawn.kind));
    });

    const panel = buildPanel(this, () => this.saveTuning());
    this.hud = panel.querySelector<HTMLElement>('#arena-stats') ?? undefined;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => panel.remove());
    this.applyAnimRate();
    this.spawn('slime');

    debugState.ready = true;
    debugState.arenaSpawn = (kind: string) => this.spawn(kind as EnemyKind);
    debugState.arenaTune = (id: string, v: number) => {
      TUNABLES.find((t) => t.id === id)?.set(v);
      this.saveTuning();
    };
  }

  /** Setzt einen Gegner an einer freien Stelle mit Abstand zum Helden ein. */
  spawn(kind: EnemyKind): void {
    let tx = 0;
    let ty = 0;
    for (let i = 0; i < 30; i++) {
      tx = 2 + Math.floor(Math.random() * (W - 4));
      ty = 2 + Math.floor(Math.random() * (H - 4));
      if (this.ctx.terrain.isWalkable(tx, ty) && Math.hypot(tx * TILE_PX - this.player.x, ty * TILE_PX - this.player.y) > 6 * TILE_PX) break;
    }
    this.enemies.add({ id: `a${this.counter++}`, kind, tx, ty, level: this.level, color: Math.floor(Math.random() * 5), look: this.counter, elite: this.elite });
  }

  clearEnemies(): void {
    for (const e of [...this.enemies.enemies.values()]) {
      e.destroy();
      this.enemies.enemies.delete(e.spawn.id);
    }
  }

  resetStats(): void {
    this.stats = { hits: 0, damage: 0, kills: 0, taken: 0, log: [] };
    this.combat.attacks = 0;
  }

  /** Regler geändert: Werte merken und auf laufende Objekte anwenden. */
  saveTuning(): void {
    save('arena:tuning', snapshot());
    this.applyAnimRate();
  }

  resetTuning(): void {
    applySnapshot(DEFAULTS);
    this.saveTuning();
  }

  copyTuning(): string {
    const code = exportCode();
    void navigator.clipboard?.writeText(code).catch(() => {});
    return code;
  }

  /** Die Hieb-Animation übernimmt die eingestellte Bildrate (sonst gälte sie erst beim nächsten Laden). */
  private applyAnimRate(): void {
    ANIMS.slash.frameRate = PLAYER_SWING.frameRate;
    for (const dir of ROWS) {
      const a = this.anims.get(`${this.player.prefix}:slash:${dir}`);
      if (!a) continue;
      a.frameRate = PLAYER_SWING.frameRate;
      a.msPerFrame = 1000 / PLAYER_SWING.frameRate;
      a.duration = a.msPerFrame * a.frames.length;
    }
  }

  private blocked(b: Box): boolean {
    if (b.x < TILE_PX || b.y < TILE_PX || b.x + b.w > (W - 1) * TILE_PX || b.y + b.h > (H - 1) * TILE_PX) return true;
    return PILLAR_BOXES.some((p) => overlaps(b, p));
  }

  private drawArena(): void {
    if (!this.textures.exists('arena-ground')) {
      const pat = groundPattern(B.Grassland, 7);
      const c = document.createElement('canvas');
      c.width = c.height = PATTERN;
      const g = c.getContext('2d')!;
      const img = g.createImageData(PATTERN, PATTERN);
      pat.forEach((v, i) => {
        img.data[i * 4] = v >> 16;
        img.data[i * 4 + 1] = (v >> 8) & 255;
        img.data[i * 4 + 2] = v & 255;
        img.data[i * 4 + 3] = 255;
      });
      g.putImageData(img, 0, 0);
      this.textures.addCanvas('arena-ground', c);
    }
    this.add.tileSprite(0, 0, W * TILE_PX, H * TILE_PX, 'arena-ground').setOrigin(0).setDepth(-1_000_000);
    // Mauer: Rand aus Felsen
    const wall = this.add.graphics().setDepth(-999_999);
    wall.fillStyle(0x3a3440, 1);
    wall.fillRect(0, 0, W * TILE_PX, TILE_PX).fillRect(0, (H - 1) * TILE_PX, W * TILE_PX, TILE_PX);
    wall.fillRect(0, 0, TILE_PX, H * TILE_PX).fillRect((W - 1) * TILE_PX, 0, TILE_PX, H * TILE_PX);
    wall.lineStyle(2, 0x5a5262, 1).strokeRect(TILE_PX, TILE_PX, (W - 2) * TILE_PX, (H - 2) * TILE_PX);
    for (const p of PILLARS) this.add.image(p.tx * TILE_PX + TILE_PX / 2, p.ty * TILE_PX + TILE_PX, ATLAS, 'boulder:0').setOrigin(0.5, 1).setDepth(p.ty * TILE_PX + TILE_PX);
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y - 30, text, { fontFamily: 'monospace', fontSize: '10px', color, stroke: '#0b0b14', strokeThickness: 3 }).setOrigin(0.5).setDepth(1_500_000);
    this.tweens.add({ targets: t, y: t.y - 18, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    const k = this.keys;
    const dx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const dy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    this.player.baseSpeed = PLAYER_MOVE.speed;
    if (this.combat.locked) this.player.update(0, 0, false, dt, this.ctx.terrain);
    else this.player.update(dx, dy, k.SHIFT.isDown, dt, this.ctx.terrain);
    this.combat.update(dt);
    this.ctx.playerAlive = this.combat.alive;
    if (!this.frozen) this.enemies.update(dt, this.ctx);
    else this.enemies.update(0, this.ctx);

    // Kennzahlen: Schaden der letzten 5 s, Hieb-Zyklus aus den aktuellen Werten
    const now = this.time.now;
    this.stats.log = this.stats.log.filter((l) => now - l.t < 5000);
    const dps = this.stats.log.reduce((s, l) => s + l.dmg, 0) / 5;
    const s = this.combat.stats;
    if (this.hud && now - this.hudAt > 200) {
      this.hudAt = now;
      this.hud.textContent = [
        'KAMPF-ARENA',
        `LP ${Math.ceil(s.hp)}/${s.maxHp}  Angriff ${s.attack}`,
        `Hiebe ${this.combat.attacks}  Treffer ${this.stats.hits}  Besiegt ${this.stats.kills}`,
        `Schaden/s (5 s) ${dps.toFixed(1)}  erlitten ${Math.round(this.stats.taken)}`,
        `Hieb-Zyklus ${(swingCycle() * 1000).toFixed(0)} ms`,
        'WASD laufen · Leertaste Hieb · K Zauber',
      ].join('\n');
    }
    debugState.player = { x: this.player.x, y: this.player.y, facing: this.player.facing, moving: this.player.moving };
    debugState.attacks = this.combat.attacks;
    debugState.swinging = this.combat.swinging;
    debugState.enemies = [...this.enemies.enemies.values()].map((e) => ({ id: e.spawn.id, kind: e.def.kind, x: e.x, y: e.y, hp: e.stats.hp, state: e.state }));
    debugState.hp = s.hp;
  }
}
