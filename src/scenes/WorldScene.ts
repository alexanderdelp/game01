import Phaser from 'phaser';
import { buildCharacter, preloadCharacter } from '../character/CharacterFactory';
import { DEFAULT_APPEARANCE } from '../character/lpc';
import { debugState } from '../debug';
import { Actor } from '../entities/Actor';
import { BANDIT_LOOKS, EnemyManager, type CombatCtx } from '../entities/Enemy';
import { NpcManager, type Npc } from '../entities/NpcManager';
import { HeroController } from '../entities/HeroController';
import { PlayerCombat } from '../entities/PlayerCombat';
import { touchInput } from '../game/input';
import { load, save } from '../game/save';
import { ChunkManager } from '../render/ChunkManager';
import { TILE_PX } from '../render/chunkPixels';
import { createCreatureAtlas, createDecorAtlas } from '../render/textures';
import { enemiesForChunk } from '../combat/enemies';
import { generateItem, type Slot } from '../rpg/items';
import { addItem } from '../rpg/progression';
import { CHUNK_TILES, WORLD_TILES, WorldGen } from '../world/WorldGen';

const ZOOMS = [1, 2, 3, 4];

interface SavedPlayer {
  x: number;
  y: number;
}

/** Die Spielwelt: Chunks, Dekorationen und die Spielfigur. */
export class WorldScene extends Phaser.Scene {
  world!: WorldGen;
  chunks!: ChunkManager;
  player!: Actor;
  npcs!: NpcManager;
  enemies!: EnemyManager;
  combat!: PlayerCombat;
  hero!: HeroController;
  private combatCtx!: CombatCtx;
  /** NPC, mit dem gerade gesprochen wird. */
  talkingTo: Npc | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private zoomIndex = 1;
  private saveTimer = 0;

  constructor() {
    super('world');
  }

  init(data: { seed: string }): void {
    this.world = new WorldGen(data.seed);
  }

  preload(): void {
    preloadCharacter(this, DEFAULT_APPEARANCE);
    preloadCharacter(this, { ...DEFAULT_APPEARANCE, torso: 'leather' });
    for (const a of NpcManager.appearances(this.world)) preloadCharacter(this, a);
    for (const a of BANDIT_LOOKS) preloadCharacter(this, a);
  }

  create(): void {
    createDecorAtlas(this);
    createCreatureAtlas(this);
    this.chunks = new ChunkManager(this, this.world.seedName);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.chunks.destroy());

    this.npcs = new NpcManager(this, this.world, this.chunks);
    const spawn = this.world.findSpawn();
    this.enemies = new EnemyManager(this, this.world, this.chunks, spawn);
    const saved = load<SavedPlayer>(this.saveKey);
    const startX = saved?.x ?? spawn.tx * TILE_PX + TILE_PX / 2;
    const startY = saved?.y ?? spawn.ty * TILE_PX + TILE_PX - 1;
    this.player = new Actor(this, startX, startY, buildCharacter(this, DEFAULT_APPEARANCE));

    // Startzoom so, dass mindestens ~20 Kacheln in der Breite sichtbar sind (Handy: 1, Desktop: 2).
    this.zoomIndex = Phaser.Math.Clamp(Math.floor(this.scale.width / 640), 1, ZOOMS.length) - 1;
    const respawn = () => this.player.setPosition(spawn.tx * TILE_PX + TILE_PX / 2, spawn.ty * TILE_PX + TILE_PX - 1);
    this.combat = new PlayerCombat(this, this.player, this.enemies, this.chunks, respawn);
    this.hero = new HeroController(this, this.world.seedName, this.player, this.combat);
    this.events.on('defeated', (e: Parameters<HeroController['onDefeated']>[0]) => this.hero.onDefeated(e));
    this.combatCtx = {
      chunks: this.chunks,
      world: this.world,
      player: this.player,
      playerAlive: true,
      hurtPlayer: (a, x, y) => this.combat.hurt(a, x, y),
      fireBolt: (x, y, vx, vy, d) => this.enemies.fireBolt(x, y, vx, vy, d),
    };

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x172a5c);
    cam.setBounds(0, 0, WORLD_TILES * TILE_PX, WORLD_TILES * TILE_PX);
    cam.setRoundPixels(true);
    cam.setZoom(ZOOMS[this.zoomIndex]);
    cam.startFollow(this.player.sprite, true, 0.15, 0.15, 0, 20);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-PLUS', () => this.zoom(1));
    kb.on('keydown-NUMPAD_ADD', () => this.zoom(1));
    kb.on('keydown-MINUS', () => this.zoom(-1));
    kb.on('keydown-NUMPAD_SUBTRACT', () => this.zoom(-1));
    kb.on('keydown-E', () => this.interact());
    kb.on('keydown-SPACE', () => this.attack());
    kb.on('keydown-J', () => this.attack());
    kb.on('keydown-Q', () => this.hero.drink());
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoom(dy < 0 ? 1 : -1));

    const persist = () => {
      save(this.saveKey, { x: Math.round(this.player.x), y: Math.round(this.player.y) } satisfies SavedPlayer);
      this.hero.persist();
    };
    window.addEventListener('pagehide', persist);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('pagehide', persist));

    this.scene.launch('ui', { seed: this.world.seedName });
    debugState.seed = this.world.seedName;
    debugState.spawn = spawn;
    debugState.teleport = (tx: number, ty: number) => this.player.setPosition(tx * TILE_PX + TILE_PX / 2, ty * TILE_PX + TILE_PX - 1);
    debugState.findEnemy = (kind?: string) => {
      const c = { x: Math.floor(spawn.tx / CHUNK_TILES), y: Math.floor(spawn.ty / CHUNK_TILES) };
      for (let r = 1; r < 30; r++) {
        for (let cy = c.y - r; cy <= c.y + r; cy++) {
          for (let cx = c.x - r; cx <= c.x + r; cx++) {
            if (Math.max(Math.abs(cx - c.x), Math.abs(cy - c.y)) !== r) continue;
            const e = enemiesForChunk(this.world, cx, cy, spawn).find((s) => !kind || s.kind === kind);
            if (e) return { tx: e.tx, ty: e.ty, kind: e.kind };
          }
        }
      }
      return null;
    };
    debugState.giveItem = (slot: string, base?: string) => {
      const it = generateItem(3, Math.random, slot as Slot);
      if (base) it.base = base;
      addItem(this.hero.hero, it);
      this.events.emit('hero-changed');
      return it.id;
    };
    debugState.damagePlayer = (n: number) => this.combat.hurt(n, this.player.x + 1, this.player.y, true);
    debugState.findShore = () => {
      // Nach rechts laufen, bis Wasser kommt: Kachel davor ist begehbar, ihr rechter Nachbar Wasser.
      const { tx, ty } = this.player.tile;
      for (let k = 0; k < 40; k++) {
        const y = ty + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 7;
        for (let x = tx; x < WORLD_TILES; x++) {
          if (this.world.biomeAt(x + 1, y) > 1) continue;
          if (this.world.isWalkable(x, y) && this.world.isWalkable(x, y + 1) && this.world.isWalkable(x - 1, y)) return { tx: x, ty: y };
          break;
        }
      }
      return null;
    };
  }

  /** Spricht den nächsten NPC an bzw. blättert/schließt den Dialog. */
  interact(): void {
    if (this.talkingTo) return this.endTalk();
    const npc = this.npcs.nearest(this.player);
    if (!npc) return;
    npc.talking = true;
    this.talkingTo = npc;
    this.player.face(npc.actor.x, npc.actor.y);
    const line = npc.role.lines[npc.talks % npc.role.lines.length];
    npc.talks++;
    this.events.emit('talk', { name: npc.spawn.name, role: npc.role.name, text: line });
    debugState.dialog = { name: npc.spawn.name, role: npc.role.name, text: line };
  }

  attack(): void {
    if (this.talkingTo) return this.endTalk();
    this.combat.attack();
  }

  endTalk(): void {
    if (this.talkingTo) this.talkingTo.talking = false;
    this.talkingTo = null;
    this.events.emit('talk', null);
    debugState.dialog = null;
  }

  private get saveKey(): string {
    return `player:${this.world.seedName}`;
  }

  zoom(dir: number): void {
    this.zoomIndex = Phaser.Math.Clamp(this.zoomIndex + dir, 0, ZOOMS.length - 1);
    this.cameras.main.setZoom(ZOOMS[this.zoomIndex]);
  }

  /** Mittelpunkt des Interesses (die Figur) in Kachelkoordinaten. */
  get focusTile(): { tx: number; ty: number } {
    return this.player.tile;
  }

  update(_time: number, delta: number): void {
    const k = this.keys;
    let dx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let dy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (!dx && !dy) {
      dx = touchInput.x;
      dy = touchInput.y;
    }
    const dt = Math.min(delta, 50) / 1000;
    this.chunks.update(this.cameras.main.worldView);
    if (this.combat.locked) this.player.update(0, 0, false, dt, this.chunks);
    else this.player.update(dx, dy, k.SHIFT.isDown, dt, this.chunks);
    this.combat.update(dt);
    this.hero.update(dt);
    this.npcs.update(dt, this.player);
    this.combatCtx.playerAlive = this.combat.alive;
    this.enemies.update(dt, this.combatCtx);
    if (this.talkingTo && Math.hypot(this.talkingTo.actor.x - this.player.x, this.talkingTo.actor.y - this.player.y) > 90) this.endTalk();

    this.saveTimer += delta;
    if (this.saveTimer > 2000) {
      this.saveTimer = 0;
      save(this.saveKey, { x: Math.round(this.player.x), y: Math.round(this.player.y) } satisfies SavedPlayer);
    }

    const f = this.focusTile;
    debugState.focus = f;
    debugState.player = { x: this.player.x, y: this.player.y, facing: this.player.facing, moving: this.player.moving };
    debugState.zoom = this.cameras.main.zoom;
    debugState.chunksLoaded = this.chunks.loadedCount;
    debugState.chunksPending = this.chunks.pendingCount;
    debugState.npcs = [...this.npcs.npcs.values()].map((n) => ({ id: n.spawn.id, x: n.actor.x, y: n.actor.y, role: n.spawn.role, name: n.spawn.name }));
    debugState.hp = this.combat.stats.hp;
    debugState.attacks = this.combat.attacks;
    debugState.hero = this.hero.hero;
    debugState.pickups = this.hero.pickupCount;
    debugState.pickupPos = this.hero.pickupPositions();
    debugState.maxHp = this.combat.stats.maxHp;
    debugState.alive = this.combat.alive;
    debugState.enemies = [...this.enemies.enemies.values()].map((e) => ({ id: e.spawn.id, kind: e.def.kind, x: e.x, y: e.y, hp: e.stats.hp, state: e.state }));
    debugState.ready = this.chunks.loadedCount > 0 && this.chunks.pendingCount === 0;
  }
}
