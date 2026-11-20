import Phaser from 'phaser';
import { buildCharacter, preloadCharacter } from '../character/CharacterFactory';
import { dress } from '../character/outfit';
import { DEFAULT_APPEARANCE, type Appearance } from '../character/lpc';
import { PLAYER_MOVE } from '../combat/combat';
import type { EnemyKind } from '../combat/enemies';
import { TUNABLES, applySnapshot, snapshot } from '../combat/tuning';
import { debugState } from '../debug';
import { Actor, type MoveEnv } from '../entities/Actor';
import { BANDIT_LOOKS, EnemyManager, type CombatCtx, type CombatTerrain } from '../entities/Enemy';
import { PlayerCombat } from '../entities/PlayerCombat';
import { load, save } from '../game/save';
import { ChunkManager } from '../render/ChunkManager';
import { TILE_PX } from '../render/chunkPixels';
import { ATLAS, createCreatureAtlas, createDecorAtlas } from '../render/textures';
import { starterKit, type Item, type Slot } from '../rpg/items';
import { BIOMES } from '../world/biomes';
import type { Box } from '../world/collision';
import { tileHeight } from '../world/terrain';
import { CHUNK_TILES, WORLD_TILES, WorldGen } from '../world/WorldGen';
import { Atmosphere } from './atmosphere';
import { LAB_DEFAULTS, LAB_MOOD, LAB_TUNABLES, applyLabSnapshot, exportLabCode, gradeFactor, labSnapshot, smoothDir } from './labTuning';
import { buildLabPanel } from './labPanel';
import { PLACES, parsePlace, type LabPlace } from './places';

const WAVE: EnemyKind[] = ['slime', 'slime', 'bandit', 'bandit', 'drone', 'wisp'];

/**
 * Bewegungslabor (M33, `?labor=1`): ein Ausschnitt der echten Welt ohne Weltsysteme, um Laufen, später Perspektive
 * und Sprünge im Gelände auszuprobieren. Kampf wie in der Arena (PlayerCombat, EnemyManager).
 */
export class LabScene extends Phaser.Scene {
  player!: Actor;
  combat!: PlayerCombat;
  enemies!: EnemyManager;
  world!: WorldGen;
  chunks!: ChunkManager;
  place!: LabPlace;
  level = 3;
  private ctx!: CombatCtx;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private body: Appearance = DEFAULT_APPEARANCE;
  private clothes: Partial<Record<Slot, Item>> = {};
  private mood!: Atmosphere;
  private dir = { x: 0, y: 0 };
  private counter = 0;
  private hud?: HTMLElement;
  private hudAt = 0;
  private chest?: { img: Phaser.GameObjects.Image; x: number; y: number; open: boolean };
  private altar?: { tx: number; ty: number };
  /** gemessenes Tempo (px/s, geglättet) */
  private speed = 0;
  private panel?: HTMLElement;

  constructor() {
    super('labor');
  }

  init(): void {
    const seed = (load<string[]>('recent') ?? [])[0];
    const hero = seed ? load<{ appearance?: Appearance; equipped?: Partial<Record<Slot, Item>> }>(`hero:${seed}`) : null;
    this.body = { ...DEFAULT_APPEARANCE, ...hero?.appearance };
    this.clothes = hero?.equipped ?? Object.fromEntries(starterKit(this.body.race ?? 'human', this.body.body).map((i) => [i.slot, i]));
    applySnapshot(load<Record<string, number>>('arena:tuning'));
    applyLabSnapshot(load<Record<string, number>>('labor:tuning'));
    const fromUrl = new URLSearchParams(location.search).get('ort');
    this.place = parsePlace(fromUrl ?? load<string>('labor:ort'));
    this.chest = undefined;
    this.altar = undefined;
    this.dir = { x: 0, y: 0 };
  }

  preload(): void {
    preloadCharacter(this, dress(this.body, this.clothes));
    for (const a of BANDIT_LOOKS) preloadCharacter(this, a);
  }

  create(): void {
    debugState.scene = 'labor';
    debugState.ready = false;
    createDecorAtlas(this);
    createCreatureAtlas(this);
    const p = this.place;
    this.world = new WorldGen(p.seed);
    this.chunks = new ChunkManager(this, p.seed);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.chunks.destroy());

    const at = (tx: number, ty: number) => ({ x: tx * TILE_PX + TILE_PX / 2, y: ty * TILE_PX + TILE_PX - 2 });
    const start = at(p.tx, p.ty);
    const home = () => this.player.setPosition(start.x, start.y);
    this.player = new Actor(this, start.x, start.y, buildCharacter(this, dress(this.body, this.clothes)));
    const chunks = this.chunks;
    const world = this.world;
    const terrain: CombatTerrain = {
      biomeAt: (tx, ty) => chunks.biomeAt(tx, ty),
      blocked: (b) => chunks.blocked(b),
      terrainBlocked: (b) => chunks.terrainBlocked(b),
      speedAt: (x, y) => chunks.speedAt(x, y),
      isWalkable: (tx, ty) => world.isWalkable(tx, ty),
    };
    this.enemies = new EnemyManager(this, 1);
    this.combat = new PlayerCombat(this, this.player, this.enemies, terrain, home);
    this.combat.guardEnabled = true;
    this.combat.regenRate = 20;
    this.ctx = {
      terrain,
      player: this.player,
      playerAlive: true,
      others: [],
      hurtPlayer: (a, x, y, source) => this.combat.hurt(a, x, y, false, source),
      fireBolt: (x, y, vx, vy, d) => this.enemies.fireBolt(x, y, vx, vy, d),
    };
    if (p.summit) this.buildSummit(p.summit);
    this.mood = new Atmosphere(this);

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x172a5c);
    cam.setBounds(0, 0, WORLD_TILES * TILE_PX, WORLD_TILES * TILE_PX);
    cam.setRoundPixels(true);
    cam.setZoom(LAB_MOOD.zoom);
    cam.startFollow(this.player.sprite, true, 0.15, 0.15, 0, 20);
    cam.centerOn(start.x, start.y);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-J', () => this.combat.attack());
    kb.on('keydown-K', () => this.combat.cast());
    kb.on('keydown-L', () => this.combat.setBlock(true));
    kb.on('keyup-L', () => this.combat.setBlock(false));
    kb.on('keydown-E', () => this.openChest());
    kb.on('keydown-SPACE', () => {
      const d = this.inputDir();
      this.combat.dodgeStart(d.x, d.y);
    });
    const blur = () => this.combat.setBlock(false);
    this.game.events.on(Phaser.Core.Events.BLUR, blur);
    this.events.on('damage', (d: { x: number; y: number; amount: number; color: string }) => this.floatText(d.x, d.y, String(d.amount), d.color));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, blur);
      this.events.off('damage');
      this.panel?.remove();
      this.mood.destroy();
    });

    this.combat.heal(this.combat.stats.maxHp);
    this.panel = buildLabPanel(this);
    this.hud = this.panel.querySelector<HTMLElement>('#labor-stats') ?? undefined;

    debugState.arenaSpawn = (kind: string) => this.spawn(kind as EnemyKind | 'wave');
    debugState.arenaTune = (id: string, v: number) => this.tune(id, v);
    debugState.teleport = (tx, ty) => this.player.setPosition(at(tx, ty).x, at(tx, ty).y);
    debugState.laborSetPlace = (id: string) => this.setPlace(id);
    debugState.laborOpenChest = () => {
      if (this.chest) this.player.setPosition(this.chest.x, this.chest.y + 20);
      return this.openChest();
    };
    debugState.seed = p.seed;
  }

  /** Altar auf dem Gipfel, daneben der Höhleneingang der Schmuggler mit Truhe (L3). */
  private buildSummit(s: { tx: number; ty: number }): void {
    const w = this.world;
    // Belegte Kacheln: Dekor aus den Chunks rund um den Gipfel
    const used = new Set<string>();
    for (let cy = Math.floor((s.ty - 10) / CHUNK_TILES); cy <= Math.floor((s.ty + 10) / CHUNK_TILES); cy++)
      for (let cx = Math.floor((s.tx - 10) / CHUNK_TILES); cx <= Math.floor((s.tx + 10) / CHUNK_TILES); cx++)
        for (const d of w.chunk(cx, cy).decorations) used.add(`${d.tx},${d.ty}`);
    const free = (tx: number, ty: number) => w.isWalkable(tx, ty) && !used.has(`${tx},${ty}`);
    const area = (tx: number, ty: number, dx0: number, dx1: number, dy0: number, dy1: number) => {
      for (let y = ty + dy0; y <= ty + dy1; y++) for (let x = tx + dx0; x <= tx + dx1; x++) if (!free(x, y)) return false;
      return true;
    };
    // Altar: freie Kachel am Gipfel (die höchste in der Nähe)
    let altar = s;
    let best = -Infinity;
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const tx = s.tx + dx;
        const ty = s.ty + dy;
        if (!area(tx, ty, -1, 1, -1, 1)) continue;
        const h = tileHeight(w, tx, ty) - Math.hypot(dx, dy) * 0.05;
        if (h > best) ((best = h), (altar = { tx, ty }));
      }
    this.altar = altar;
    const ax = altar.tx * TILE_PX + TILE_PX / 2;
    const ay = altar.ty * TILE_PX + TILE_PX;
    this.add.image(ax, ay, ATLAS, 'shrine:0').setOrigin(0.5, 1).setDepth(ay);
    const blockers: Box[] = [{ x: ax - 14, y: ay - 12, w: 28, h: 12 }];
    // Höhle: 3 × 2 Kacheln Fels, 4–8 Kacheln vom Altar, davor eine freie Kachel für die Truhe
    let cave: { tx: number; ty: number } | null = null;
    for (let r = 4; r <= 9 && !cave; r++)
      for (let a = 0; a < 16 && !cave; a++) {
        const tx = Math.round(altar.tx + Math.cos((a / 16) * Math.PI * 2) * r);
        const ty = Math.round(altar.ty + Math.sin((a / 16) * Math.PI * 2) * r);
        if (area(tx, ty, -1, 1, -1, 0) && area(tx, ty, -1, 1, 1, 2)) cave = { tx, ty };
      }
    if (cave) {
      const cx = cave.tx * TILE_PX + TILE_PX / 2;
      const by = (cave.ty + 1) * TILE_PX;
      const g = this.add.graphics().setDepth(by);
      // Felshügel mit dunklem Bogen
      g.fillStyle(0x5c5a66, 1).fillRoundedRect(cx - 52, by - 58, 104, 58, { tl: 26, tr: 30, bl: 4, br: 4 });
      g.fillStyle(0x76747f, 1).fillRoundedRect(cx - 44, by - 56, 70, 18, 9);
      g.fillStyle(0xe8eef4, 1).fillRoundedRect(cx - 40, by - 60, 46, 8, 4).fillRoundedRect(cx + 8, by - 56, 30, 6, 3);
      g.fillStyle(0x0a0910, 1).fillRoundedRect(cx - 16, by - 34, 32, 34, { tl: 15, tr: 15, bl: 0, br: 0 });
      g.fillStyle(0x3a3844, 1).fillRect(cx - 18, by - 2, 36, 2);
      blockers.push({ x: cx - 52, y: by - 40, w: 104, h: 40 });
      const chx = cx + 26;
      const chy = by + TILE_PX - 4;
      const img = this.add.image(chx, chy, ATLAS, 'chest:0').setOrigin(0.5, 1).setDepth(chy);
      this.chest = { img, x: chx, y: chy, open: false };
      blockers.push({ x: chx - 10, y: chy - 8, w: 20, h: 8 });
    }
    this.chunks.extraBlockers.set('labor', blockers);
  }

  /** Truhe der Schmuggler öffnen, wenn der Held davorsteht. */
  private openChest(): boolean {
    const c = this.chest;
    if (!c || c.open || Math.hypot(c.x - this.player.x, c.y - this.player.y) > 48) return false;
    c.open = true;
    c.img.setFrame('chest:1');
    this.floatText(c.x, c.y - 10, 'Schmugglerversteck: 40 Splitter', '#ffd84a');
    return true;
  }

  setPlace(id: string): void {
    const p = PLACES.find((q) => q.id === id) ?? parsePlace(id);
    save('labor:ort', p.id === 'eigen' ? `${p.seed},${p.tx},${p.ty}` : p.id);
    // URL-Ort hätte sonst beim Neustart Vorrang
    const url = new URL(location.href);
    url.searchParams.delete('ort');
    history.replaceState(null, '', url);
    this.scene.restart();
  }

  tune(id: string, v: number): void {
    const t = [...LAB_TUNABLES, ...TUNABLES].find((x) => x.id === id);
    t?.set(v);
    this.saveTuning();
  }

  saveTuning(): void {
    save('labor:tuning', labSnapshot());
    save('arena:tuning', snapshot());
  }

  resetTuning(): void {
    applyLabSnapshot(LAB_DEFAULTS);
    this.saveTuning();
  }

  copyTuning(): string {
    const code = exportLabCode();
    void navigator.clipboard?.writeText(code).catch(() => {});
    return code;
  }

  /** Gegner vor dem Helden einsetzen (begehbare Kacheln). */
  spawn(sel: EnemyKind | 'wave'): void {
    const kinds = sel === 'wave' ? WAVE : [sel];
    const v = this.player.aim;
    const cx = Math.floor((this.player.x + v.x * 5 * TILE_PX) / TILE_PX);
    const cy = Math.floor((this.player.y - 4 + v.y * 5 * TILE_PX) / TILE_PX);
    let i = 0;
    for (let r = 0; r <= 4 && i < kinds.length; r++)
      for (let dy = -r; dy <= r && i < kinds.length; dy++)
        for (let dx = -r; dx <= r && i < kinds.length; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = cx + dx;
          const ty = cy + dy;
          if (!this.world.isWalkable(tx, ty) || this.chunks.biomeAt(tx, ty) === undefined) continue;
          this.enemies.add({ id: `l${this.counter++}`, kind: kinds[i++], tx, ty, level: this.level, color: Math.floor(Math.random() * 5), look: this.counter, elite: false });
        }
  }

  clearEnemies(): void {
    for (const e of [...this.enemies.enemies.values()]) {
      e.destroy();
      this.enemies.enemies.delete(e.spawn.id);
    }
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y - 30, text, { fontFamily: 'monospace', fontSize: '10px', color, stroke: '#0b0b14', strokeThickness: 3 }).setOrigin(0.5).setDepth(1_500_000);
    this.tweens.add({ targets: t, y: t.y - 18, alpha: 0, duration: 1400, onComplete: () => t.destroy() });
  }

  private inputDir(): { x: number; y: number } {
    const k = this.keys;
    return {
      x: (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0),
      y: (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0),
    };
  }

  /** Höhe an einer Pixelposition (Höheneinheiten). */
  heightAt(x: number, y: number): number {
    return tileHeight(this.world, Math.floor(x / TILE_PX), Math.floor((y - 1) / TILE_PX));
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    const cam = this.cameras.main;
    if (cam.zoom !== LAB_MOOD.zoom) cam.setZoom(LAB_MOOD.zoom);
    this.chunks.update(cam.worldView);

    // Laufen: geglättete Richtung, Steigung in Laufrichtung
    const target = this.inputDir();
    const tl = Math.hypot(target.x, target.y);
    if (tl > 1) ((target.x /= tl), (target.y /= tl));
    this.dir = smoothDir(this.dir, this.combat.locked ? { x: 0, y: 0 } : target, dt);
    const len = Math.hypot(this.dir.x, this.dir.y);
    const h0 = this.heightAt(this.player.x, this.player.y);
    let grade = 0;
    if (len > 0.05) grade = this.heightAt(this.player.x + (this.dir.x / len) * TILE_PX, this.player.y + (this.dir.y / len) * TILE_PX) - h0;
    const g = gradeFactor(grade);
    const env: MoveEnv = {
      blocked: (b) => this.chunks.blocked(b),
      terrainBlocked: (b) => this.chunks.terrainBlocked(b),
      speedAt: (x, y) => this.chunks.speedAt(x, y) * g,
    };
    const x0 = this.player.x;
    const y0 = this.player.y;
    this.player.baseSpeed = PLAYER_MOVE.speed * this.combat.moveFactor;
    // Bei geglätteter Richtung zählt die Länge als Tempo-Anteil (Actor teilt nur durch max(1, Länge))
    this.player.update(this.dir.x, this.dir.y, this.keys.SHIFT.isDown && !this.combat.blocking, dt, env);
    if (dt > 0) this.speed += (Math.hypot(this.player.x - x0, this.player.y - y0) / dt - this.speed) * 0.2;
    this.combat.update(dt);
    this.ctx.playerAlive = this.combat.alive;
    this.enemies.update(dt, this.ctx);

    const t = this.player.tile;
    const biome = this.chunks.biomeAt(t.tx, t.ty);
    this.mood.update(dt, LAB_MOOD.fog, h0, LAB_MOOD.snow, biome);

    const now = this.time.now;
    const s = this.combat.stats;
    const near = this.chest && !this.chest.open && Math.hypot(this.chest.x - this.player.x, this.chest.y - this.player.y) <= 48;
    if (this.hud && now - this.hudAt > 200) {
      this.hudAt = now;
      this.hud.textContent = [
        'BEWEGUNGSLABOR',
        `${this.place.name}`,
        `Kachel ${t.tx}, ${t.ty} · ${biome === undefined ? '…' : BIOMES[biome].name}`,
        `Höhe ${h0.toFixed(1)} · Steigung ${grade >= 0 ? '+' : ''}${grade.toFixed(2)}`,
        `Tempo ${Math.round(this.speed)} px/s (Grund ${PLAYER_MOVE.speed})`,
        `LP ${Math.ceil(s.hp)}/${s.maxHp} · Gegner ${this.enemies.enemies.size}`,
        this.altar ? `Gipfel (Altar): ${summitHint(t, this.altar)}` : '',
        near ? 'E: Truhe öffnen' : '',
        'WASD laufen · Umschalt rennen · J Hieb · K Zauber · L Block · Leertaste Ausweichen',
      ].filter(Boolean).join('\n');
    }
    debugState.player = { x: this.player.x, y: this.player.y, facing: this.player.facing, moving: this.player.moving, aim: { ...this.player.aim } };
    debugState.enemies = [...this.enemies.enemies.values()].map((e) => ({ id: e.spawn.id, kind: e.def.kind, x: e.x, y: e.y, hp: e.stats.hp, state: e.state }));
    debugState.attacks = this.combat.attacks;
    debugState.hp = s.hp;
    debugState.zoom = cam.zoom;
    debugState.biome = biome === undefined ? '' : BIOMES[biome].name;
    debugState.chunksLoaded = this.chunks.loadedCount;
    debugState.chunksPending = this.chunks.pendingCount;
    debugState.labor = {
      place: this.place.id,
      altar: this.altar ?? null,
      chest: this.chest ? { open: this.chest.open } : null,
      height: h0,
      grade,
      speed: this.speed,
      fog: this.mood.fogAlpha,
      snow: this.mood.snowRate,
    };
    if (!debugState.ready && this.chunks.loadedCount > 0 && this.chunks.pendingCount === 0) debugState.ready = true;
  }
}

/** „37 Kacheln Nordwest“ – Richtung und Entfernung zum Gipfel. */
function summitHint(from: { tx: number; ty: number }, to: { tx: number; ty: number }): string {
  const dx = to.tx - from.tx;
  const dy = to.ty - from.ty;
  const d = Math.round(Math.hypot(dx, dy));
  if (d < 3) return 'hier';
  const dirs = ['Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten', 'Norden', 'Nordosten'];
  return `${d} Kacheln ${dirs[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8]}`;
}
