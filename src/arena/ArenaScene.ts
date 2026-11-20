import Phaser from 'phaser';
import { buildCharacter, preloadCharacter } from '../character/CharacterFactory';
import { dress } from '../character/outfit';
import { RARITY_NAME, starterKit, type Item, type Slot } from '../rpg/items';
import { ANIMS, DEFAULT_APPEARANCE, ROWS, type Appearance, type Race } from '../character/lpc';
import { PLAYER_MOVE, PLAYER_SWING, swingCycle } from '../combat/combat';
import { ENEMIES, type EnemyKind } from '../combat/enemies';
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
import { ARENA_H as H, ARENA_W as W, Cell, HERO_TILE, LAYOUTS, blockedIn, buildLayout, cellAt, placeGroup, speedIn, walkableIn, type ArenaLayout, type LayoutId } from './layouts';
import { arenaHeroStats, arenaWeapon, WEAPON_CHOICES, type WeaponChoice } from './weapons';
import { buildPanel } from './panel';

export type SpawnPlace = 'random' | 'front' | 'click';
/** Gemischte Welle: zwei Nahkämpfer je Art, dazu Fernkampf und Flieger. */
const WAVE: EnemyKind[] = ['slime', 'slime', 'bandit', 'bandit', 'drone', 'wisp'];
const ZOOMS = [1, 1.5, 2];

/**
 * Kampf-Arena (`?arena=1`): abgeschlossene Fläche ohne Weltgenerierung, um Steuerung und Kampfgefühl schnell und
 * gezielt auszuprobieren. Gelände-Aufbauten (`layouts.ts`), Waffenwahl (`weapons.ts`), Gegner per Knopf, Kampfwerte
 * live per Regler (siehe `panel.ts`).
 */
export class ArenaScene extends Phaser.Scene {
  player!: Actor;
  combat!: PlayerCombat;
  enemies!: EnemyManager;
  private ctx!: CombatCtx;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud?: HTMLElement;
  private hudAt = 0;
  private body: Appearance = DEFAULT_APPEARANCE;
  /** Übrige Ausrüstung des Helden (ohne Waffe) */
  private clothes: Partial<Record<Slot, Item>> = {};
  private counter = 0;
  /** Gegner bewegen sich nicht (zum Üben von Trefferabstand und Timing). */
  frozen = false;
  /** Besiegte Gegner kommen nach kurzer Zeit wieder. */
  endless = true;
  level = 1;
  elite = false;
  layout!: ArenaLayout;
  weaponChoice: WeaponChoice = 'starter';
  weaponLevel = 5;
  weapon?: Item;
  private speedFactor = 1;
  /** Gegner einsetzen: Anzahl je Knopfdruck und Ort */
  count = 1;
  place: SpawnPlace = 'random';
  /** Bei Ort „Klick“: Art (oder Welle), die ein Klick in die Arena einsetzt */
  armed: EnemyKind | 'wave' = 'slime';
  private stats = { hits: 0, damage: 0, kills: 0, taken: 0, log: [] as { t: number; dmg: number }[] };

  constructor() {
    super('arena');
  }

  init(): void {
    // Aussehen des zuletzt gespielten Helden, sonst Standard
    const seed = (load<string[]>('recent') ?? [])[0];
    const hero = seed ? load<{ appearance?: Appearance; equipped?: Partial<Record<Slot, Item>> }>(`hero:${seed}`) : null;
    this.body = { ...DEFAULT_APPEARANCE, ...hero?.appearance };
    const equipped = hero?.equipped ?? Object.fromEntries(starterKit(this.body.race ?? 'human', this.body.body).map((i) => [i.slot, i]));
    this.clothes = { ...equipped, weapon: undefined };
    applySnapshot(load<Record<string, number>>('arena:tuning'));
    const id = load<LayoutId>('arena:layout');
    this.layout = buildLayout(LAYOUTS.some((l) => l.id === id) ? id! : 'pillars');
    const w = load<{ choice: WeaponChoice; level: number }>('arena:weapon');
    if (w && WEAPON_CHOICES.some((c) => c.id === w.choice)) {
      this.weaponChoice = w.choice;
      this.weaponLevel = Math.max(1, Math.min(20, w.level || 1));
    }
    const sp = load<{ count: number; place: SpawnPlace }>('arena:spawn');
    if (sp) {
      this.count = [1, 3, 5].includes(sp.count) ? sp.count : 1;
      this.place = (['random', 'front', 'click'] as const).includes(sp.place) ? sp.place : 'random';
    }
    this.stats = { hits: 0, damage: 0, kills: 0, taken: 0, log: [] };
  }

  preload(): void {
    // Mit und ohne Waffe, damit der Wechsel sofort geht
    preloadCharacter(this, this.lookWith(undefined));
    preloadCharacter(this, this.lookWith(starterKit('human', 'male')[0]));
    for (const a of BANDIT_LOOKS) preloadCharacter(this, a);
  }

  private lookWith(weapon: Item | undefined): Appearance {
    return dress(this.body, { ...this.clothes, weapon });
  }

  create(): void {
    debugState.scene = 'arena';
    debugState.ready = false;
    createDecorAtlas(this);
    createCreatureAtlas(this);
    this.drawArena();

    const home = () => this.player.setPosition(HERO_TILE.tx * TILE_PX + TILE_PX / 2, HERO_TILE.ty * TILE_PX + TILE_PX - 2);
    this.player = new Actor(this, 0, 0, buildCharacter(this, this.lookWith(undefined)));
    home();
    const l = this.layout;
    const terrain: CombatTerrain = {
      biomeAt: (tx, ty) => (tx >= 0 && ty >= 0 && tx < W && ty < H ? B.Grassland : undefined),
      blocked: (b) => blockedIn(l, b),
      terrainBlocked: (b) => blockedIn(l, b),
      speedAt: (x, y) => speedIn(l, x, y),
      isWalkable: (tx, ty) => walkableIn(l, tx, ty),
    };
    this.enemies = new EnemyManager(this, 1);
    this.combat = new PlayerCombat(this, this.player, this.enemies, terrain, home);
    this.ctx = {
      terrain,
      player: this.player,
      playerAlive: true,
      others: [],
      hurtPlayer: (a, x, y, source) => {
        const before = this.combat.stats.hp;
        this.combat.hurt(a, x, y, false, source);
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
    debugState.zoom = 2;
    // Mausrad: Übersicht (1×) bis nah (2×)
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const i = ZOOMS.indexOf(cam.zoom);
      const next = ZOOMS[Phaser.Math.Clamp((i < 0 ? 2 : i) + (dy > 0 ? -1 : 1), 0, ZOOMS.length - 1)];
      cam.setZoom(next);
      debugState.zoom = next;
    });
    // Ort „Klick“: Gegner dort einsetzen, wo man hinklickt
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.place !== 'click') return;
      this.spawnGroup(this.kindsFor(this.armed), { tx: Math.floor(p.worldX / TILE_PX), ty: Math.floor(p.worldY / TILE_PX) });
    });

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    // M31: rechte Hand J/K/L = Hieb/Zauber/Block, linker Daumen Leertaste = Ausweichen (siehe M31-Ergebnis)
    this.combat.guardEnabled = true;
    kb.on('keydown-J', () => this.combat.attack());
    kb.on('keydown-K', () => this.combat.cast());
    kb.on('keydown-L', () => this.combat.setBlock(true));
    kb.on('keyup-L', () => this.combat.setBlock(false));
    kb.on('keydown-SPACE', () => {
      const d = this.inputDir();
      this.combat.dodgeStart(d.x, d.y);
    });
    // Fenster verliert den Fokus: Block nicht „hängen“ lassen
    const blur = () => this.combat.setBlock(false);
    this.game.events.on(Phaser.Core.Events.BLUR, blur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.BLUR, blur));

    this.events.on('damage', (d: { x: number; y: number; amount: number; color: string }) => this.floatText(d.x, d.y, String(d.amount), d.color));
    this.events.on('guard', (d: { kind: string; x: number; y: number }) => {
      if (d.kind === 'parry') this.floatText(d.x, d.y - 8, 'Parade!', '#ffd84a');
      else if (d.kind === 'evaded') this.floatText(d.x, d.y, 'ausgewichen', '#7ff0ff');
    });
    this.events.on('enemy-hit', (h: { dmg: number }) => {
      this.stats.hits++;
      this.stats.damage += h.dmg;
      this.stats.log.push({ t: this.time.now, dmg: h.dmg });
    });
    this.events.on('defeated', (e: { spawn: { kind: EnemyKind } }) => {
      this.stats.kills++;
      if (this.endless) this.time.delayedCall(900, () => this.spawnGroup([e.spawn.kind]));
    });

    this.applyWeapon();
    this.combat.heal(this.combat.stats.maxHp);
    const panel = buildPanel(this, () => this.saveTuning());
    this.hud = panel.querySelector<HTMLElement>('#arena-stats') ?? undefined;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      panel.remove();
      // Szenen-Ereignisse überleben einen Neustart (Aufbau-Wechsel) – sonst zählte alles doppelt
      for (const ev of ['damage', 'enemy-hit', 'defeated', 'guard']) this.events.off(ev);
    });
    this.spawnGroup(['slime']);

    debugState.arenaSpawn = (kind: string) => this.spawn(kind as EnemyKind | 'wave');
    debugState.arenaTune = (id: string, v: number) => {
      TUNABLES.find((t) => t.id === id)?.set(v);
      this.saveTuning();
    };
    debugState.arenaLayout = l.id;
    debugState.arenaSetLayout = (id: string) => this.setLayout(id as LayoutId);
    debugState.arenaSetWeapon = (choice: string, level?: number) => this.setWeapon(choice as WeaponChoice, level ?? this.weaponLevel);
    debugState.arenaSpawnOpts = { count: this.count, place: this.place };
    debugState.arenaBlocked = (x, y, w, h) => blockedIn(l, { x, y, w, h });
    debugState.arenaWalkable = (tx, ty) => walkableIn(l, tx, ty);
    debugState.arenaSpawnAt = (kind, tx, ty) => this.spawnGroup([kind as EnemyKind], { tx, ty });
    debugState.arenaDiagonal = (m) => {
      this.player.diagonalFacing = m === 'vertical' ? 'vertical' : 'side';
    };
    debugState.arenaHit = (dmg, dx, dy, enemyId) => {
      // Testtreffer: Schonzeit früherer Treffer zählt nicht
      this.combat.clearInvuln();
      this.ctx.hurtPlayer(dmg, this.player.x + dx, this.player.y + dy, enemyId ? this.enemies.enemies.get(enemyId) : undefined);
    };
    debugState.teleport = (tx, ty) => this.player.setPosition(tx * TILE_PX + TILE_PX / 2, ty * TILE_PX + TILE_PX - 2);
    debugState.arenaToScreen = (x, y) => {
      const r = this.game.canvas.getBoundingClientRect();
      const s = r.width / this.scale.width;
      return { x: r.left + (x - cam.worldView.x) * cam.zoom * s, y: r.top + (y - cam.worldView.y) * cam.zoom * s };
    };
    debugState.ready = true;
  }

  /** Gelände-Aufbau wechseln (startet die Szene neu, Gegner verschwinden). */
  setLayout(id: LayoutId): void {
    if (!LAYOUTS.some((l) => l.id === id)) return;
    save('arena:layout', id);
    this.scene.restart();
  }

  /** Waffe wählen: Werte (gleiche Rechnung wie im Spiel) und Grafik übernehmen, Wahl merken. */
  setWeapon(choice: WeaponChoice, level: number): void {
    this.weaponChoice = choice;
    this.weaponLevel = Math.max(1, Math.min(20, Math.round(level)));
    save('arena:weapon', { choice, level: this.weaponLevel });
    this.applyWeapon();
  }

  private applyWeapon(): void {
    const race = (this.body.race ?? 'human') as Race;
    this.weapon = arenaWeapon(this.weaponChoice, this.weaponLevel, race);
    const s = arenaHeroStats(race, this.clothes, this.weapon);
    this.combat.applyStats(s);
    this.combat.regenRate = 20;
    this.speedFactor = s.speed;
    this.player.setPrefix(buildCharacter(this, this.lookWith(this.weapon)));
    this.applyAnimRate();
    debugState.arenaWeapon = {
      choice: this.weaponChoice,
      level: this.weaponLevel,
      name: this.weapon?.name ?? 'ohne Waffe',
      attack: s.attack,
      speed: s.speed,
      look: this.lookWith(this.weapon).weapon ?? 'none',
    };
  }

  /** Kurzbeschreibung der Waffe fürs Bedienfeld. */
  weaponInfo(): string {
    const w = this.weapon;
    const s = this.combat.stats;
    if (!w) return `ohne Waffe – Angriff ${s.attack}, Tempo ×${this.speedFactor.toFixed(2)}`;
    const b = [`+${w.bonus.attack ?? 0} Angriff`, w.bonus.speed ? `+${w.bonus.speed} % Tempo` : ''].filter(Boolean).join(', ');
    return `${w.name} (${RARITY_NAME[w.rarity]}, St. ${w.level}): ${b}\nHeld: Angriff ${s.attack}, Tempo ×${this.speedFactor.toFixed(2)}`;
  }

  setSpawnOpts(count: number, place: SpawnPlace): void {
    this.count = count;
    this.place = place;
    save('arena:spawn', { count, place });
    debugState.arenaSpawnOpts = { count, place };
  }

  private kindsFor(sel: EnemyKind | 'wave'): EnemyKind[] {
    return sel === 'wave' ? WAVE : Array<EnemyKind>(this.count).fill(sel);
  }

  /** Knopf einer Art (oder „Welle“): je nach Ort sofort einsetzen oder für den nächsten Klick merken. */
  spawn(sel: EnemyKind | 'wave'): void {
    if (this.place === 'click') {
      this.armed = sel;
      return;
    }
    if (this.place === 'front') {
      const v = this.player.aim;
      const tx = Math.floor((this.player.x + v.x * 4 * TILE_PX) / TILE_PX);
      const ty = Math.floor((this.player.y - 4 + v.y * 4 * TILE_PX) / TILE_PX);
      this.spawnGroup(this.kindsFor(sel), { tx, ty });
    } else this.spawnGroup(this.kindsFor(sel));
  }

  /**
   * Setzt Gegner ein: um `at` herum (freie Kacheln, nicht auf dem Helden) oder – ohne `at` – jeden an einer
   * zufälligen freien Stelle mit Abstand zum Helden.
   */
  spawnGroup(kinds: EnemyKind[], at?: { tx: number; ty: number }): void {
    const hero = { tx: Math.floor(this.player.x / TILE_PX), ty: Math.floor((this.player.y - 4) / TILE_PX) };
    const notHero = (tx: number, ty: number) => Math.abs(tx - hero.tx) > 1 || Math.abs(ty - hero.ty) > 1;
    const spots = at ? placeGroup(this.layout, Phaser.Math.Clamp(at.tx, 1, W - 2), Phaser.Math.Clamp(at.ty, 1, H - 2), kinds.length, notHero) : [];
    kinds.forEach((kind, i) => {
      let p = spots[i];
      for (let n = 0; !p && n < 60; n++) {
        const tx = 2 + Math.floor(Math.random() * (W - 4));
        const ty = 2 + Math.floor(Math.random() * (H - 4));
        if (walkableIn(this.layout, tx, ty) && (Math.hypot(tx * TILE_PX - this.player.x, ty * TILE_PX - this.player.y) > 6 * TILE_PX || n > 40)) p = { tx, ty };
      }
      if (!p) return;
      this.enemies.add({ id: `a${this.counter++}`, kind, tx: p.tx, ty: p.ty, level: this.level, color: Math.floor(Math.random() * 5), look: this.counter, elite: this.elite });
    });
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
    Object.assign(this.combat.guardStats, { blocks: 0, parries: 0, dodges: 0, evaded: 0 });
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
    const l = this.layout;
    const g = this.add.graphics().setDepth(-999_999);
    const T = TILE_PX;
    for (let ty = 0; ty < H; ty++)
      for (let tx = 0; tx < W; tx++) {
        const c = cellAt(l, tx, ty);
        const x = tx * T;
        const y = ty * T;
        const other = (dx: number, dy: number) => cellAt(l, tx + dx, ty + dy) !== c;
        if (c === Cell.Wall) {
          g.fillStyle(0x3a3440, 1).fillRect(x, y, T, T);
          // Mauerkrone hell, Fuge dunkel, Schattenkante zum Boden
          if (other(0, -1)) g.fillStyle(0x5a5262, 1).fillRect(x, y, T, 6);
          g.fillStyle(0x2a2430, 1).fillRect(x, y + 16, T, 2).fillRect(x + ((tx + ty) % 2 ? 8 : 20), y + 6, 2, 10).fillRect(x + ((tx + ty) % 2 ? 22 : 10), y + 18, 2, 14);
          if (other(0, 1) && ty < H - 1) g.fillStyle(0x000000, 0.35).fillRect(x, y + T, T, 5);
        } else if (c === Cell.Water) {
          g.fillStyle(0x24507e, 1).fillRect(x, y, T, T);
          g.fillStyle(0x3a72a8, 1).fillRect(x + ((tx * 7) % 18), y + 8 + ((ty * 5) % 12), 10, 2);
          g.fillStyle(0x6a5a3a, 1);
          if (other(0, -1)) g.fillRect(x, y, T, 3);
          if (other(0, 1)) g.fillRect(x, y + T - 3, T, 3);
          if (other(-1, 0)) g.fillRect(x, y, 3, T);
          if (other(1, 0)) g.fillRect(x + T - 3, y, 3, T);
        } else if (c === Cell.Mud) {
          g.fillStyle(0x4a3e26, 0.85).fillRect(x, y, T, T);
          g.fillStyle(0x2e2618, 0.9).fillRect(x + ((tx * 11) % 24), y + ((ty * 13) % 24), 5, 3).fillRect(x + ((tx * 5 + 13) % 26), y + ((ty * 7 + 9) % 26), 3, 3);
        }
      }
    for (const p of l.props) {
      const img = this.add.image(p.x, p.y, ATLAS, p.frame).setOrigin(0.5, 1).setFlipX(!!p.flip);
      // Nicht feste Bodendetails liegen unter allem
      img.setDepth(p.box ? p.y : -999_990);
    }
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y - 30, text, { fontFamily: 'monospace', fontSize: '10px', color, stroke: '#0b0b14', strokeThickness: 3 }).setOrigin(0.5).setDepth(1_500_000);
    this.tweens.add({ targets: t, y: t.y - 18, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }

  /** Richtungstasten als Vektor (−1…1). */
  private inputDir(): { x: number; y: number } {
    const k = this.keys;
    return {
      x: (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0),
      y: (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0),
    };
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    const k = this.keys;
    const { x: dx, y: dy } = this.inputDir();
    this.player.baseSpeed = PLAYER_MOVE.speed * this.speedFactor * this.combat.moveFactor;
    if (this.combat.locked) this.player.update(0, 0, false, dt, this.ctx.terrain);
    else this.player.update(dx, dy, k.SHIFT.isDown && !this.combat.blocking, dt, this.ctx.terrain);
    this.combat.update(dt);
    this.ctx.playerAlive = this.combat.alive;
    if (!this.frozen) this.enemies.update(dt, this.ctx);
    else this.enemies.update(0, this.ctx);

    // Kennzahlen: Schaden der letzten 5 s, Hieb-Zyklus aus den aktuellen Werten
    const now = this.time.now;
    this.stats.log = this.stats.log.filter((l) => now - l.t < 5000);
    const dps = this.stats.log.reduce((s, l) => s + l.dmg, 0) / 5;
    const s = this.combat.stats;
    const gs = this.combat.guardStats;
    if (this.hud && now - this.hudAt > 200) {
      this.hudAt = now;
      this.hud.textContent = [
        'KAMPF-ARENA',
        `LP ${Math.ceil(s.hp)}/${s.maxHp}  Angriff ${s.attack}`,
        `Gegner ${this.enemies.enemies.size}  Hiebe ${this.combat.attacks}  Treffer ${this.stats.hits}  Besiegt ${this.stats.kills}`,
        `Schaden/s (5 s) ${dps.toFixed(1)}  erlitten ${Math.round(this.stats.taken)}`,
        `Blocks ${gs.blocks}  Paraden ${gs.parries}  Ausweichen ${gs.dodges} (ausgewichen ${gs.evaded})`,
        `Hieb-Zyklus ${(swingCycle() * 1000).toFixed(0)} ms`,
        this.place === 'click' ? `Klick in die Arena setzt ein: ${this.armed === 'wave' ? 'Welle' : ENEMIES[this.armed].name}` : '',
        'WASD laufen · J Hieb · K Zauber · L halten Block (kurz vorher = Parade) · Leertaste Ausweichen · Mausrad Zoom',
      ].filter(Boolean).join('\n');
    }
    debugState.player = { x: this.player.x, y: this.player.y, facing: this.player.facing, moving: this.player.moving, aim: { ...this.player.aim } };
    debugState.arcs = this.combat.arcs;
    debugState.attacks = this.combat.attacks;
    debugState.swinging = this.combat.swinging;
    debugState.enemies = [...this.enemies.enemies.values()].map((e) => ({ id: e.spawn.id, kind: e.def.kind, x: e.x, y: e.y, hp: e.stats.hp, state: e.state }));
    debugState.hp = s.hp;
    debugState.guard = {
      blocking: this.combat.blocking,
      blockFor: this.combat.blockFor ?? -1,
      dodging: this.combat.dodge.active,
      dodgeReady: this.combat.dodge.ready,
      last: this.combat.lastGuard ?? '',
      ...gs,
    };
  }
}
