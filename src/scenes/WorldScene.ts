import Phaser from 'phaser';
import { buildCharacter, preloadCharacter, preloadWardrobe } from '../character/CharacterFactory';
import { DEFAULT_APPEARANCE, type Appearance } from '../character/lpc';
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
import type { Item, Slot } from '../rpg/items';
import { dress } from '../character/outfit';
import { isReady, onPosition, progressText } from '../quests/quests';
import { FACTIONS } from '../world/meta';
import { decodeConfig } from '../history/config';
import { eventText, plainLinker } from '../history/narrate';
import { LocalWorldStore, WorldState, isDefeated } from '../state/worldState';
import { TownDecor } from '../render/TownDecor';
import { LiveWorld, worldNow } from '../sim/LiveWorld';
import { playerId } from '../game/identity';
import { PAD_BUTTONS, padDirection } from '../game/gamepad';
import { effectiveZoom } from '../game/view';
import { Markers } from '../render/Markers';
import { SyncClient, syncUrlFromLocation } from '../state/sync';
import { LiveSession } from '../net/live';
import { RemotePlayers } from '../entities/RemotePlayers';
import { TICK_MS, newsBetween, type News } from '../sim/simulation';

import { WORLD_TILES, WORLD_VERSION, WorldGen } from '../world/WorldGen';
import type { ExploredMap } from '../world/fog';
import { WorldNet, foreignNews } from './world/WorldNet';
import { WorldSight } from './world/WorldSight';
import { WorldTalk } from './world/WorldTalk';
import { installDebugHooks } from './world/worldDebug';

const ZOOMS = [1, 2, 3, 4];
/** Fliegen im Spielleiter-Modus (M29): nichts blockiert, dreifaches Tempo. */
const GM_FLIGHT = { blocked: () => false, speedAt: () => 3 };

interface SavedPlayer {
  x: number;
  y: number;
  /** Version der Weltgenerierung; Positionen aus älteren Welten gelten nicht mehr. */
  v?: number;
}

/** Die Spielwelt: Chunks, Dekorationen und die Spielfigur. */
export class WorldScene extends Phaser.Scene {
  world!: WorldGen;
  chunks!: ChunkManager;
  player!: Actor;
  npcs!: NpcManager;
  enemies!: EnemyManager;
  combat!: PlayerCombat;
  state!: WorldState;
  towns!: TownDecor;
  live!: LiveWorld;
  signs!: Markers;
  /** Sicht und Fog of War (M20, M24) */
  sight!: WorldSight;
  /** Gespräche, Geheimnisse, Quest-Markierungen */
  talk!: WorldTalk;
  /** Mitspieler und geteilte Welt (M11, M12) */
  net!: WorldNet;
  sync?: SyncClient;
  live2?: LiveSession;
  remote!: RemotePlayers;
  /** Eigene Chat-Sprechblase */
  myChat?: { text: string; until: number };
  private liveTimer = 0;
  hero!: HeroController;
  private combatCtx!: CombatCtx;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private zoomIndex = 1;
  private saveTimer = 0;

  constructor() {
    super('world');
  }

  init(data: { seed: string }): void {
    // Prototyp Vorgeschichte: `?vorgeschichte=1&hc=…` erzeugt die Welt aus einer simulierten Geschichte (Konfiguration)
    const params = new URLSearchParams(location.search);
    const history = params.get('vorgeschichte') === '1' ? { config: decodeConfig(params.get('hc')) } : undefined;
    this.world = new WorldGen(data.seed, history ? { history } : {});
  }

  preload(): void {
    const look = { ...DEFAULT_APPEARANCE, ...load<{ appearance?: Appearance }>(`hero:${this.world.seedName}`)?.appearance };
    preloadWardrobe(this, look);
    for (const a of NpcManager.appearances(this.world)) preloadCharacter(this, a);
    for (const a of BANDIT_LOOKS) preloadCharacter(this, a);
  }

  create(): void {
    debugState.scene = 'world';
    // Zuletzt gespielte Welten für den Titelbildschirm
    const recent = (load<string[]>('recent') ?? []).filter((s) => s !== this.world.seedName);
    save('recent', [this.world.seedName, ...recent].slice(0, 6));
    createDecorAtlas(this);
    createCreatureAtlas(this);
    this.chunks = new ChunkManager(this, this.world.seedName, this.world.opts);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.chunks.destroy());

    this.state = new WorldState(this.world.seedName, new LocalWorldStore(), Date.now(), playerId());
    this.sight = new WorldSight(this, this.world);
    this.talk = new WorldTalk(this);
    this.net = new WorldNet(this);
    // Bekannte Orte (Wegsteine) sind auch auf der Karte bekannt, z. B. aus älteren Spielständen
    for (const t of this.world.meta.settlements) if (this.state.d.discovered.has(`town:${t.id}`)) this.fog.reveal(t.tx, t.ty, 24);
    this.npcs = new NpcManager(this, this.world, this.chunks);
    const spawn = this.world.findSpawn();
    this.enemies = new EnemyManager(this, this.world.seed, { world: this.world, chunks: this.chunks, spawnTile: spawn });
    this.enemies.isDefeated = (id) => isDefeated(this.state.d, id, Date.now());
    this.enemies.onKilled = (e) => this.state.record({ t: Date.now(), by: this.heroName, type: 'kill', id: e.spawn.id, realm: this.world.meta.realmAt(e.spawn.tx, e.spawn.ty).id });
    // Gespeicherte Position nur, wenn sie aus derselben Weltversion stammt und begehbar ist
    let saved = load<SavedPlayer>(this.saveKey);
    if (saved && (saved.v !== WORLD_VERSION || !this.world.isWalkable(Math.floor(saved.x / TILE_PX), Math.floor((saved.y - 1) / TILE_PX)))) saved = null;
    const startX = saved?.x ?? spawn.tx * TILE_PX + TILE_PX / 2;
    const startY = saved?.y ?? spawn.ty * TILE_PX + TILE_PX - 1;
    const savedHero = load<{ appearance?: Appearance; equipped?: Partial<Record<Slot, Item>> }>(`hero:${this.world.seedName}`);
    this.player = new Actor(this, startX, startY, buildCharacter(this, dress({ ...DEFAULT_APPEARANCE, ...savedHero?.appearance }, savedHero?.equipped ?? {})));

    // Startzoom: so weit draußen, wie der feste Sichtausschnitt erlaubt (M27, siehe applyZoom)
    this.zoomIndex = 0;
    const respawn = () => {
      const t = this.player.tile;
      this.state.record({ t: Date.now(), by: this.heroName, type: 'death', tx: t.tx, ty: t.ty });
      this.signs.refresh();
      this.player.setPosition(spawn.tx * TILE_PX + TILE_PX / 2, spawn.ty * TILE_PX + TILE_PX - 1);
    };
    this.combat = new PlayerCombat(this, this.player, this.enemies, this.chunks, respawn);
    this.hero = new HeroController(this, this.world.seedName, this.player, this.combat);
    // Alte Truhen-Daten aus M8 (im Helden) in den Weltzustand übernehmen
    for (const id of this.hero.hero.opened ?? []) if (!this.state.d.chests.has(id)) this.state.record({ t: Date.now(), by: this.heroName, type: 'chest', id });
    delete this.hero.hero.opened;
    this.chunks.frameHook = (d) =>
      (d.kind === 'chest' || d.kind === 'ruinchest') && this.state.d.chests.has(`${d.kind}:${d.tx},${d.ty}`) ? `${d.kind}:1` : undefined;
    this.live = new LiveWorld(this.world, this.chunks, this.npcs, this.state);
    this.enemies.invasion = this.live.invasion;
    this.towns = new TownDecor(this, this.world, this.chunks, this.state, () => this.heroName, (id) => this.live.drift(id));
    this.signs = new Markers(this, this.chunks, this.state);
    void this.net.importFromHash();
    const syncUrl = syncUrlFromLocation();
    if (syncUrl) {
      this.sync = new SyncClient(syncUrl, this.state, (fresh) => this.net.onForeign(fresh, false));
      this.sync.start();
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.sync?.stop());
      // Live-Zusammenspiel über denselben Server (M12)
      this.live2 = new LiveSession(syncUrl, this.world.seedName, (m) => this.net.onLive(m));
      this.live2.start();
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.live2?.stop());
      const onAttack = () => this.live2?.send({ type: 'attack', pid: this.state.pid });
      const onHit = (h: { enemy: string; dmg: number; x: number; y: number }) => this.live2?.send({ type: 'hit', pid: this.state.pid, ...h });
      this.events.on('player-attack', onAttack);
      this.events.on('enemy-hit', onHit);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.events.off('player-attack', onAttack);
        this.events.off('enemy-hit', onHit);
      });
    }
    const onDefeated = (e: Parameters<HeroController['onDefeated']>[0]) => this.hero.onDefeated(e);
    this.events.on('defeated', onDefeated);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off('defeated', onDefeated));
    const chunks = this.chunks;
    const world = this.world;
    this.combatCtx = {
      terrain: {
        biomeAt: (tx, ty) => chunks.biomeAt(tx, ty),
        blocked: (b) => chunks.blocked(b),
        terrainBlocked: (b) => chunks.terrainBlocked(b),
        speedAt: (x, y) => chunks.speedAt(x, y),
        isWalkable: (tx, ty) => world.isWalkable(tx, ty),
      },
      player: this.player,
      playerAlive: true,
      hurtPlayer: (a, x, y) => {
        if (!this.gm) this.combat.hurt(a, x, y);
      },
      fireBolt: (x, y, vx, vy, d) => this.enemies.fireBolt(x, y, vx, vy, d),
      others: [],
    };
    this.remote = new RemotePlayers(this, this.state.pid);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.remote.destroy());

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x172a5c);
    cam.setBounds(0, 0, WORLD_TILES * TILE_PX, WORLD_TILES * TILE_PX);
    cam.setRoundPixels(true);
    this.applyZoom();
    // Fenstergröße/Browser-Zoom ändern den Ausschnitt nicht: Zoom nachführen (M27)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this));
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
    kb.on('keydown-K', () => this.cast());
    kb.on('keydown-Q', () => this.hero.drink());
    kb.on('keydown-T', () => this.placeSign());
    // Gamepad: Tasten lösen Aktionen aus, Stick/Steuerkreuz bewegt (siehe update)
    this.input.gamepad?.on('down', (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      const ui = this.scene.get('ui') as unknown as { toggleMenu(): void; toggleMapPublic(): void };
      switch (PAD_BUTTONS[button.index]) {
        case 'attack': return this.attack();
        case 'interact': return this.interact();
        case 'potion': return this.hero.drink();
        case 'spell': return this.cast();
        case 'menu': return ui.toggleMenu();
        case 'map': return ui.toggleMapPublic();
        case 'zoomIn': return this.zoom(1);
        case 'zoomOut': return this.zoom(-1);
      }
    });
    kb.on('keydown-ENTER', () => this.chat());
    kb.on('keydown-F2', (e: KeyboardEvent) => {
      e.preventDefault();
      this.setGm(!this.gm);
    });
    kb.on('keydown-ONE', () => this.talk.pendingActions.length > 0 && this.choose(0));
    kb.on('keydown-TWO', () => this.talk.pendingActions.length > 1 && this.choose(1));
    kb.on('keydown-THREE', () => this.talk.pendingActions.length > 2 && this.choose(2));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoom(dy < 0 ? 1 : -1));

    const persist = () => {
      this.sight.save();
      save(this.saveKey, { x: Math.round(this.player.x), y: Math.round(this.player.y), v: WORLD_VERSION } satisfies SavedPlayer);
      this.hero.persist();
      this.state.flush();
      save(`seen:${this.world.seedName}`, worldNow());
    };
    window.addEventListener('pagehide', persist);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('pagehide', persist));

    this.scene.launch('ui', { seed: this.world.seedName });

    // Was ist passiert, während niemand gespielt hat?
    const now = worldNow();
    const lastSeen = load<number>(`seen:${this.world.seedName}`);
    this.news = newsBetween(this.world.meta, this.world.seed, now - 24 * TICK_MS, now, this.live.caravans);
    debugState.news = this.news.map((n) => n.text);
    const foreign = lastSeen ? foreignNews(this.state.events.filter((e) => e.pid !== this.state.pid && e.t > lastSeen), this.world.meta.settlements, this.world.meta.realms) : [];
    if (foreign.length) this.news.push(...foreign);
    if (lastSeen && (now - lastSeen > TICK_MS || foreign.length)) {
      const missed = [...newsBetween(this.world.meta, this.world.seed, lastSeen, now, this.live.caravans), ...foreign];
      if (missed.length) this.time.delayedCall(800, () => this.events.emit('news-summary', { hours: Math.round((now - lastSeen) / TICK_MS), news: missed }));
    }
    save(`seen:${this.world.seedName}`, now);
    installDebugHooks(this, spawn);
    // Aus dem Legenden-Modus: `?gm=1&at=tx,ty` öffnet den Spielleiter-Modus an einem Ort
    const at = new URLSearchParams(location.search).get('at')?.split(',').map(Number);
    if (this.gmAllowed && at?.length === 2 && at.every(Number.isFinite)) {
      this.time.delayedCall(400, () => {
        this.setGm(true);
        this.gmTeleport(at[0], at[1] + 4);
      });
    }
  }

  /** Zurück zum Titelbildschirm (alles wird gespeichert). */
  toTitle(): void {
    save(this.saveKey, { x: Math.round(this.player.x), y: Math.round(this.player.y), v: WORLD_VERSION } satisfies SavedPlayer);
    this.hero.persist();
    this.state.flush();
    this.scene.stop('ui');
    this.scene.start('title');
  }

  /** Schnellreise zu einem entdeckten Ort (Wegstein). */
  travel(townId: number): boolean {
    const s = this.world.meta.settlements[townId];
    if (!s || !this.state.d.discovered.has(`town:${townId}`)) return false;
    this.endTalk();
    const cam = this.cameras.main;
    cam.fadeOut(250, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.player.setPosition(s.tx * TILE_PX + TILE_PX / 2, (s.ty + 2) * TILE_PX + TILE_PX - 1);
      cam.fadeIn(400, 0, 0, 0);
    });
    return true;
  }

  /** Öffnet den Erschaffungsbildschirm im Barbier-Modus (Fortschritt bleibt). */
  editAppearance(cost: number): void {
    save(this.saveKey, { x: Math.round(this.player.x), y: Math.round(this.player.y), v: WORLD_VERSION } satisfies SavedPlayer);
    this.hero.persist();
    this.scene.stop('ui');
    this.scene.start('create', { seed: this.world.seedName, edit: true, cost });
  }

  get heroName(): string {
    return this.hero?.hero.name ?? 'Held';
  }

  // Öffentliche Schnittstelle für UI-Szene und Tests (Umsetzung in ./world/*)
  get fog(): ExploredMap {
    return this.sight.fog;
  }
  get talkingTo(): Npc | null {
    return this.talk.talkingTo;
  }
  get dialogOpen(): boolean {
    return this.talk.dialogOpen;
  }
  get markers(): Map<string, '!' | '?'> {
    return this.talk.markers;
  }
  interact(): void {
    this.talk.interact();
  }
  choose(i: number): void {
    this.talk.choose(i);
  }
  endTalk(): void {
    this.talk.endTalk();
  }
  myPledge(): number | null {
    return this.talk.myPledge();
  }
  pledge(realmId: number): void {
    this.talk.pledge(realmId);
  }
  rankAt(tx: number, ty: number) {
    return this.talk.rankAt(tx, ty);
  }
  chat(text?: string): void {
    this.net.chat(text);
  }
  placeSign(text?: string): void {
    this.net.placeSign(text);
  }
  shareLink(): Promise<string> {
    return this.net.shareLink();
  }
  importFile(file: File): Promise<number> {
    return this.net.importFile(file);
  }
  exportFile(): void {
    this.net.exportFile();
  }
  players(): { pid: string; name: string; events: number }[] {
    return this.net.players();
  }

  news: News[] = [];
  private lastRealm = -1;
  private lastTown = -1;

  private markerTimer = 0;
  /** Spielleiter-Modus (M29): nur mit `?gm=1` erreichbar. */
  readonly gmAllowed = new URLSearchParams(location.search).has('gm');
  gm = false;

  cast(): void {
    if (this.dialogOpen) return this.endTalk();
    this.combat.cast();
  }

  attack(): void {
    if (this.dialogOpen) return this.endTalk();
    this.combat.attack();
  }

  get saveKey(): string {
    // Welten mit Vorgeschichte haben andere Orte: eigene Position speichern
    return `player:${this.world.seedName}${this.world.history ? ':vorgeschichte' : ''}`;
  }

  /** Spielleiter-Modus an/aus (M29): fliegen, unverwundbar, keine Spuren in Fog/Weltzustand. */
  setGm(on: boolean): void {
    if (!this.gmAllowed || on === this.gm) return;
    this.gm = on;
    this.sight.gm = on;
    if (!on) {
      // Nicht über Wasser oder in einer Klippe landen: nächste begehbare Kachel suchen
      const t = this.player.tile;
      let best: { tx: number; ty: number } | null = null;
      for (let r = 0; r < 64 && !best; r++)
        for (let dy = -r; dy <= r && !best; dy++)
          for (let dx = -r; dx <= r; dx++)
            if (Math.max(Math.abs(dx), Math.abs(dy)) === r && this.world.isWalkable(t.tx + dx, t.ty + dy)) {
              best = { tx: t.tx + dx, ty: t.ty + dy };
              break;
            }
      if (best) this.player.setPosition(best.tx * TILE_PX + TILE_PX / 2, best.ty * TILE_PX + TILE_PX - 1);
    }
    this.events.emit('gm-changed', on);
    this.events.emit('banner', { title: on ? 'Spielleiter-Modus' : 'Spielleiter-Modus aus', sub: on ? 'Fliegen · unverwundbar · Karte (M): Klick teleportiert · F2: aus' : 'Zurück auf festem Boden' });
  }

  /** Teleport an eine beliebige Kachel – nur im Spielleiter-Modus (M29). */
  gmTeleport(tx: number, ty: number): boolean {
    if (!this.gm) return false;
    this.endTalk();
    this.player.setPosition(Phaser.Math.Clamp(tx, 0, WORLD_TILES - 1) * TILE_PX + TILE_PX / 2, Phaser.Math.Clamp(ty, 0, WORLD_TILES - 1) * TILE_PX + TILE_PX - 1);
    return true;
  }

  zoom(dir: number): void {
    // Bei offener Karte zoomt die Karte (UI-Szene), nicht die Welt
    if (debugState.mapOpen) return;
    // Stufen, die der feste Ausschnitt ohnehin nicht erlaubt, überspringen
    const min = effectiveZoom(1, this.scale.width, this.scale.height, TILE_PX);
    const lowest = Math.max(0, ZOOMS.findIndex((z) => z >= min));
    this.zoomIndex = Phaser.Math.Clamp(Math.max(this.zoomIndex, lowest) + dir, lowest, Math.max(lowest, ZOOMS.length - 1));
    this.applyZoom();
  }

  /** Gewählte Zoomstufe anwenden, aber nie mehr als den festen Sichtausschnitt zeigen (M27). */
  private applyZoom(): void {
    this.cameras.main.setZoom(effectiveZoom(ZOOMS[this.zoomIndex], this.scale.width, this.scale.height, TILE_PX));
  }

  /** Mittelpunkt des Interesses (die Figur) in Kachelkoordinaten. */

  get focusTile(): { tx: number; ty: number } {
    return this.player.tile;
  }

  update(_time: number, delta: number): void {
    const k = this.keys;
    let dx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let dy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    let sprint = k.SHIFT.isDown;
    const pad = this.input.gamepad?.total ? this.input.gamepad.pad1 : undefined;
    if (!dx && !dy && pad) {
      const d = padDirection(pad.leftStick.x, pad.leftStick.y, { left: pad.left, right: pad.right, up: pad.up, down: pad.down });
      dx = d.x;
      dy = d.y;
      sprint = sprint || pad.B;
    }
    if (!dx && !dy) {
      dx = touchInput.x;
      dy = touchInput.y;
    }
    const dt = Math.min(delta, 50) / 1000;
    this.chunks.update(this.cameras.main.worldView);
    if (this.gm) this.player.update(dx, dy, sprint, dt, GM_FLIGHT);
    else if (this.combat.locked) this.player.update(0, 0, false, dt, this.chunks);
    else this.player.update(dx, dy, sprint, dt, this.chunks);
    this.combat.update(dt);
    this.hero.update(dt);
    this.markerTimer -= dt;
    // Im Spielleiter-Modus keine Entdeckungen und Quest-Fortschritte durch Orte (M29)
    if (this.markerTimer <= 0 && !this.gm) {
      this.markerTimer = 0.5;
      const t = this.player.tile;
      const visited = onPosition(this.hero.quests, t.tx, t.ty);
      if (visited) {
        this.events.emit('float', { x: this.player.x, y: this.player.y - 50, text: `Gefunden: ${progressText(visited)}`, color: '#ffd84a' });
        this.events.emit('quests-changed');
      }
      this.talk.updateMarkers();
      // Reichs- und Ortswechsel ankündigen
      const realm = this.world.meta.realmAt(t.tx, t.ty);
      const town = this.world.meta.settlementNear(t.tx, t.ty, 2);
      if (realm.id !== this.lastRealm && this.world.biomeAt(t.tx, t.ty) > 1) {
        const inv = this.live.invasion?.realm === realm.id ? this.live.invasion : null;
        const invText = inv ? `⚠ Invasion: ${({ slime: 'Schleime', wisp: 'Irrlichter', drone: 'Drohnen', bandit: 'Räuberbanden' } as const)[inv.kind]}!` : FACTIONS[realm.faction].motto;
        if (this.lastRealm !== -1 || inv) this.events.emit('banner', { title: `${FACTIONS[realm.faction].name} ${realm.name}`, sub: invText });
        this.lastRealm = realm.id;
      }
      if ((town?.id ?? -1) !== this.lastTown) {
        if (town && !this.state.d.discovered.has(`town:${town.id}`)) {
          this.state.record({ t: Date.now(), by: this.heroName, type: 'discover', id: `town:${town.id}` });
          this.events.emit('float', { x: this.player.x, y: this.player.y - 60, text: 'Wegstein aktiviert', color: '#2fe0d8' });
        }
        if (town) this.events.emit('banner', { title: town.name, sub: `${town.capital ? 'Hauptstadt' : 'Dorf'} im Reich ${realm.name} · sicherer Ort` });
        this.lastTown = town?.id ?? -1;
      }
      const ruin = this.world.meta.ruinNear(t.tx, t.ty, 10);
      if (ruin && !this.state.d.discovered.has(`ruin:${ruin.id}`)) {
        this.state.record({ t: Date.now(), by: this.heroName, type: 'discover', id: `ruin:${ruin.id}` });
        const h = this.world.history;
        const site = h && ruin.site !== undefined ? h.sites[ruin.site] : undefined;
        if (h && site) this.events.emit('banner', { title: site.kind === 'crater' ? site.name : `Ruinen von ${site.name}`, sub: site.fall !== undefined ? eventText(h, h.events[site.fall], plainLinker(h)) : 'Ein Wächter hütet hier einen Schatz …' });
        else this.events.emit('banner', { title: 'Eine alte Ruine', sub: 'Ein Wächter hütet hier einen Schatz …' });
      }
      // Fundorte der Vorgeschichte ankündigen (Grabmal, Schlachtfeld, Hort)
      const hist = this.world.history && this.world.meta.historicNear(t.tx, t.ty, 8);
      if (hist && hist.site !== undefined && !this.state.d.discovered.has(`hist:${hist.site}`)) {
        this.state.record({ t: Date.now(), by: this.heroName, type: 'discover', id: `hist:${hist.site}` });
        this.events.emit('banner', { title: this.world.history!.sites[hist.site].name, sub: hist.kind === 'lair' ? 'Knochen ringsum … hier haust etwas.' : 'Eine Inschrift erzählt von alten Zeiten (E: lesen)' });
      }
      debugState.realm = realm.name;
      debugState.town = town?.name ?? '';
    }
    this.live.update(dt, this.player);
    this.remote.update(dt);
    this.combatCtx.others = this.remote.positions();
    if (this.live2) {
      this.liveTimer -= dt;
      if (this.liveTimer <= 0) {
        this.liveTimer = 0.1;
        this.live2.sendState({
          type: 'state', pid: this.state.pid, name: this.heroName, x: Math.round(this.player.x), y: Math.round(this.player.y),
          facing: this.player.facing, moving: this.player.moving, hp: Math.round(this.combat.stats.hp), maxHp: this.combat.stats.maxHp,
          look: this.hero.appearance(), t: Date.now(),
        });
      }
    }
    if (this.enemies.invasion !== this.live.invasion) this.enemies.invasion = this.live.invasion;
    const waiting = new Set(this.hero.quests.active.filter((q) => isReady(q) && q.objective.type !== 'deliver').map((q) => q.giverId));
    for (const n of this.npcs.npcs.values()) n.hold = waiting.has(n.spawn.id);
    this.npcs.update(dt, this.player);
    this.combatCtx.playerAlive = this.combat.alive;
    this.enemies.update(dt, this.combatCtx);
    if (this.talkingTo && Math.hypot(this.talkingTo.actor.x - this.player.x, this.talkingTo.actor.y - this.player.y) > 90) this.endTalk();
    if (this.dialogOpen && !this.talkingTo && this.player.moving) this.endTalk();

    // Fog of War und Sicht (M20, M24)
    this.sight.update();

    this.saveTimer += delta;
    if (this.saveTimer > 2000) {
      this.saveTimer = 0;
      this.sight.save();
      this.state.flush();
      save(`seen:${this.world.seedName}`, worldNow());
      if (!this.gm) save(this.saveKey, { x: Math.round(this.player.x), y: Math.round(this.player.y), v: WORLD_VERSION } satisfies SavedPlayer);
    }

    const f = this.focusTile;
    debugState.focus = f;
    debugState.gm = this.gm;
    debugState.player = { x: this.player.x, y: this.player.y, facing: this.player.facing, moving: this.player.moving };
    debugState.zoom = this.cameras.main.zoom;
    debugState.chunksLoaded = this.chunks.loadedCount;
    debugState.chunksPending = this.chunks.pendingCount;
    debugState.npcs = [...this.npcs.npcs.values()].map((n) => ({ id: n.spawn.id, x: n.actor.x, y: n.actor.y, role: n.spawn.role, name: n.spawn.name }));
    debugState.hp = this.combat.stats.hp;
    debugState.objects = this.children.length;
    debugState.weather = this.live.weather;
    debugState.invasion = this.live.invasion;
    debugState.caravans = this.live.caravans.map((c) => c.name);
    debugState.attacks = this.combat.attacks;
    debugState.swinging = this.combat.swinging;
    debugState.spellCooldown = this.combat.spellCooldown;
    debugState.hero = this.hero.hero;
    debugState.pickups = this.hero.pickupCount;
    debugState.quests = this.hero.quests;
    debugState.markers = Object.fromEntries(this.markers);
    debugState.pickupPos = this.hero.pickupPositions();
    debugState.maxHp = this.combat.stats.maxHp;
    debugState.alive = this.combat.alive;
    debugState.enemies = [...this.enemies.enemies.values()].map((e) => ({ id: e.spawn.id, kind: e.def.kind, x: e.x, y: e.y, hp: e.stats.hp, state: e.state, seen: e.seen }));
    debugState.ready = this.chunks.loadedCount > 0 && this.chunks.pendingCount === 0;
  }
}
