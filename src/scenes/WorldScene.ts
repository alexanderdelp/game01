import Phaser from 'phaser';
import { buildCharacter, preloadCharacter } from '../character/CharacterFactory';
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
import { enemiesForChunk } from '../combat/enemies';
import { generateItem, type Slot } from '../rpg/items';
import { MAX_ACTIVE, accept, isReady, offerFor, onPosition, onTalk, progressText, turnIn, type Quest } from '../quests/quests';
import { FACTIONS, type Poi } from '../world/meta';
import { LocalWorldStore, WorldState, isDefeated, reputationRank } from '../state/worldState';
import { TownDecor } from '../render/TownDecor';
import { LiveWorld, worldNow } from '../sim/LiveWorld';
import { playerId } from '../game/identity';
import { PAD_BUTTONS, padDirection } from '../game/gamepad';
import { Markers } from '../render/Markers';
import { decodeShare, shareLink } from '../state/share';
import { SyncClient, syncUrlFromLocation } from '../state/sync';
import { SIGN_MAX, type WorldEvent } from '../state/worldState';
import { CHAT_MAX, LiveSession, type LiveMsg } from '../net/live';
import { RemotePlayers } from '../entities/RemotePlayers';
import { TICK_MS, caravanPos, newsBetween, type News } from '../sim/simulation';

const POTION_PRICE = 10;
/** Barbier (Aussehen ändern) */
const BARBER_PRICE = 20;
import { addItem } from '../rpg/progression';
import { CHUNK_TILES, WORLD_TILES, WORLD_VERSION, WorldGen } from '../world/WorldGen';
import { ExploredMap } from '../world/fog';

const ZOOMS = [1, 2, 3, 4];

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
  /** Fog of War: was der Held schon gesehen hat (M20). */
  fog!: ExploredMap;
  sync?: SyncClient;
  live2?: LiveSession;
  remote!: RemotePlayers;
  /** Eigene Chat-Sprechblase */
  myChat?: { text: string; until: number };
  private liveTimer = 0;
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
    const look = { ...DEFAULT_APPEARANCE, ...load<{ appearance?: Appearance }>(`hero:${this.world.seedName}`)?.appearance };
    preloadCharacter(this, { ...look, torso: 'longsleeve' });
    preloadCharacter(this, { ...look, torso: 'leather' });
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
    this.chunks = new ChunkManager(this, this.world.seedName);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.chunks.destroy());

    this.state = new WorldState(this.world.seedName, new LocalWorldStore(), Date.now(), playerId());
    this.fog = ExploredMap.decode(load<string>(`fog:${this.world.seedName}`));
    this.lastFogTile = { tx: -1, ty: -1 };
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
    this.player = new Actor(this, startX, startY, buildCharacter(this, { ...DEFAULT_APPEARANCE, ...load<{ appearance?: Appearance }>(`hero:${this.world.seedName}`)?.appearance }));

    // Startzoom so, dass mindestens ~20 Kacheln in der Breite sichtbar sind (Handy: 1, Desktop: 2).
    this.zoomIndex = Phaser.Math.Clamp(Math.floor(this.scale.width / 640), 1, ZOOMS.length) - 1;
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
    void this.importFromHash();
    const syncUrl = syncUrlFromLocation();
    if (syncUrl) {
      this.sync = new SyncClient(syncUrl, this.state, (fresh) => this.onForeign(fresh, false));
      this.sync.start();
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.sync?.stop());
      // Live-Zusammenspiel über denselben Server (M12)
      this.live2 = new LiveSession(syncUrl, this.world.seedName, (m) => this.onLive(m));
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
      hurtPlayer: (a, x, y) => this.combat.hurt(a, x, y),
      fireBolt: (x, y, vx, vy, d) => this.enemies.fireBolt(x, y, vx, vy, d),
      others: [],
    };
    this.remote = new RemotePlayers(this, this.state.pid);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.remote.destroy());

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
    kb.on('keydown-ONE', () => this.pendingActions.length > 0 && this.choose(0));
    kb.on('keydown-TWO', () => this.pendingActions.length > 1 && this.choose(1));
    kb.on('keydown-THREE', () => this.pendingActions.length > 2 && this.choose(2));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoom(dy < 0 ? 1 : -1));

    const persist = () => {
      this.saveFog();
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
    debugState.seed = this.world.seedName;
    debugState.spawn = spawn;
    debugState.fogKnows = (tx: number, ty: number) => this.fog.knows(tx, ty);
    debugState.fogFraction = () => this.fog.fraction;
    debugState.fogReveal = (tx: number, ty: number, r: number) => void this.fog.reveal(tx, ty, r);
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
    debugState.choose = (i: number) => this.choose(i);
    debugState.pledge = () => this.myPledge();
    debugState.killEnemy = (id: string) => {
      const e = this.enemies.enemies.get(id);
      if (!e) return false;
      e.hit(e.stats.hp + 1, this.player.x, this.player.y);
      this.enemies.kill(e);
      this.hero.onDefeated(e);
      return true;
    };
    debugState.state = () => ({
      chests: [...this.state.d.chests],
      discovered: Object.fromEntries(this.state.d.discovered),
      prosperity: Object.fromEntries(this.state.d.prosperity),
      reputation: Object.fromEntries(this.state.d.reputation),
      events: this.state.events.length,
    });
    debugState.recordQuest = (tx: number, ty: number) => this.recordQuest(tx, ty);
    debugState.travel = (id: number) => this.travel(id);
    debugState.placeSign = (text: string) => this.placeSign(text);
    debugState.chat = (text: string) => this.chat(text);
    debugState.remotes = () => [...this.remote.remotes.values()].map((r) => ({ pid: r.pid, name: r.name, x: r.x, y: r.y, chat: r.chat?.text ?? '' }));
    debugState.liveConnected = () => !!this.live2?.connected;
    debugState.shareLink = () => this.shareLink();
    debugState.players = () => this.players();
    debugState.syncStatus = () => this.sync?.status ?? 'aus';
    debugState.syncNow = () => this.sync?.sync() ?? Promise.resolve();
    debugState.caravanAt = (i: number) => {
      const c = this.live.caravans[i];
      return c ? caravanPos(c, worldNow()) : null;
    };
    debugState.meta = {
      settlements: this.world.meta.settlements.map((s) => ({ id: s.id, name: s.name, tx: s.tx, ty: s.ty, capital: s.capital, realm: s.realm })),
      rivals: [...this.world.meta.rivals],
      obelisks: this.world.meta.obelisks.map((o) => ({ tx: o.tx, ty: o.ty })),
      ruins: this.world.meta.ruins.map((r) => ({ tx: r.tx, ty: r.ty })),
      chunkPoi: (cx: number, cy: number) => this.world.meta.chunkPoi(cx, cy),
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

  /** Live-Nachricht eines Mitspielers verarbeiten. */
  private onLive(m: LiveMsg): void {
    const r = this.remote.onMsg(m);
    if (m.pid === this.state.pid) return;
    if (m.type === 'hit') {
      const e = this.enemies.enemies.get(m.enemy);
      if (!e) return;
      const killed = e.hit(m.dmg, m.x, m.y);
      this.events.emit('damage', { x: e.x, y: e.body.y, amount: m.dmg, color: '#a8d8ff' });
      if (killed) {
        this.enemies.kill(e);
        if (Math.hypot(e.x - this.player.x, e.y - this.player.y) < 15 * TILE_PX) this.hero.shareXp(e);
      }
    }
    if (m.type === 'chat') {
      this.news.push({ tick: 0, text: `${m.name}: „${m.text}“` });
      debugState.news = this.news.map((n) => n.text);
    }
    if (m.type === 'state' && r && !this.knownLive.has(m.pid)) {
      this.knownLive.add(m.pid);
      this.events.emit('float', { x: this.player.x, y: this.player.y - 60, text: `${m.name} ist da!`, color: '#2fe0d8' });
    }
  }

  private readonly knownLive = new Set<string>();

  /** Kurze Nachricht an alle live verbundenen Mitspieler. */
  chat(text?: string): void {
    const msg = (text ?? window.prompt(`Nachricht an Mitspieler (max. ${CHAT_MAX} Zeichen):`) ?? '').trim().slice(0, CHAT_MAX);
    if (!msg) return;
    this.myChat = { text: msg, until: Date.now() + 6000 };
    this.live2?.send({ type: 'chat', pid: this.state.pid, name: this.heroName, text: msg });
  }

  /** Botschaft an der aktuellen Stelle hinterlassen (für Mitspieler). */
  placeSign(text?: string): void {
    const t = this.player.tile;
    const msg = (text ?? window.prompt(`Botschaft für andere Spieler (max. ${SIGN_MAX} Zeichen):`) ?? '').trim().slice(0, SIGN_MAX);
    if (!msg) return;
    this.state.record({ t: Date.now(), by: this.heroName, type: 'sign', tx: t.tx, ty: t.ty, text: msg });
    this.state.flush();
    this.signs.refresh();
    this.events.emit('float', { x: this.player.x, y: this.player.y - 50, text: 'Schild aufgestellt', color: '#ffd84a' });
    void this.sync?.sync();
  }

  /** Fremde Ereignisse wurden übernommen: Darstellung auffrischen und berichten. */
  onForeign(fresh: WorldEvent[], announce: boolean): void {
    this.signs.refresh();
    this.towns.refreshAll();
    for (const id of this.state.d.chests) {
      const [tx, ty] = id.slice(6).split(',');
      this.chunks.builtImages.get(`${tx},${ty}`)?.setFrame('chest:1');
    }
    this.state.flush();
    const others = fresh.filter((e) => e.pid !== this.state.pid);
    const news = foreignNews(others, this.world.meta.settlements, this.world.meta.realms);
    this.news.push(...news);
    debugState.news = this.news.map((n) => n.text);
    if (!others.length) return;
    const names = [...new Set(others.map((e) => e.by))].join(', ');
    if (announce) this.events.emit('news-summary', { hours: 0, title: `Welt von ${names} übernommen (${others.length} Ereignisse)`, news });
    else this.events.emit('float', { x: this.player.x, y: this.player.y - 60, text: `Neues von ${names}`, color: '#2fe0d8' });
  }

  /** Teilen-Link im Anker übernehmen (#w=…). */
  private async importFromHash(): Promise<void> {
    const m = /^#w=(.+)$/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    const p = await decodeShare(m[1]);
    if (!p || p.seed !== this.world.seedName) return;
    const fresh = this.state.mergeIn(p.events);
    this.onForeign(fresh, true);
  }

  async shareLink(): Promise<string> {
    this.state.flush();
    return shareLink({ seed: this.world.seedName, events: this.state.events });
  }

  /** Datei-Import (Weltpaket). */
  async importFile(file: File): Promise<number> {
    try {
      const p = JSON.parse(await file.text()) as { seed: string; events: WorldEvent[] };
      if (p.seed !== this.world.seedName) return -1;
      const fresh = this.state.mergeIn(p.events);
      this.onForeign(fresh, true);
      return fresh.length;
    } catch {
      return -1;
    }
  }

  exportFile(): void {
    this.state.flush();
    const blob = new Blob([JSON.stringify({ seed: this.world.seedName, events: this.state.events })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `welt-${this.world.seedName}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /** Mitspieler (aus dem Protokoll). */
  players(): { pid: string; name: string; events: number }[] {
    const map = new Map<string, { pid: string; name: string; events: number }>();
    for (const e of this.state.events) {
      const pid = e.pid ?? e.by;
      const p = map.get(pid) ?? { pid, name: e.by, events: 0 };
      p.name = e.by || p.name;
      p.events++;
      map.set(pid, p);
    }
    return [...map.values()].filter((p) => p.name);
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

  /** Spricht den nächsten NPC an bzw. blättert/schließt den Dialog. */
  interact(): void {
    if (this.dialogOpen) return this.endTalk();
    const mk = this.signs.nearest(this.player.x, this.player.y);
    const poi = this.nearestPoi();
    const npc = this.npcs.nearest(this.player);
    const npcDist = npc ? Math.hypot(npc.actor.x - this.player.x, npc.actor.y - this.player.y) : Infinity;
    if (mk && mk.dist < (poi?.dist ?? Infinity) && mk.dist < npcDist) {
      return this.say(mk.kind === 'sign' ? `Botschaft von ${mk.by}` : 'Grabstein', mk.kind === 'sign' ? 'Schild' : 'Erinnerung', mk.text);
    }
    if (poi && (!npc || poi.dist < Math.hypot(npc.actor.x - this.player.x, npc.actor.y - this.player.y))) return this.usePoi(poi.poi);
    if (!npc) return;
    npc.talking = true;
    this.talkingTo = npc;
    this.player.face(npc.actor.x, npc.actor.y);
    const log = this.hero.quests;
    const now = Date.now();
    const say = (text: string, choices?: [string, () => void][]) => this.say(npc.spawn.name, npc.role.name, text, choices);
    // 1. Botengang an diesen NPC
    const delivered = onTalk(log, npc.spawn.id);
    if (delivered) {
      const r = turnIn(log, delivered.id, now);
      this.recordQuest(delivered.giverTx, delivered.giverTy);
      return say(`Ein Brief von ${delivered.giverName}? Danke! (${r ? this.hero.reward(r) : ''})`);
    }
    // 2. Herrscher: Treueschwur (M15)
    if (npc.spawn.role === 'ruler') return this.rulerTalk(npc.spawn.name, npc.spawn.tx, npc.spawn.ty);
    // 3. Barbier: Aussehen ändern gegen Splitter (Feedback: nicht einfach im Heldenfenster)
    if (npc.spawn.role === 'barber') {
      const h = this.hero.hero;
      if (h.shards < BARBER_PRICE) return say(`Ein neuer Schnitt kostet ${BARBER_PRICE} ◆. Komm wieder, wenn du genug Splitter hast.`);
      return say(`Neue Frisur oder neue Kleider gefällig? Kostet ${BARBER_PRICE} ◆ – nur, wenn du etwas änderst.`, [
        [`Zum Spiegel (${BARBER_PRICE} ◆)`, () => this.editAppearance(BARBER_PRICE)],
        ['Nein danke', () => {}],
      ]);
    }
    // 3. Händler (Rivalen des eigenen Reichs verweigern den Handel)
    if (npc.spawn.role === 'merchant') {
      const realm = this.world.meta.realmAt(npc.spawn.tx, npc.spawn.ty);
      const mine = this.myPledge();
      if (mine !== null && this.world.meta.rivals[mine] === realm.id) {
        return say(`Du hast ${this.world.meta.realms[mine].name} die Treue geschworen. Gefolgsleute unserer Feinde bedienen wir nicht!`);
      }
      const bonus = mine === realm.id ? 0.15 : 0;
      return this.trade(npc.spawn.name, bonus ? `Willkommen, Gefolgsmann von ${realm.name}! ` : '', Math.min(0.45, this.rankAt(npc.spawn.tx, npc.spawn.ty).discount + bonus));
    }
    // 3. Eigene Quest abgeben bzw. daran erinnern
    const own = log.active.find((q) => q.giverId === npc.spawn.id);
    if (own && isReady(own)) {
      const r = turnIn(log, own.id, now)!;
      this.recordQuest(own.giverTx, own.giverTy);
      return say(`Großartig, du hast es geschafft! Belohnung: ${this.hero.reward(r)}`);
    }
    if (own) return say(`${own.text} (${progressText(own)})`);
    // 4. Neues Angebot
    const offer = this.cachedOffer(npc.spawn, now);
    if (offer && log.active.length < MAX_ACTIVE) {
      return say(`${offer.title} – ${offer.text}`, [
        ['Annehmen', () => this.acceptOffer(offer)],
        ['Ablehnen', () => {}],
      ]);
    }
    // 5. Plaudern (mit Bezug auf Reich und Ort)
    const line = npc.role.lines[npc.talks % npc.role.lines.length];
    npc.talks++;
    const rank = this.rankAt(npc.spawn.tx, npc.spawn.ty);
    const greet = rank.rank > 0 ? `Ah, ${rank.title === 'Held' ? 'der Held' : rank.title === 'Freund' ? 'ein Freund' : 'ein bekanntes Gesicht'} von ${rank.realm.name}! ` : '';
    say(greet + this.fillLore(line, npc.spawn.tx, npc.spawn.ty));
  }

  get heroName(): string {
    return this.hero?.hero.name ?? 'Held';
  }

  /** Erledigte Quest: Wohlstand des Orts und Ansehen beim Reich steigen. */
  private recordQuest(tx: number, ty: number): void {
    const m = this.world.meta;
    const town = m.settlementNear(tx, ty, 8);
    const before = town ? (this.state.d.prosperity.get(town.id) ?? 0) : 0;
    this.state.record({ t: Date.now(), by: this.heroName, type: 'quest', town: town?.id ?? null, realm: m.realmAt(tx, ty).id });
    this.events.emit('sfx', 'quest');
    if (town) {
      this.towns.refresh(town.id);
      const lv = (n: number) => (n >= 10 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0);
      if (lv(before + 1) > lv(before)) {
        const text = ['', 'Laternen erhellen jetzt die Gassen.', 'Neue Häuser werden gebaut!', `Die Bewohner errichten dir eine Statue!`][lv(before + 1)];
        this.events.emit('banner', { title: `${town.name} blüht auf`, sub: text });
      }
    }
    this.state.flush();
  }

  /** Ansehen beim Reich an einer Position. */
  rankAt(tx: number, ty: number) {
    const realm = this.world.meta.realmAt(tx, ty);
    return { realm, ...reputationRank(this.state.d.reputation.get(realm.id) ?? 0) };
  }

  /** Setzt Orts- und Reichsnamen in NPC-Sätze ein. */
  private fillLore(line: string, tx: number, ty: number): string {
    const m = this.world.meta;
    const realm = m.realmAt(tx, ty);
    const town = m.settlementNear(tx, ty, 4);
    const f = FACTIONS[realm.faction];
    return line
      .replace('{town}', town?.name ?? realm.name)
      .replace('{realm}', realm.name)
      .replace('{faction}', f.name)
      .replace('{motto}', f.motto)
      .replace('{capital}', m.settlements[realm.capital]?.name ?? realm.name)
      .replace('{world}', m.lore.worldName);
  }

  private say(name: string, role: string, text: string, choices?: [string, () => void][]): void {
    this.dialogOpen = true;
    this.pendingActions = choices?.map((c) => c[1]) ?? [];
    const d = { name, role, text, choices: choices?.map((c) => c[0]) };
    this.events.emit('talk', d);
    debugState.dialog = d;
  }

  private acceptOffer(offer: Quest): void {
    if (!accept(this.hero.quests, offer)) return;
    this.events.emit('sfx', 'quest');
    this.events.emit('quests-changed');
    this.events.emit('float', { x: this.player.x, y: this.player.y - 50, text: `Quest: ${offer.title}`, color: '#ffd84a' });
    this.hero.persist();
  }

  /** Reich, dem dieser Held die Treue geschworen hat (oder null). */
  myPledge(): number | null {
    return this.state.d.pledges.get(this.state.pid)?.realm ?? null;
  }

  /** Gespräch mit einem Herrscher: Treueschwur anbieten. */
  private rulerTalk(name: string, tx: number, ty: number): void {
    const m = this.world.meta;
    const realm = m.realmAt(tx, ty);
    const rival = m.realms[m.rivals[realm.id]];
    const f = FACTIONS[realm.faction];
    const mine = this.myPledge();
    const title = `${name} · Herrscher von ${realm.name}`;
    if (mine === realm.id) {
      this.say(title, f.name, `${f.motto} Du bist ein treuer Gefolgsmann von ${realm.name}. Gemeinsam halten wir ${rival.name} in Schach!`);
      return;
    }
    const change = mine !== null ? ` Dein Schwur gegenüber ${m.realms[mine].name} würde erlöschen.` : '';
    this.say(
      title,
      f.name,
      `${f.motto} Schwöre ${realm.name} die Treue: Unser Reich wächst, unsere Händler geben dir Rabatt. Doch ${rival.name} wird dich als Feind sehen – dort handelt niemand mehr mit dir.${change}`,
      [
        ['Treue schwören', () => this.pledge(realm.id)],
        ['Bedenkzeit', () => {}],
      ],
    );
  }

  pledge(realmId: number): void {
    const m = this.world.meta;
    this.state.record({ t: Date.now(), by: this.heroName, type: 'pledge', realm: realmId });
    this.state.flush();
    this.events.emit('sfx', 'quest');
    this.events.emit('banner', { title: `Treue zu ${m.realms[realmId].name}`, sub: `${m.realms[m.rivals[realmId]].name} betrachtet dich nun als Feind` });
    this.events.emit('hero-changed');
    void this.sync?.sync();
  }

  /** Händler: Trank kaufen, gewöhnliche Gegenstände verkaufen. */
  private trade(name: string, note = '', discount = 0): void {
    const h = this.hero.hero;
    const price = Math.max(1, Math.round(POTION_PRICE * (1 - discount)));
    const commons = h.inventory.filter((i) => i.rarity === 'common');
    const value = commons.reduce((s, i) => s + 3 + i.level * 2, 0);
    this.say(name, 'Händlerin', `${note}Was darf's sein? Du hast ${h.shards} ◆.`, [
      [`Heiltrank kaufen (${price} ◆${discount ? `, −${Math.round(discount * 100)} %` : ''})`, () => {
        if (h.shards < price) return this.trade(name, 'Dafür reicht es leider nicht. ', discount);
        h.shards -= price;
        h.potions++;
        this.hero.persist();
        this.events.emit('hero-changed');
        this.trade(name, 'Bitte sehr! ', discount);
      }],
      [commons.length ? `${commons.length} Gewöhnliche verkaufen (+${value} ◆)` : 'Nichts zu verkaufen', () => {
        if (!commons.length) return;
        h.inventory = h.inventory.filter((i) => i.rarity !== 'common');
        h.shards += value;
        this.hero.persist();
        this.events.emit('hero-changed');
        this.trade(name, `Gutes Geschäft! +${value} ◆. `, discount);
      }],
      ['Tschüss', () => {}],
    ]);
  }

  /** Nächstes Geheimnis (Truhe, Schrein, Obelisk) in Reichweite. */
  private nearestPoi(): { poi: Poi; dist: number } | null {
    const { tx, ty } = this.player.tile;
    let best: { poi: Poi; dist: number } | null = null;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const p = this.world.meta.poiAt(tx + dx, ty + dy);
        if (!p) continue;
        const dist = Math.hypot(p.tx * TILE_PX + TILE_PX / 2 - this.player.x, p.ty * TILE_PX + TILE_PX - this.player.y);
        if (dist < 56 && (!best || dist < best.dist)) best = { poi: p, dist };
      }
    }
    return best;
  }

  private usePoi(p: Poi): void {
    const h = this.hero.hero;
    h.chronicle ??= [];
    if (p.kind === 'chest') {
      if (this.state.d.chests.has(p.id)) {
        const by = this.state.d.chestsBy.get(p.id);
        return this.say('Truhe', 'leer', by && by !== this.heroName ? `Die Truhe ist leer – ${by} war schneller.` : 'Die Truhe ist leer.');
      }
      this.state.record({ t: Date.now(), by: this.heroName, type: 'chest', id: p.id });
      this.events.emit('sfx', 'open');
      this.chunks.builtImages.get(`${p.tx},${p.ty}`)?.setFrame('chest:1');
      this.hero.lootChest(p.tx * TILE_PX + TILE_PX / 2, p.ty * TILE_PX + TILE_PX + 6);
      this.events.emit('float', { x: this.player.x, y: this.player.y - 50, text: 'Truhe geöffnet!', color: '#ffd84a' });
      this.hero.persist();
      return;
    }
    if (p.kind === 'ruinchest') {
      if (this.state.d.chests.has(p.id)) {
        const by = this.state.d.chestsBy.get(p.id);
        return this.say('Ruinentruhe', 'leer', by && by !== this.heroName ? `Leer – ${by} hat sie bereits geplündert.` : 'Die Ruinentruhe ist leer.');
      }
      const guardian = [...this.enemies.enemies.values()].find((e) => e.spawn.id.startsWith('g') && e.alive && Math.hypot(e.x - this.player.x, e.y - this.player.y) < 12 * TILE_PX);
      if (guardian) return this.say('Ruinentruhe', 'versiegelt', 'Ein Wächter bewacht diese Truhe. Besiege ihn zuerst!');
      this.state.record({ t: Date.now(), by: this.heroName, type: 'chest', id: p.id });
      this.events.emit('sfx', 'open');
      this.chunks.builtImages.get(`${p.tx},${p.ty}`)?.setFrame('ruinchest:1');
      this.hero.lootRuin(p.tx * TILE_PX + TILE_PX / 2, p.ty * TILE_PX + TILE_PX + 6);
      this.events.emit('banner', { title: 'Ruinenschatz!', sub: 'Ein seltener Fund aus der alten Zeit' });
      this.hero.persist();
      return;
    }
    if (p.kind === 'shrine') {
      const now = this.time.now;
      if ((this.shrineCooldown.get(p.id) ?? 0) > now) return this.say('Schrein', 'ruhend', 'Das Licht des Schreins sammelt sich noch.');
      this.shrineCooldown.set(p.id, now + 5 * 60_000);
      this.combat.heal(this.combat.stats.maxHp);
      this.combat.buff(60);
      return this.say('Schrein', 'Kristall', 'Warmes Licht durchströmt dich. Volle Heilung und +25 % Angriff für eine Minute.');
    }
    // Obelisk: Chronik-Fragment
    const i = p.fragment ?? 0;
    const frag = this.world.meta.lore.fragments[i];
    const isNew = !h.chronicle.includes(i);
    if (!this.state.d.discovered.has(`obelisk:${i}`)) this.state.record({ t: Date.now(), by: this.heroName, type: 'discover', id: `obelisk:${i}` });
    let extra = '';
    if (isNew) {
      h.chronicle.push(i);
      extra = ` (+${this.hero.reward({ xp: 30 + h.level * 5, shards: 0, item: false }).split(',')[0]})`;
      if (h.chronicle.length === this.world.meta.lore.fragments.length) {
        h.title = 'Chronist';
        extra += ` – Du kennst nun die ganze Chronik von ${this.world.meta.lore.worldName}! Titel „Chronist“, +${this.hero.reward({ xp: 200, shards: 200, item: true })}`;
        this.events.emit('banner', { title: 'Chronik vollständig!', sub: `Titel: Chronist von ${this.world.meta.lore.worldName}` });
      }
      this.hero.persist();
      this.events.emit('chronicle-changed');
    }
    this.say(`Obelisk · ${frag.title}`, `${h.chronicle.length}/${this.world.meta.lore.fragments.length}`, `${frag.text}${extra}`);
  }

  private readonly shrineCooldown = new Map<string, number>();
  news: News[] = [];
  private lastRealm = -1;
  private lastTown = -1;
  dialogOpen = false;
  private pendingActions: (() => void)[] = [];

  /** Auswahl im Dialog. */
  choose(i: number): void {
    const action = this.pendingActions[i];
    this.pendingActions = [];
    this.endTalk();
    action?.();
  }

  /** Quest-Markierung je geladenem NPC: "!" Angebot, "?" Abgabe/Ziel. */
  readonly markers = new Map<string, '!' | '?'>();
  private markerTimer = 0;

  private readonly offerCache = new Map<string, Quest | null>();

  /** Angebot eines NPC mit Zwischenspeicher (die Erzeugung sucht Ziele in der Welt und ist nicht billig). */
  private cachedOffer(npc: Npc['spawn'], now: number): Quest | null {
    const log = this.hero.quests;
    if (log.active.some((q) => q.giverId === npc.id) || (log.cooldown[npc.id] ?? 0) > now) return null;
    const key = `${npc.id}:${log.next[npc.id] ?? 0}:${this.hero.hero.level}`;
    if (!this.offerCache.has(key)) this.offerCache.set(key, offerFor(this.world, log, npc, this.hero.hero.level, now));
    return this.offerCache.get(key) ?? null;
  }

  private updateMarkers(): void {
    this.markers.clear();
    const log = this.hero.quests;
    const now = Date.now();
    for (const n of this.npcs.npcs.values()) {
      const id = n.spawn.id;
      if (n.spawn.role === 'ruler') {
        if (this.myPledge() !== this.world.meta.realmAt(n.spawn.tx, n.spawn.ty).id) this.markers.set(id, '!');
        continue;
      }
      const service = n.spawn.role === 'merchant' || n.spawn.role === 'barber';
      if (service && !log.active.some((q) => q.objective.type === 'deliver' && q.objective.npcId === id)) continue;
      const own = log.active.find((q) => q.giverId === id);
      if ((own && isReady(own)) || log.active.some((q) => q.objective.type === 'deliver' && q.objective.npcId === id && !isReady(q))) this.markers.set(id, '?');
      else if (!service && !own && log.active.length < MAX_ACTIVE && this.cachedOffer(n.spawn, now)) this.markers.set(id, '!');
    }
  }

  cast(): void {
    if (this.dialogOpen) return this.endTalk();
    this.combat.cast();
  }

  attack(): void {
    if (this.dialogOpen) return this.endTalk();
    this.combat.attack();
  }

  endTalk(): void {
    this.dialogOpen = false;
    this.pendingActions = [];
    if (this.talkingTo) this.talkingTo.talking = false;
    this.talkingTo = null;
    this.events.emit('talk', null);
    debugState.dialog = null;
  }

  private get saveKey(): string {
    return `player:${this.world.seedName}`;
  }

  zoom(dir: number): void {
    // Bei offener Karte zoomt die Karte (UI-Szene), nicht die Welt
    if (debugState.mapOpen) return;
    this.zoomIndex = Phaser.Math.Clamp(this.zoomIndex + dir, 0, ZOOMS.length - 1);
    this.cameras.main.setZoom(ZOOMS[this.zoomIndex]);
  }

  /** Mittelpunkt des Interesses (die Figur) in Kachelkoordinaten. */
  private lastFogTile = { tx: -1, ty: -1 };

  private saveFog(): void {
    if (!this.fog.dirty) return;
    this.fog.dirty = false;
    save(`fog:${this.world.seedName}`, this.fog.encode());
  }

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
    if (this.combat.locked) this.player.update(0, 0, false, dt, this.chunks);
    else this.player.update(dx, dy, sprint, dt, this.chunks);
    this.combat.update(dt);
    this.hero.update(dt);
    this.markerTimer -= dt;
    if (this.markerTimer <= 0) {
      this.markerTimer = 0.5;
      const t = this.player.tile;
      const visited = onPosition(this.hero.quests, t.tx, t.ty);
      if (visited) {
        this.events.emit('float', { x: this.player.x, y: this.player.y - 50, text: `Gefunden: ${progressText(visited)}`, color: '#ffd84a' });
        this.events.emit('quests-changed');
      }
      this.updateMarkers();
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
        this.events.emit('banner', { title: 'Eine alte Ruine', sub: 'Ein Wächter hütet hier einen Schatz …' });
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

    // Fog of War: Umgebung aufdecken, sobald der Held eine neue Kachel betritt
    const pt = this.player.tile;
    if (pt.tx !== this.lastFogTile.tx || pt.ty !== this.lastFogTile.ty) {
      this.lastFogTile = pt;
      this.fog.reveal(pt.tx, pt.ty);
    }

    this.saveTimer += delta;
    if (this.saveTimer > 2000) {
      this.saveTimer = 0;
      this.saveFog();
      this.state.flush();
      save(`seen:${this.world.seedName}`, worldNow());
      save(this.saveKey, { x: Math.round(this.player.x), y: Math.round(this.player.y), v: WORLD_VERSION } satisfies SavedPlayer);
    }

    const f = this.focusTile;
    debugState.focus = f;
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
    debugState.enemies = [...this.enemies.enemies.values()].map((e) => ({ id: e.spawn.id, kind: e.def.kind, x: e.x, y: e.y, hp: e.stats.hp, state: e.state }));
    debugState.ready = this.chunks.loadedCount > 0 && this.chunks.pendingCount === 0;
  }
}

/** Taten anderer Spieler als Neuigkeiten. */
function foreignNews(events: WorldEvent[], towns: { id: number; name: string }[], realms: { name: string }[] = []): News[] {
  const out: News[] = [];
  const quests = new Map<string, number>();
  for (const e of events) {
    if (e.type === 'chest') out.push({ tick: 0, text: `${e.by} hat eine Truhe geöffnet.` });
    if (e.type === 'sign') out.push({ tick: 0, text: `${e.by} hat eine Botschaft hinterlassen: „${e.text}“` });
    if (e.type === 'death') out.push({ tick: 0, text: `${e.by} ist gefallen – ein Grabstein erinnert daran.` });
    if (e.type === 'pledge') out.push({ tick: 0, text: `${e.by} hat ${realms[e.realm]?.name ?? 'einem Reich'} die Treue geschworen.` });
    if (e.type === 'discover' && e.id.startsWith('obelisk')) out.push({ tick: 0, text: `${e.by} hat einen Obelisken entdeckt.` });
    if (e.type === 'discover' && e.id.startsWith('town')) out.push({ tick: 0, text: `${e.by} hat ${towns[Number(e.id.slice(5))]?.name ?? 'einen Ort'} besucht.` });
    if (e.type === 'quest' && e.town !== null) quests.set(`${e.by}|${e.town}`, (quests.get(`${e.by}|${e.town}`) ?? 0) + 1);
  }
  for (const [k, n] of quests) {
    const [by, town] = k.split('|');
    out.push({ tick: 0, text: `${by} hat in ${towns[Number(town)]?.name ?? 'einem Ort'} ${n} Quest${n > 1 ? 's' : ''} erledigt.` });
  }
  return out;
}
