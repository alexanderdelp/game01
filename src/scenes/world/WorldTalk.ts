import { debugState } from '../../debug';
import type { Npc } from '../../entities/NpcManager';
import { MAX_ACTIVE, accept, isReady, offerFor, onTalk, progressText, turnIn, type Quest } from '../../quests/quests';
import { TILE_PX } from '../../render/chunkPixels';
import { reputationRank } from '../../state/worldState';
import { FACTIONS, type Poi } from '../../world/meta';
import { SITE_KIND, artifactText, eventText, plainLinker, siteEvents, yearText } from '../../history/narrate';
import { rumorAt } from '../../history/rumors';
import type { WorldScene } from '../WorldScene';

const POTION_PRICE = 10;
/** Preis beim Barbier (Aussehen ändern) */
export const BARBER_PRICE = 20;

/**
 * Gespräche und Interaktionen der Welt-Szene: NPCs (Quests, Händler, Barbier, Herrscher), Geheimnisse (Truhen,
 * Schreine, Obelisken), Schilder, Dialogauswahl und Quest-Markierungen über NPCs.
 */
export class WorldTalk {
  constructor(private readonly ws: WorldScene) {}

  /** Spricht den nächsten NPC an bzw. blättert/schließt den Dialog. */
  interact(): void {
    if (this.dialogOpen) return this.endTalk();
    const mk = this.ws.signs.nearest(this.ws.player.x, this.ws.player.y);
    const poi = this.nearestPoi();
    const npc = this.ws.npcs.nearest(this.ws.player);
    const npcDist = npc ? Math.hypot(npc.actor.x - this.ws.player.x, npc.actor.y - this.ws.player.y) : Infinity;
    if (mk && mk.dist < (poi?.dist ?? Infinity) && mk.dist < npcDist) {
      return this.say(mk.kind === 'sign' ? `Botschaft von ${mk.by}` : 'Grabstein', mk.kind === 'sign' ? 'Schild' : 'Erinnerung', mk.text);
    }
    if (poi && (!npc || poi.dist < Math.hypot(npc.actor.x - this.ws.player.x, npc.actor.y - this.ws.player.y))) return this.usePoi(poi.poi);
    if (!npc) return;
    npc.talking = true;
    this.talkingTo = npc;
    this.ws.player.face(npc.actor.x, npc.actor.y);
    const log = this.ws.hero.quests;
    const now = Date.now();
    const say = (text: string, choices?: [string, () => void][]) => this.say(npc.spawn.name, npc.role.name, text, choices);
    // 1. Botengang an diesen NPC
    const delivered = onTalk(log, npc.spawn.id);
    if (delivered) {
      const r = turnIn(log, delivered.id, now);
      this.recordQuest(delivered.giverTx, delivered.giverTy);
      return say(`Ein Brief von ${delivered.giverName}? Danke! (${r ? this.ws.hero.reward(r) : ''})`);
    }
    // 2. Herrscher: Treueschwur (M15)
    if (npc.spawn.role === 'ruler') return this.rulerTalk(npc.spawn.name, npc.spawn.tx, npc.spawn.ty);
    // 3. Barbier: Aussehen ändern gegen Splitter (Feedback: nicht einfach im Heldenfenster)
    if (npc.spawn.role === 'barber') {
      const h = this.ws.hero.hero;
      if (h.shards < BARBER_PRICE) return say(`Ein neuer Schnitt kostet ${BARBER_PRICE} ◆. Komm wieder, wenn du genug Splitter hast.`);
      return say(`Neue Frisur oder neue Kleider gefällig? Kostet ${BARBER_PRICE} ◆ – nur, wenn du etwas änderst.`, [
        [`Zum Spiegel (${BARBER_PRICE} ◆)`, () => this.ws.editAppearance(BARBER_PRICE)],
        ['Nein danke', () => {}],
      ]);
    }
    // 3. Händler (Rivalen des eigenen Reichs verweigern den Handel)
    if (npc.spawn.role === 'merchant') {
      const realm = this.ws.world.meta.realmAt(npc.spawn.tx, npc.spawn.ty);
      const mine = this.myPledge();
      if (mine !== null && this.ws.world.meta.rivals[mine] === realm.id) {
        return say(`Du hast ${this.ws.world.meta.realms[mine].name} die Treue geschworen. Gefolgsleute unserer Feinde bedienen wir nicht!`);
      }
      const bonus = mine === realm.id ? 0.15 : 0;
      return this.trade(npc.spawn.name, bonus ? `Willkommen, Gefolgsmann von ${realm.name}! ` : '', Math.min(0.45, this.rankAt(npc.spawn.tx, npc.spawn.ty).discount + bonus));
    }
    // 3. Eigene Quest abgeben bzw. daran erinnern
    const own = log.active.find((q) => q.giverId === npc.spawn.id);
    if (own && isReady(own)) {
      const r = turnIn(log, own.id, now)!;
      this.recordQuest(own.giverTx, own.giverTy);
      return say(`Großartig, du hast es geschafft! Belohnung: ${this.ws.hero.reward(r)}`);
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
    // 5. Plaudern (mit Bezug auf Reich und Ort); in Welten mit Vorgeschichte jedes zweite Mal ein Gerücht
    const h = this.ws.world.history;
    const rumor = h && npc.talks % 2 === 0 ? rumorAt(h, npc.spawn.tx, npc.spawn.ty, npc.talks / 2 + npc.spawn.tx) : null;
    npc.talks++;
    if (rumor) return say(rumor);
    const line = npc.role.lines[npc.talks % npc.role.lines.length];
    const rank = this.rankAt(npc.spawn.tx, npc.spawn.ty);
    const greet = rank.rank > 0 ? `Ah, ${rank.title === 'Held' ? 'der Held' : rank.title === 'Freund' ? 'ein Freund' : 'ein bekanntes Gesicht'} von ${rank.realm.name}! ` : '';
    say(greet + this.fillLore(line, npc.spawn.tx, npc.spawn.ty));
  }

  /** Erledigte Quest: Wohlstand des Orts und Ansehen beim Reich steigen. */
  recordQuest(tx: number, ty: number): void {
    const m = this.ws.world.meta;
    const town = m.settlementNear(tx, ty, 8);
    const before = town ? (this.ws.state.d.prosperity.get(town.id) ?? 0) : 0;
    this.ws.state.record({ t: Date.now(), by: this.ws.heroName, type: 'quest', town: town?.id ?? null, realm: m.realmAt(tx, ty).id });
    this.ws.events.emit('sfx', 'quest');
    if (town) {
      this.ws.towns.refresh(town.id);
      const lv = (n: number) => (n >= 10 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0);
      if (lv(before + 1) > lv(before)) {
        const text = ['', 'Laternen erhellen jetzt die Gassen.', 'Neue Häuser werden gebaut!', `Die Bewohner errichten dir eine Statue!`][lv(before + 1)];
        this.ws.events.emit('banner', { title: `${town.name} blüht auf`, sub: text });
      }
    }
    this.ws.state.flush();
  }

  /** Ansehen beim Reich an einer Position. */
  rankAt(tx: number, ty: number) {
    const realm = this.ws.world.meta.realmAt(tx, ty);
    return { realm, ...reputationRank(this.ws.state.d.reputation.get(realm.id) ?? 0) };
  }

  /** Setzt Orts- und Reichsnamen in NPC-Sätze ein. */
  private fillLore(line: string, tx: number, ty: number): string {
    const m = this.ws.world.meta;
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
    this.ws.events.emit('talk', d);
    debugState.dialog = d;
  }

  private acceptOffer(offer: Quest): void {
    if (!accept(this.ws.hero.quests, offer)) return;
    this.ws.events.emit('sfx', 'quest');
    this.ws.events.emit('quests-changed');
    this.ws.events.emit('float', { x: this.ws.player.x, y: this.ws.player.y - 50, text: `Quest: ${offer.title}`, color: '#ffd84a' });
    this.ws.hero.persist();
  }

  /** Reich, dem dieser Held die Treue geschworen hat (oder null). */
  myPledge(): number | null {
    return this.ws.state.d.pledges.get(this.ws.state.pid)?.realm ?? null;
  }

  /** Gespräch mit einem Herrscher: Treueschwur anbieten. */
  private rulerTalk(name: string, tx: number, ty: number): void {
    const m = this.ws.world.meta;
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
    const m = this.ws.world.meta;
    this.ws.state.record({ t: Date.now(), by: this.ws.heroName, type: 'pledge', realm: realmId });
    this.ws.state.flush();
    this.ws.events.emit('sfx', 'quest');
    this.ws.events.emit('banner', { title: `Treue zu ${m.realms[realmId].name}`, sub: `${m.realms[m.rivals[realmId]].name} betrachtet dich nun als Feind` });
    this.ws.events.emit('hero-changed');
    void this.ws.sync?.sync();
  }

  /** Händler: Trank kaufen, gewöhnliche Gegenstände verkaufen. */
  private trade(name: string, note = '', discount = 0): void {
    const h = this.ws.hero.hero;
    const price = Math.max(1, Math.round(POTION_PRICE * (1 - discount)));
    const commons = h.inventory.filter((i) => i.rarity === 'common');
    const value = commons.reduce((s, i) => s + 3 + i.level * 2, 0);
    this.say(name, 'Händlerin', `${note}Was darf's sein? Du hast ${h.shards} ◆.`, [
      [`Heiltrank kaufen (${price} ◆${discount ? `, −${Math.round(discount * 100)} %` : ''})`, () => {
        if (h.shards < price) return this.trade(name, 'Dafür reicht es leider nicht. ', discount);
        h.shards -= price;
        h.potions++;
        this.ws.hero.persist();
        this.ws.events.emit('hero-changed');
        this.trade(name, 'Bitte sehr! ', discount);
      }],
      [commons.length ? `${commons.length} Gewöhnliche verkaufen (+${value} ◆)` : 'Nichts zu verkaufen', () => {
        if (!commons.length) return;
        h.inventory = h.inventory.filter((i) => i.rarity !== 'common');
        h.shards += value;
        this.ws.hero.persist();
        this.ws.events.emit('hero-changed');
        this.trade(name, `Gutes Geschäft! +${value} ◆. `, discount);
      }],
      ['Tschüss', () => {}],
    ]);
  }

  /** Nächstes Geheimnis (Truhe, Schrein, Obelisk) in Reichweite. */
  private nearestPoi(): { poi: Poi; dist: number } | null {
    const { tx, ty } = this.ws.player.tile;
    let best: { poi: Poi; dist: number } | null = null;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const p = this.ws.world.meta.poiAt(tx + dx, ty + dy);
        if (!p) continue;
        const dist = Math.hypot(p.tx * TILE_PX + TILE_PX / 2 - this.ws.player.x, p.ty * TILE_PX + TILE_PX - this.ws.player.y);
        if (dist < 56 && (!best || dist < best.dist)) best = { poi: p, dist };
      }
    }
    return best;
  }

  /** Fundorte der Vorgeschichte: Inschrift lesen, verlorene Artefakte bergen (Prototyp). */
  private useHistoric(p: Poi): void {
    const h = this.ws.world.history;
    if (!h || p.site === undefined) return;
    const site = h.sites[p.site];
    const L = plainLinker(h);
    if (p.kind === 'lair' && site.beast !== undefined && h.figures[site.beast].died === undefined) {
      const guard = [...this.ws.enemies.enemies.values()].find((e) => e.spawn.id === `b${site.id}` && e.alive);
      if (guard) return this.say(site.name, 'Hort', `Hier haust ${h.figures[site.beast].name}. Besiege die Bestie, dann gehört der Hort dir.`);
    }
    let text = siteEvents(h, site, 3).map((e) => `${yearText(e.y)}: ${eventText(h, e, L)}`).join(' ');
    const id = `relic:${site.id}`;
    if (site.arts.length && !this.ws.state.d.chests.has(id)) {
      const a = h.artifacts[site.arts[0]];
      this.ws.state.record({ t: Date.now(), by: this.ws.heroName, type: 'chest', id });
      this.ws.events.emit('sfx', 'open');
      this.ws.hero.lootRuin(p.tx * TILE_PX + TILE_PX / 2, p.ty * TILE_PX + TILE_PX + 10);
      this.ws.events.emit('banner', { title: `Fund: »${a.name}«`, sub: artifactText(h, a, L).split('. ')[0] });
      this.ws.hero.persist();
      text = `Du findest »${a.name}«! ${text}`;
    } else if (site.arts.length) text = `Hier wurde schon gegraben. ${text}`;
    this.say(site.name, p.kind === 'memorial' ? 'Gedenkstein' : SITE_KIND[site.kind], text || 'Die Inschrift ist verwittert.');
  }

  private usePoi(p: Poi): void {
    if (p.kind === 'tomb' || p.kind === 'memorial' || p.kind === 'lair') return this.useHistoric(p);
    const h = this.ws.hero.hero;
    h.chronicle ??= [];
    if (p.kind === 'chest') {
      if (this.ws.state.d.chests.has(p.id)) {
        const by = this.ws.state.d.chestsBy.get(p.id);
        return this.say('Truhe', 'leer', by && by !== this.ws.heroName ? `Die Truhe ist leer – ${by} war schneller.` : 'Die Truhe ist leer.');
      }
      this.ws.state.record({ t: Date.now(), by: this.ws.heroName, type: 'chest', id: p.id });
      this.ws.events.emit('sfx', 'open');
      this.ws.chunks.builtImages.get(`${p.tx},${p.ty}`)?.setFrame('chest:1');
      this.ws.hero.lootChest(p.tx * TILE_PX + TILE_PX / 2, p.ty * TILE_PX + TILE_PX + 6);
      this.ws.events.emit('float', { x: this.ws.player.x, y: this.ws.player.y - 50, text: 'Truhe geöffnet!', color: '#ffd84a' });
      this.ws.hero.persist();
      return;
    }
    if (p.kind === 'ruinchest') {
      if (this.ws.state.d.chests.has(p.id)) {
        const by = this.ws.state.d.chestsBy.get(p.id);
        return this.say('Ruinentruhe', 'leer', by && by !== this.ws.heroName ? `Leer – ${by} hat sie bereits geplündert.` : 'Die Ruinentruhe ist leer.');
      }
      const guardian = [...this.ws.enemies.enemies.values()].find((e) => e.spawn.id.startsWith('g') && e.alive && Math.hypot(e.x - this.ws.player.x, e.y - this.ws.player.y) < 12 * TILE_PX);
      if (guardian) return this.say('Ruinentruhe', 'versiegelt', 'Ein Wächter bewacht diese Truhe. Besiege ihn zuerst!');
      this.ws.state.record({ t: Date.now(), by: this.ws.heroName, type: 'chest', id: p.id });
      this.ws.events.emit('sfx', 'open');
      this.ws.chunks.builtImages.get(`${p.tx},${p.ty}`)?.setFrame('ruinchest:1');
      this.ws.hero.lootRuin(p.tx * TILE_PX + TILE_PX / 2, p.ty * TILE_PX + TILE_PX + 6);
      // Vorgeschichte: Liegt hier ein verlorenes Artefakt?
      const hist = this.ws.world.history;
      const site = hist && this.ws.world.meta.ruinAt(p.tx - 2, p.ty - 1)?.site;
      const art = hist && site !== undefined ? hist.artifacts[hist.sites[site].arts[0]] : undefined;
      if (hist && art) this.ws.events.emit('banner', { title: `Fund: »${art.name}«`, sub: artifactText(hist, art, plainLinker(hist)).split('. ')[0] });
      else this.ws.events.emit('banner', { title: 'Ruinenschatz!', sub: 'Ein seltener Fund aus der alten Zeit' });
      this.ws.hero.persist();
      return;
    }
    if (p.kind === 'shrine') {
      const now = this.ws.time.now;
      if ((this.shrineCooldown.get(p.id) ?? 0) > now) return this.say('Schrein', 'ruhend', 'Das Licht des Schreins sammelt sich noch.');
      this.shrineCooldown.set(p.id, now + 5 * 60_000);
      this.ws.combat.heal(this.ws.combat.stats.maxHp);
      this.ws.combat.buff(60);
      return this.say('Schrein', 'Kristall', 'Warmes Licht durchströmt dich. Volle Heilung und +25 % Angriff für eine Minute.');
    }
    // Obelisk: Chronik-Fragment
    const i = p.fragment ?? 0;
    const frag = this.ws.world.meta.lore.fragments[i];
    const isNew = !h.chronicle.includes(i);
    if (!this.ws.state.d.discovered.has(`obelisk:${i}`)) this.ws.state.record({ t: Date.now(), by: this.ws.heroName, type: 'discover', id: `obelisk:${i}` });
    let extra = '';
    if (isNew) {
      h.chronicle.push(i);
      extra = ` (+${this.ws.hero.reward({ xp: 30 + h.level * 5, shards: 0, item: false }).split(',')[0]})`;
      if (h.chronicle.length === this.ws.world.meta.lore.fragments.length) {
        h.title = 'Chronist';
        extra += ` – Du kennst nun die ganze Chronik von ${this.ws.world.meta.lore.worldName}! Titel „Chronist“, +${this.ws.hero.reward({ xp: 200, shards: 200, item: true })}`;
        this.ws.events.emit('banner', { title: 'Chronik vollständig!', sub: `Titel: Chronist von ${this.ws.world.meta.lore.worldName}` });
      }
      this.ws.hero.persist();
      this.ws.events.emit('chronicle-changed');
    }
    this.say(`Obelisk · ${frag.title}`, `${h.chronicle.length}/${this.ws.world.meta.lore.fragments.length}`, `${frag.text}${extra}`);
  }

  private readonly shrineCooldown = new Map<string, number>();
  dialogOpen = false;
  /** NPC, mit dem gerade gesprochen wird. */
  talkingTo: Npc | null = null;
  pendingActions: (() => void)[] = [];

  /** Auswahl im Dialog. */
  choose(i: number): void {
    const action = this.pendingActions[i];
    this.pendingActions = [];
    this.endTalk();
    action?.();
  }

  /** Quest-Markierung je geladenem NPC: "!" Angebot, "?" Abgabe/Ziel. */
  readonly markers = new Map<string, '!' | '?'>();

  private readonly offerCache = new Map<string, Quest | null>();

  /** Angebot eines NPC mit Zwischenspeicher (die Erzeugung sucht Ziele in der Welt und ist nicht billig). */
  private cachedOffer(npc: Npc['spawn'], now: number): Quest | null {
    const log = this.ws.hero.quests;
    if (log.active.some((q) => q.giverId === npc.id) || (log.cooldown[npc.id] ?? 0) > now) return null;
    const key = `${npc.id}:${log.next[npc.id] ?? 0}:${this.ws.hero.hero.level}`;
    if (!this.offerCache.has(key)) this.offerCache.set(key, offerFor(this.ws.world, log, npc, this.ws.hero.hero.level, now));
    return this.offerCache.get(key) ?? null;
  }

  updateMarkers(): void {
    this.markers.clear();
    const log = this.ws.hero.quests;
    const now = Date.now();
    for (const n of this.ws.npcs.npcs.values()) {
      const id = n.spawn.id;
      if (n.spawn.role === 'ruler') {
        if (this.myPledge() !== this.ws.world.meta.realmAt(n.spawn.tx, n.spawn.ty).id) this.markers.set(id, '!');
        continue;
      }
      const service = n.spawn.role === 'merchant' || n.spawn.role === 'barber';
      if (service && !log.active.some((q) => q.objective.type === 'deliver' && q.objective.npcId === id)) continue;
      const own = log.active.find((q) => q.giverId === id);
      if ((own && isReady(own)) || log.active.some((q) => q.objective.type === 'deliver' && q.objective.npcId === id && !isReady(q))) this.markers.set(id, '?');
      else if (!service && !own && log.active.length < MAX_ACTIVE && this.cachedOffer(n.spawn, now)) this.markers.set(id, '!');
    }
  }

  endTalk(): void {
    this.dialogOpen = false;
    this.pendingActions = [];
    if (this.talkingTo) this.talkingTo.talking = false;
    this.talkingTo = null;
    this.ws.events.emit('talk', null);
    debugState.dialog = null;
  }
}
