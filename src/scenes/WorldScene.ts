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
import { TICK_MS, caravanPos, newsBetween, type News } from '../sim/simulation';

const POTION_PRICE = 10;
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
  state!: WorldState;
  towns!: TownDecor;
  live!: LiveWorld;
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
    createDecorAtlas(this);
    createCreatureAtlas(this);
    this.chunks = new ChunkManager(this, this.world.seedName);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.chunks.destroy());

    this.state = new WorldState(this.world.seedName, new LocalWorldStore());
    this.npcs = new NpcManager(this, this.world, this.chunks);
    const spawn = this.world.findSpawn();
    this.enemies = new EnemyManager(this, this.world, this.chunks, spawn);
    this.enemies.isDefeated = (id) => isDefeated(this.state.d, id, Date.now());
    this.enemies.onKilled = (e) => this.state.record({ t: Date.now(), by: this.heroName, type: 'kill', id: e.spawn.id, realm: this.world.meta.realmAt(e.spawn.tx, e.spawn.ty).id });
    const saved = load<SavedPlayer>(this.saveKey);
    const startX = saved?.x ?? spawn.tx * TILE_PX + TILE_PX / 2;
    const startY = saved?.y ?? spawn.ty * TILE_PX + TILE_PX - 1;
    this.player = new Actor(this, startX, startY, buildCharacter(this, { ...DEFAULT_APPEARANCE, ...load<{ appearance?: Appearance }>(`hero:${this.world.seedName}`)?.appearance }));

    // Startzoom so, dass mindestens ~20 Kacheln in der Breite sichtbar sind (Handy: 1, Desktop: 2).
    this.zoomIndex = Phaser.Math.Clamp(Math.floor(this.scale.width / 640), 1, ZOOMS.length) - 1;
    const respawn = () => this.player.setPosition(spawn.tx * TILE_PX + TILE_PX / 2, spawn.ty * TILE_PX + TILE_PX - 1);
    this.combat = new PlayerCombat(this, this.player, this.enemies, this.chunks, respawn);
    this.hero = new HeroController(this, this.world.seedName, this.player, this.combat);
    // Alte Truhen-Daten aus M8 (im Helden) in den Weltzustand übernehmen
    for (const id of this.hero.hero.opened ?? []) if (!this.state.d.chests.has(id)) this.state.record({ t: Date.now(), by: this.heroName, type: 'chest', id });
    delete this.hero.hero.opened;
    this.chunks.frameHook = (d) => (d.kind === 'chest' && this.state.d.chests.has(`chest:${d.tx},${d.ty}`) ? 'chest:1' : undefined);
    this.live = new LiveWorld(this.world, this.chunks, this.npcs, this.state);
    this.enemies.invasion = this.live.invasion;
    this.towns = new TownDecor(this, this.world, this.chunks, this.state, () => this.heroName, (id) => this.live.drift(id));
    const onDefeated = (e: Parameters<HeroController['onDefeated']>[0]) => this.hero.onDefeated(e);
    this.events.on('defeated', onDefeated);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off('defeated', onDefeated));
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
    kb.on('keydown-ONE', () => this.pendingActions.length > 0 && this.choose(0));
    kb.on('keydown-TWO', () => this.pendingActions.length > 1 && this.choose(1));
    kb.on('keydown-THREE', () => this.pendingActions.length > 2 && this.choose(2));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoom(dy < 0 ? 1 : -1));

    const persist = () => {
      save(this.saveKey, { x: Math.round(this.player.x), y: Math.round(this.player.y) } satisfies SavedPlayer);
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
    if (lastSeen && now - lastSeen > TICK_MS) {
      const missed = newsBetween(this.world.meta, this.world.seed, lastSeen, now, this.live.caravans);
      if (missed.length) this.time.delayedCall(800, () => this.events.emit('news-summary', { hours: Math.round((now - lastSeen) / TICK_MS), news: missed }));
    }
    save(`seen:${this.world.seedName}`, now);
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
    debugState.choose = (i: number) => this.choose(i);
    debugState.state = () => ({
      chests: [...this.state.d.chests],
      discovered: Object.fromEntries(this.state.d.discovered),
      prosperity: Object.fromEntries(this.state.d.prosperity),
      reputation: Object.fromEntries(this.state.d.reputation),
      events: this.state.events.length,
    });
    debugState.recordQuest = (tx: number, ty: number) => this.recordQuest(tx, ty);
    debugState.travel = (id: number) => this.travel(id);
    debugState.caravanAt = (i: number) => {
      const c = this.live.caravans[i];
      return c ? caravanPos(c, worldNow()) : null;
    };
    debugState.meta = {
      settlements: this.world.meta.settlements.map((s) => ({ name: s.name, tx: s.tx, ty: s.ty, capital: s.capital })),
      obelisks: this.world.meta.obelisks.map((o) => ({ tx: o.tx, ty: o.ty })),
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

  /** Öffnet den Erschaffungsbildschirm zum Ändern des Aussehens (Fortschritt bleibt). */
  editAppearance(): void {
    save(this.saveKey, { x: Math.round(this.player.x), y: Math.round(this.player.y) } satisfies SavedPlayer);
    this.hero.persist();
    this.scene.stop('ui');
    this.scene.start('create', { seed: this.world.seedName, edit: true });
  }

  /** Spricht den nächsten NPC an bzw. blättert/schließt den Dialog. */
  interact(): void {
    if (this.dialogOpen) return this.endTalk();
    const poi = this.nearestPoi();
    const npc = this.npcs.nearest(this.player);
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
    // 2. Händler
    if (npc.spawn.role === 'merchant') return this.trade(npc.spawn.name, '', this.rankAt(npc.spawn.tx, npc.spawn.ty).discount);
    // 3. Eigene Quest abgeben bzw. daran erinnern
    const own = log.active.find((q) => q.giverId === npc.spawn.id);
    if (own && isReady(own)) {
      const r = turnIn(log, own.id, now)!;
      this.recordQuest(own.giverTx, own.giverTy);
      return say(`Großartig, du hast es geschafft! Belohnung: ${this.hero.reward(r)}`);
    }
    if (own) return say(`${own.text} (${progressText(own)})`);
    // 4. Neues Angebot
    const offer = offerFor(this.world, log, npc.spawn, this.hero.hero.level, now);
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
    this.events.emit('quests-changed');
    this.events.emit('float', { x: this.player.x, y: this.player.y - 50, text: `Quest: ${offer.title}`, color: '#ffd84a' });
    this.hero.persist();
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
      if (this.state.d.chests.has(p.id)) return this.say('Truhe', 'leer', `Die Truhe ist leer.`);
      this.state.record({ t: Date.now(), by: this.heroName, type: 'chest', id: p.id });
      this.chunks.builtImages.get(`${p.tx},${p.ty}`)?.setFrame('chest:1');
      this.hero.lootChest(p.tx * TILE_PX + TILE_PX / 2, p.ty * TILE_PX + TILE_PX + 6);
      this.events.emit('float', { x: this.player.x, y: this.player.y - 50, text: 'Truhe geöffnet!', color: '#ffd84a' });
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

  private updateMarkers(): void {
    this.markers.clear();
    const log = this.hero.quests;
    const now = Date.now();
    for (const n of this.npcs.npcs.values()) {
      const id = n.spawn.id;
      const own = log.active.find((q) => q.giverId === id);
      if ((own && isReady(own)) || log.active.some((q) => q.objective.type === 'deliver' && q.objective.npcId === id && !isReady(q))) this.markers.set(id, '?');
      else if (!own && log.active.length < MAX_ACTIVE && offerFor(this.world, log, n.spawn, this.hero.hero.level, now)) this.markers.set(id, '!');
    }
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
      debugState.realm = realm.name;
      debugState.town = town?.name ?? '';
    }
    this.live.update(dt, this.player);
    if (this.enemies.invasion !== this.live.invasion) this.enemies.invasion = this.live.invasion;
    this.npcs.update(dt, this.player);
    this.combatCtx.playerAlive = this.combat.alive;
    this.enemies.update(dt, this.combatCtx);
    if (this.talkingTo && Math.hypot(this.talkingTo.actor.x - this.player.x, this.talkingTo.actor.y - this.player.y) > 90) this.endTalk();
    if (this.dialogOpen && !this.talkingTo && this.player.moving) this.endTalk();

    this.saveTimer += delta;
    if (this.saveTimer > 2000) {
      this.saveTimer = 0;
      this.state.flush();
      save(`seen:${this.world.seedName}`, worldNow());
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
    debugState.weather = this.live.weather;
    debugState.invasion = this.live.invasion;
    debugState.caravans = this.live.caravans.map((c) => c.name);
    debugState.attacks = this.combat.attacks;
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
