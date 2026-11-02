/**
 * World Building: Reiche, Fraktionen, Siedlungen mit Gebäuden, Geheimnisse (Truhen, Schreine, Obelisken)
 * und die Chronik der Welt. Alles deterministisch aus dem Seed. Rein, ohne Phaser.
 */
import { B, BIOMES } from './biomes';
import { Simplex2 } from './noise';
import { hash2, mulberry32 } from './rng';
import { layoutTown } from './townLayout';
import { CHUNK_TILES, MOUNTAIN_H, PEAK_H, RUGGED_H, SCALE, SEA_LEVEL, WORLD_TILES } from './WorldGen';

/** Was die Metadaten von der Landschaft brauchen (vermeidet zirkuläre Abhängigkeit zu WorldGen). */
export interface Terrain {
  readonly seed: number;
  /** Biom ohne Flüsse (die Flüsse entstehen erst hier). */
  biomeAt(tx: number, ty: number): B;
  /** Geländehöhe (für den Lauf der Flüsse); fehlt sie, gibt es keine Flüsse. */
  elevationAt?(x: number, y: number): number;
}

export type Faction = 'mages' | 'techno' | 'clan' | 'traders' | 'order';

export const FACTIONS: Record<Faction, { name: string; the: string; style: 'fantasy' | 'cyber' | 'mixed'; motto: string }> = {
  mages: { name: 'Magierzirkel', the: 'der Magierzirkel', style: 'fantasy', motto: 'Wissen ist die älteste Macht.' },
  techno: { name: 'Technokratie', the: 'die Technokratie', style: 'cyber', motto: 'Der Fortschritt kennt kein Zurück.' },
  clan: { name: 'Klan', the: 'der Klan', style: 'fantasy', motto: 'Blut, Erde und Ehre.' },
  traders: { name: 'Freie Händler', the: 'die Freien Händler', style: 'mixed', motto: 'Alles hat seinen Preis.' },
  order: { name: 'Orden des Lichts', the: 'der Orden des Lichts', style: 'fantasy', motto: 'Das Licht wacht über alle.' },
};

export interface Realm {
  id: number;
  name: string;
  faction: Faction;
  color: number;
  tx: number;
  ty: number;
  capital: number;
}

export type BuildingKind = 'house' | 'tower' | 'neonhouse' | 'stall' | 'well' | 'wall' | 'rubble' | 'field';

export interface Building {
  kind: BuildingKind;
  tx: number;
  ty: number;
  variant: number;
}

export interface Settlement {
  id: number;
  name: string;
  realm: number;
  capital: boolean;
  tx: number;
  ty: number;
  radius: number;
  buildings: Building[];
  /** Größenstufe (nur mit Vorgeschichte: 0 Weiler … 4 Großstadt) */
  tier?: number;
}

export type PoiKind = 'chest' | 'shrine' | 'obelisk' | 'ruinchest' | 'tomb' | 'memorial' | 'lair';

export interface Ruin {
  id: number;
  tx: number;
  ty: number;
  realm: number;
  /** Ort der Vorgeschichte (nur mit `?vorgeschichte=1`) */
  site?: number;
}

export interface Poi {
  id: string;
  kind: PoiKind;
  tx: number;
  ty: number;
  /** Für Obelisken: Index des Chronik-Fragments */
  fragment?: number;
  /** Ort der Vorgeschichte (Grabmal, Gedenkstein, Hort) */
  site?: number;
}

/**
 * Vorgaben aus der simulierten Vorgeschichte (`src/history/toWorld.ts`): ersetzen die zufällige Platzierung von
 * Reichen, Orten, Ruinen, Obelisken und Chronik. Flüsse und Wege entstehen wie sonst.
 */
export interface MetaSource {
  realms: Omit<Realm, 'capital'>[];
  rivals: number[];
  settlements: {
    name: string; realm: number; capital: boolean; tx: number; ty: number; site: number;
    /** Stadtplan-Vorgaben (`src/history/towns.ts`) */
    town: { tier: number; buildings: number; radius: number; wall: number; decay: number };
  }[];
  ruins: { tx: number; ty: number; realm: number; site: number }[];
  /** Ankerpunkte der acht Obelisken (in der Nähe wird ein freier Platz gesucht) */
  obelisks: { tx: number; ty: number }[];
  lore: Lore;
  rivers: Set<number>;
  /** Historische Fundorte */
  pois: { kind: 'tomb' | 'memorial' | 'lair'; tx: number; ty: number; site: number }[];
  /** Reich je Zelle der Vorgeschichte (Index in `realms`), `cell` Kacheln je Zelle */
  realmGrid: { grid: Int8Array; size: number; cell: number };
}

export const OBELISKS = 8;

const REALM_COLORS = [0xe0b030, 0x2fe0d8, 0xe04a5a, 0x9b6af0, 0x4cb53e, 0xf08a3a];
const SYL_A = ['Esch', 'Raben', 'Mond', 'Silber', 'Eisen', 'Neon', 'Kristall', 'Sturm', 'Dorn', 'Glut', 'Nebel', 'Stern', 'Chrom', 'Weiden', 'Falken'];
const SYL_B = ['wald', 'furt', 'hafen', 'brück', 'heim', 'stein', 'tal', 'hall', 'burg', 'grund', 'feld', 'wacht', 'tor', 'quell'];
const REALM_A = ['Var', 'El', 'Thar', 'Ny', 'Kor', 'Ae', 'Zan', 'Mor', 'Ili', 'Dra', 'Sev', 'Ost'];
const REALM_B = ['ion', 'dor', 'heim', 'ra', 'vik', 'thal', 'kor', 'esse', 'mark', 'yr', 'ane', 'gard'];

const pick = <T>(rnd: () => number, a: readonly T[]) => a[Math.floor(rnd() * a.length)];

/** Fisher-Yates-Mischen (deterministisch mit dem gegebenen Zufall). */
function shuffle<T>(a: T[], rnd: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const GOOD = new Set<B>([B.Hills, B.Grassland, B.Forest, B.Savanna, B.Beach, B.Tundra, B.Desert, B.CrystalGrove, B.ScrapWastes, B.Jungle, B.Snow]);

export class WorldMeta {
  readonly realms: Realm[] = [];
  /** Erzrivale je Reich (symmetrische Paare, M15) */
  readonly rivals: number[] = [];
  readonly settlements: Settlement[] = [];
  readonly obelisks: Poi[] = [];
  readonly ruins: Ruin[] = [];
  private readonly ruinIndex = new Map<string, Ruin>();
  readonly lore: Lore;
  private readonly warp: Simplex2;
  private readonly buildingIndex = new Map<string, Building>();
  private readonly obeliskIndex = new Map<string, Poi>();

  /** Vorgeschichte, aus der diese Welt entstand (nur mit `?vorgeschichte=1`). */
  readonly source?: MetaSource;
  /** Historische Fundorte (Grabmal, Gedenkstein, Hort) */
  readonly historic: Poi[] = [];
  private readonly historicIndex = new Map<string, Poi>();

  constructor(private readonly t: Terrain, source?: MetaSource) {
    const rnd = mulberry32(t.seed ^ 0x3e7a);
    this.warp = new Simplex2(t.seed ^ 0x51a7);
    if (source) {
      this.source = source;
      this.lore = source.lore;
      this.fromSource(source, rnd);
      return;
    }
    this.placeRealms(rnd);
    this.pairRivals();
    this.placeSettlements(rnd);
    this.placeObelisks(rnd);
    this.placeRuins(rnd);
    this.lore = generateLore(t.seed, this);
    this.buildRivers();
    this.buildRoads();
  }

  /** Welt aus der Vorgeschichte: Reiche, Orte, Ruinen und Fundorte stehen fest (Phase 3 des Prototyps). */
  private fromSource(src: MetaSource, rnd: () => number): void {
    for (const r of src.realms) this.realms.push({ ...r, capital: -1 });
    this.rivals.push(...src.rivals);
    for (const st of src.settlements) {
      const realm = this.realms[st.realm];
      const s: Settlement = { id: this.settlements.length, name: st.name, realm: st.realm, capital: st.capital, tx: st.tx, ty: st.ty, radius: st.town.radius, buildings: [], tier: st.town.tier };
      this.townFromHistory(s, st, src);
      this.settlements.push(s);
      if (st.capital) realm.capital = s.id;
    }
    for (const r of this.realms) if (r.capital < 0) r.capital = this.settlements.find((s) => s.realm === r.id)?.id ?? 0;
    for (const r of src.ruins) {
      const ruin: Ruin = { id: this.ruins.length, tx: r.tx, ty: r.ty, realm: r.realm, site: r.site };
      this.ruins.push(ruin);
      this.ruinIndex.set(`${r.tx},${r.ty}`, ruin);
    }
    for (const p of src.pois) {
      const poi: Poi = { id: `${p.kind}:${p.site}`, kind: p.kind, tx: p.tx, ty: p.ty, site: p.site };
      this.historic.push(poi);
      this.historicIndex.set(`${p.tx},${p.ty}`, poi);
    }
    src.obelisks.forEach((a, i) => {
      for (let k = 0; k < 60; k++) {
        const p = this.landPoint(rnd, a.tx, a.ty, 18 + k);
        if (!p || this.settlementNear(p.tx, p.ty, 12) || this.ruinNear(p.tx, p.ty, 6) || this.historicNear(p.tx, p.ty, 5)) continue;
        if (src.rivers.has(p.tx * 65536 + p.ty)) continue;
        const o: Poi = { id: `ob${i}`, kind: 'obelisk', tx: p.tx, ty: p.ty, fragment: i };
        this.obelisks.push(o);
        this.obeliskIndex.set(`${p.tx},${p.ty}`, o);
        return;
      }
    });
    // Flüsse der Vorgeschichte; Stadtpläne weichen ihnen aus (Flüsse fließen durch Städte), Fundorte bleiben trocken
    for (const k of src.rivers) {
      const tx = Math.floor(k / 65536);
      const ty = k % 65536;
      if (this.buildingIndex.has(`${tx},${ty}`) || this.plazaTiles.has(k) || this.ruinNear(tx, ty, 5) || this.historicNear(tx, ty, 3)) continue;
      if (this.obelisks.some((o) => Math.abs(o.tx - tx) <= 3 && Math.abs(o.ty - ty) <= 3)) continue;
      this.rivers.add(k);
    }
    this.buildRoads();
  }

  /** Historischer Fundort in der Nähe (Grabmal, Gedenkstein, Hort). */
  historicNear(tx: number, ty: number, radius: number): Poi | null {
    for (const p of this.historic) if (Math.abs(p.tx - tx) <= radius && Math.abs(p.ty - ty) <= radius) return p;
    return null;
  }

  /** Flusskacheln (Schlüssel tx * 65536 + ty) und Brücken (Pfad über Fluss). */
  private readonly rivers = new Set<number>();
  readonly bridges = new Set<number>();

  /** Fluss (true), Brücke ('bridge') oder nichts an einer Kachel. */
  waterAt(tx: number, ty: number): 'river' | 'bridge' | null {
    const k = tx * 65536 + ty;
    return this.bridges.has(k) ? 'bridge' : this.rivers.has(k) ? 'river' : null;
  }

  /**
   * Flüsse (M19): entspringen im Gebirge und folgen dem steilsten Gefälle bis zum Meer; werden dabei breiter.
   * Orte, Ruinen und Obelisken bleiben trocken. Eigener Zufallsstrom → die übrige Welt bleibt gleich.
   */
  private buildRivers(): void {
    if (!this.t.elevationAt) return;
    const dry = (tx: number, ty: number) =>
      !!this.settlementNear(tx, ty, 3) || !!this.ruinNear(tx, ty, 5) || this.obelisks.some((o) => Math.abs(o.tx - tx) <= 3 && Math.abs(o.ty - ty) <= 3);
    for (const k of traceRivers(this.t, this.warp, dry)) this.rivers.add(k);
  }

  /** Kacheln der Trampelpfade zwischen den Orten (Schlüssel tx * 65536 + ty). */
  private readonly roads = new Set<number>();

  /**
   * Trampelpfade (M19): jeder Ort mit seinen zwei nächsten Nachbarn, leicht geschwungen, zwei Kacheln breit.
   * Wasser und Felsgipfel unterbrechen den Pfad. Läuft nach allem anderen, damit die übrige Welt gleich bleibt.
   */
  private buildRoads(): void {
    const pairs = new Set<string>();
    for (const a of this.settlements) {
      const near = this.settlements
        .filter((b) => b !== a)
        .map((b) => ({ b, d: Math.hypot(b.tx - a.tx, b.ty - a.ty) }))
        .filter((x) => x.d < 700 * SCALE)
        .sort((x, y) => x.d - y.d)
        .slice(0, 2);
      for (const { b } of near) pairs.add(a.id < b.id ? `${a.id},${b.id}` : `${b.id},${a.id}`);
    }
    for (const key of pairs) {
      const [a, b] = key.split(',').map((i) => this.settlements[Number(i)]);
      const len = Math.hypot(b.tx - a.tx, b.ty - a.ty);
      const nx = -(b.ty - a.ty) / len;
      const ny = (b.tx - a.tx) / len;
      const steps = Math.ceil(len);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Schlängeln: seitlicher Versatz, an den Enden null
        const off = this.warp.noise(a.id * 7.3 + t * len / 90, b.id * 3.1) * Math.min(1, len / 80) * 26 * Math.sin(Math.PI * t);
        const x = Math.round(a.tx + (b.tx - a.tx) * t + nx * off);
        const y = Math.round(a.ty + (b.ty - a.ty) * t + ny * off);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
          const key = (x + dx) * 65536 + y + dy;
          if (this.roads.has(key) || this.bridges.has(key)) continue;
          // Im Ort übernimmt der gepflasterte Kreuzweg
          if (this.settlementNear(x + dx, y + dy)) continue;
          // Über Flüsse führt eine Brücke
          if (this.rivers.has(key)) this.bridges.add(key);
          else if (this.walkableGround(x + dx, y + dy)) this.roads.add(key);
        }
      }
    }
  }

  /** Begehbarer Boden (ohne Wasser und Gipfel); mit Höhe statt vollem Klima, falls verfügbar. */
  private walkableGround(tx: number, ty: number): boolean {
    if (!this.t.elevationAt) return BIOMES[this.t.biomeAt(tx, ty)].walkable;
    const h = (this.t.elevationAt(tx + 0.5, ty + 0.5) - SEA_LEVEL) / (1 - SEA_LEVEL);
    return h >= 0 && h <= PEAK_H;
  }

  /** Liegt auf der Kachel ein Trampelpfad? */
  isRoad(tx: number, ty: number): boolean {
    return this.roads.has(tx * 65536 + ty);
  }

  private isGood(tx: number, ty: number, r = 1): boolean {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!GOOD.has(this.t.biomeAt(tx + dx * 2, ty + dy * 2))) return false;
    // Nicht im zerklüfteten Gebirge (M24: dort gibt es Klippen)
    if (this.t.elevationAt && (this.t.elevationAt(tx + 0.5, ty + 0.5) - SEA_LEVEL) / (1 - SEA_LEVEL) > RUGGED_H - 0.02) return false;
    return true;
  }

  private landPoint(rnd: () => number, cx = WORLD_TILES / 2, cy = WORLD_TILES / 2, spread = WORLD_TILES * 0.36): { tx: number; ty: number } | null {
    for (let i = 0; i < 400; i++) {
      const tx = Math.round(cx + (rnd() * 2 - 1) * spread);
      const ty = Math.round(cy + (rnd() * 2 - 1) * spread);
      if (tx < 40 || ty < 40 || tx >= WORLD_TILES - 40 || ty >= WORLD_TILES - 40) continue;
      if (this.isGood(tx, ty, 1)) return { tx, ty };
    }
    return null;
  }

  private placeRealms(rnd: () => number): void {
    const factions: Faction[] = ['mages', 'techno', 'clan', 'traders', 'order', rnd() < 0.5 ? 'techno' : 'mages'];
    for (let i = 0; i < 6; i++) {
      let best: { tx: number; ty: number } | null = null;
      let bestD = -1;
      // Best-Candidate-Sampling für gut verteilte Reichszentren
      for (let k = 0; k < 12; k++) {
        const p = this.landPoint(rnd);
        if (!p) continue;
        const d = Math.min(1e9, ...this.realms.map((r) => Math.hypot(r.tx - p.tx, r.ty - p.ty)));
        if (d > bestD) {
          bestD = d;
          best = p;
        }
      }
      const p = best ?? { tx: WORLD_TILES / 2, ty: WORLD_TILES / 2 };
      const faction = factions[i];
      let base = `${pick(rnd, REALM_A)}${pick(rnd, REALM_B)}`;
      for (let k = 0; k < 10 && this.realms.some((r) => r.name.startsWith(base)); k++) base = `${pick(rnd, REALM_A)}${pick(rnd, REALM_B)}`;
      const name = faction === 'techno' ? `${base}-${pick(rnd, ['Kor', 'Prime', 'Null', 'IX'])}` : base;
      this.realms.push({ id: i, name, faction, color: REALM_COLORS[i], tx: p.tx, ty: p.ty, capital: -1 });
    }
  }

  /** Aktuelle Macht je Reich (aus der Simulation, M10); gewichtet die Grenzen. */
  powers: number[] | null = null;

  /** Reiche paarweise verfeinden (eigener Zufallsstrom, damit die übrige Welt gleich bleibt). */
  private pairRivals(): void {
    const rnd = mulberry32(this.t.seed ^ 0x77ab);
    const ids = shuffle(this.realms.map((r) => r.id), rnd);
    for (let i = 0; i + 1 < ids.length; i += 2) {
      this.rivals[ids[i]] = ids[i + 1];
      this.rivals[ids[i + 1]] = ids[i];
    }
  }

  /** Reich einer Kachel (nächstes Zentrum, nach Macht gewichtet, Grenzen verwirbelt). */
  realmAt(tx: number, ty: number): Realm {
    const wx = tx + this.warp.noise(tx / (180 * SCALE), ty / (180 * SCALE)) * 70 * SCALE;
    const wy = ty + this.warp.noise(tx / (180 * SCALE) + 40, ty / (180 * SCALE) - 40) * 70 * SCALE;
    if (this.source) {
      // Grenzen aus der Vorgeschichte (verwirbelt, damit sie nicht dem Zellraster folgen)
      const g = this.source.realmGrid;
      const cx = Math.max(0, Math.min(g.size - 1, Math.floor(wx / g.cell)));
      const cy = Math.max(0, Math.min(g.size - 1, Math.floor(wy / g.cell)));
      return this.realms[g.grid[cy * g.size + cx]] ?? this.realms[0];
    }
    let best = this.realms[0];
    let bd = Infinity;
    for (const r of this.realms) {
      const p = this.powers?.[r.id] ?? 1;
      const d = ((r.tx - wx) ** 2 + (r.ty - wy) ** 2) / (p * p);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  private placeSettlements(rnd: () => number): void {
    const add = (realm: Realm, tx: number, ty: number, capital: boolean) => {
      if (this.settlements.some((s) => Math.hypot(s.tx - tx, s.ty - ty) < 40)) return;
      let name = `${pick(rnd, SYL_A)}${pick(rnd, SYL_B)}`;
      for (let k = 0; k < 10 && this.settlements.some((o) => o.name === name); k++) name = `${pick(rnd, SYL_A)}${pick(rnd, SYL_B)}`;
      const s: Settlement = {
        id: this.settlements.length,
        name,
        realm: realm.id,
        capital,
        tx,
        ty,
        radius: capital ? 10 : 7,
        buildings: [],
      };
      this.layout(s, realm, rnd);
      this.settlements.push(s);
      if (capital) realm.capital = s.id;
    };
    for (const r of this.realms) {
      add(r, r.tx, r.ty, true);
      // Größere Welt → mehr Dörfer je Reich, damit die Ortsdichte gleich bleibt
      const villages = Math.round((2 + Math.floor(rnd() * 3)) * SCALE * 1.4);
      for (let v = 0; v < villages; v++) {
        const p = this.landPoint(rnd, r.tx, r.ty, 260 * SCALE);
        if (p && this.realmAt(p.tx, p.ty).id === r.id) add(r, p.tx, p.ty, false);
      }
    }
  }

  /** Gepflasterte Kacheln der Stadtpläne aus der Vorgeschichte (Schlüssel tx * 65536 + ty). */
  private readonly plazaTiles = new Set<number>();

  private clearCache?: Set<number>;

  /** Kacheln, die Stadtpläne freilassen: um Fundorte (Grabmal vor den Toren) und Ruinen. */
  private keepClear(src: MetaSource): Set<number> {
    if (this.clearCache) return this.clearCache;
    const out = new Set<number>();
    const mark = (tx: number, ty: number, r: number) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) out.add((tx + dx) * 65536 + ty + dy);
    };
    for (const p of src.pois) mark(p.tx, p.ty, 3);
    for (const r of src.ruins) mark(r.tx, r.ty, 6);
    this.clearCache = out;
    return out;
  }

  /** Stadtplan aus der Vorgeschichte (`townLayout.ts`): Größe, Mauer und Verfall stammen aus der Geschichte des Ortes. */
  private townFromHistory(s: Settlement, st: MetaSource['settlements'][number], src: MetaSource): void {
    const realm = this.realms[s.realm];
    // Hauptstraßen und Tore zeigen zu den nächsten Nachbarorten
    const others = src.settlements.filter((o) => o !== st).map((o) => ({ o, d: Math.hypot(o.tx - st.tx, o.ty - st.ty) })).sort((a, b) => a.d - b.d);
    const dirs = others.slice(0, 3).filter((x) => x.d < 900).map((x) => Math.atan2(x.o.ty - st.ty, x.o.tx - st.tx));
    const maxRadius = Math.max(8, (others[0]?.d ?? 400) / 2 - 3);
    const out = layoutTown(
      { tx: s.tx, ty: s.ty, ...st.town, style: FACTIONS[realm.faction].style, dirs, fields: st.town.tier <= 3, seed: hash2(this.t.seed, s.tx, s.ty, 7070), maxRadius },
      (tx, ty) => this.isGood(tx, ty, 0) && !src.rivers.has(tx * 65536 + ty) && !this.keepClear(src).has(tx * 65536 + ty),
    );
    s.radius = out.radius;
    for (const p of out.pieces) {
      const b: Building = { kind: p.kind, tx: p.tx, ty: p.ty, variant: p.variant };
      s.buildings.push(b);
      this.buildingIndex.set(`${b.tx},${b.ty}`, b);
    }
    for (const k of out.streets) this.plazaTiles.add(k);
  }

  /** Gebäude um den Platz verteilen (Ring-Raster), nur auf begehbarem Land. */
  private layout(s: Settlement, realm: Realm, rnd: () => number): void {
    const style = FACTIONS[realm.faction].style;
    const kinds: BuildingKind[] = style === 'cyber' ? ['neonhouse', 'neonhouse', 'tower', 'house'] : style === 'mixed' ? ['house', 'neonhouse', 'house', 'tower'] : ['house', 'house', 'tower', 'house'];
    s.buildings.push({ kind: 'well', tx: s.tx, ty: s.ty, variant: style === 'cyber' ? 1 : 0 });
    s.buildings.push({ kind: 'stall', tx: s.tx + 3, ty: s.ty + 2, variant: Math.floor(rnd() * 4) });
    // Zweiter Durchgang mit lockereren Regeln, falls das Gelände eng ist
    for (let pass = 0; pass < 2 && s.buildings.length < 7; pass++) {
      for (let gy = -s.radius; gy <= s.radius; gy += 4) {
        for (let gx = -s.radius; gx <= s.radius; gx += 4) {
          const d = Math.hypot(gx, gy);
          if (d < 4.5 || d > s.radius) continue;
          if (pass === 0 && rnd() < 0.25) continue;
          const tx = s.tx + gx + (pass === 0 ? Math.floor(rnd() * 2) : 0);
          const ty = s.ty + gy;
          if (s.buildings.some((b) => Math.abs(b.tx - tx) < 3 && Math.abs(b.ty - ty) < 3)) continue;
          if (!this.isGood(tx, ty, pass === 0 ? 1 : 0)) continue;
          s.buildings.push({ kind: pick(rnd, kinds), tx, ty, variant: Math.floor(rnd() * 4) });
        }
      }
    }
    for (const b of s.buildings) this.buildingIndex.set(`${b.tx},${b.ty}`, b);
  }

  private placeObelisks(rnd: () => number): void {
    for (let i = 0; i < OBELISKS; i++) {
      const r = this.realms[i % this.realms.length];
      for (let k = 0; k < 40; k++) {
        const p = this.landPoint(rnd, r.tx, r.ty, 320 * SCALE);
        if (!p) continue;
        if (this.settlementNear(p.tx, p.ty, 25)) continue;
        if (this.obelisks.some((o) => Math.hypot(o.tx - p.tx, o.ty - p.ty) < 60 * SCALE)) continue;
        const o: Poi = { id: `ob${i}`, kind: 'obelisk', tx: p.tx, ty: p.ty, fragment: i };
        this.obelisks.push(o);
        this.obeliskIndex.set(`${p.tx},${p.ty}`, o);
        break;
      }
    }
  }

  /** Drei Ruinen je Reich, abseits von Orten und Obelisken (M14). */
  private placeRuins(rnd: () => number): void {
    for (const r of this.realms) {
      for (let n = 0; n < 3 * SCALE; n++) {
        for (let k = 0; k < 40; k++) {
          const p = this.landPoint(rnd, r.tx, r.ty, 340 * SCALE);
          if (!p || this.settlementNear(p.tx, p.ty, 30)) continue;
          if (this.obelisks.some((o) => Math.hypot(o.tx - p.tx, o.ty - p.ty) < 25)) continue;
          if (this.ruins.some((o) => Math.hypot(o.tx - p.tx, o.ty - p.ty) < 80)) continue;
          if (!this.isGood(p.tx + 2, p.ty + 1, 0)) continue;
          const ruin: Ruin = { id: this.ruins.length, tx: p.tx, ty: p.ty, realm: r.id };
          this.ruins.push(ruin);
          this.ruinIndex.set(`${p.tx},${p.ty}`, ruin);
          break;
        }
      }
    }
  }

  ruinAt(tx: number, ty: number): Ruin | undefined {
    return this.ruinIndex.get(`${tx},${ty}`);
  }

  ruinNear(tx: number, ty: number, radius: number): Ruin | null {
    for (const r of this.ruins) if (Math.abs(r.tx - tx) <= radius && Math.abs(r.ty - ty) <= radius) return r;
    return null;
  }

  /** Siedlung, in deren Umkreis (+ Rand) die Kachel liegt. */
  settlementNear(tx: number, ty: number, margin = 0): Settlement | null {
    for (const s of this.settlements) if (Math.hypot(s.tx - tx, s.ty - ty) <= s.radius + margin) return s;
    return null;
  }

  /** Gepflasterter Platz (Ortsmitte und Wege). */
  isPlaza(tx: number, ty: number): boolean {
    if (this.source) return this.plazaTiles.has(tx * 65536 + ty);
    for (const s of this.settlements) {
      const dx = tx - s.tx;
      const dy = ty - s.ty;
      if (dx * dx + dy * dy <= 9) return true;
      // Kreuzweg durch den Ort
      if ((Math.abs(dx) <= 0 && Math.abs(dy) <= s.radius) || (Math.abs(dy) <= 0 && Math.abs(dx) <= s.radius)) return true;
    }
    return false;
  }

  buildingAt(tx: number, ty: number): Building | undefined {
    return this.buildingIndex.get(`${tx},${ty}`);
  }

  /** Truhe, Schrein oder Obelisk auf einer Kachel. */
  poiAt(tx: number, ty: number): Poi | null {
    const o = this.obeliskIndex.get(`${tx},${ty}`) ?? this.historicIndex.get(`${tx},${ty}`);
    if (o) return o;
    const r = this.ruinIndex.get(`${tx - 2},${ty - 1}`);
    if (r) return { id: `ruinchest:${tx},${ty}`, kind: 'ruinchest', tx, ty };
    const cx = Math.floor(tx / CHUNK_TILES);
    const cy = Math.floor(ty / CHUNK_TILES);
    const p = this.chunkPoi(cx, cy);
    return p && p.tx === tx && p.ty === ty ? p : null;
  }

  /** Höchstens ein zufälliges Geheimnis pro Chunk (Truhe 5 %, Schrein 2 %). */
  chunkPoi(cx: number, cy: number): Poi | null {
    if (this.source && this.historicNear(cx * CHUNK_TILES + 8, cy * CHUNK_TILES + 8, 12)) return null;
    const rnd = mulberry32(hash2(this.t.seed, cx, cy, 1313));
    const roll = rnd();
    const kind: PoiKind | null = roll < 0.05 ? 'chest' : roll < 0.07 ? 'shrine' : null;
    if (!kind) return null;
    const tx = cx * CHUNK_TILES + 2 + Math.floor(rnd() * (CHUNK_TILES - 4));
    const ty = cy * CHUNK_TILES + 2 + Math.floor(rnd() * (CHUNK_TILES - 4));
    if (!BIOMES[this.t.biomeAt(tx, ty)].walkable || this.settlementNear(tx, ty, 3)) return null;
    return { id: `${kind}:${tx},${ty}`, kind, tx, ty };
  }
}

/**
 * Flussläufe (M19) als Kachelschlüssel (tx * 65536 + ty). `keepDry` hält Kacheln trocken (Orte, Ruinen …).
 * Auch für die Vorgeschichte nutzbar, die die Flüsse vor den Orten braucht.
 */
export function traceRivers(t: Terrain, warp: Simplex2, keepDry: (tx: number, ty: number) => boolean = () => false): Set<number> {
  const rivers = new Set<number>();
  if (!t.elevationAt) return rivers;
  const elev = t.elevationAt.bind(t);
  const rnd = mulberry32(t.seed ^ 0x7177);
  let riverCount = 0;
  const want = 3 * SCALE * SCALE;
  const STEP = 6;
  for (let tries = 0; tries < want * 60 && riverCount < want; tries++) {
    const sx = Math.round(WORLD_TILES * (0.1 + rnd() * 0.8));
    const sy = Math.round(WORLD_TILES * (0.1 + rnd() * 0.8));
    // Quelle im Gebirge (nur Höhe prüfen, das volle Klima ist teurer)
    const h0 = (elev(sx, sy) - SEA_LEVEL) / (1 - SEA_LEVEL);
    if (h0 <= MOUNTAIN_H || h0 > PEAK_H) continue;
    const path: { x: number; y: number }[] = [{ x: sx, y: sy }];
    let x = sx;
    let y = sy;
    let dir = rnd() * Math.PI * 2;
    let ok = false;
    // Grobe Zellen, die der Fluss schon durchflossen hat (kein Kreisen)
    const seen = new Set<number>([Math.floor(sx / 12) * 4096 + Math.floor(sy / 12)]);
    for (let n = 0; n < 400; n++) {
      const here = elev(x, y);
      let best: { x: number; y: number; e: number; a: number } | null = null;
      // Richtung Küste: Der Kontinent fällt zum Rand hin ab, kleine Senken im Flachland werden so überwunden
      const ox = x - WORLD_TILES / 2;
      const oy = y - WORLD_TILES / 2;
      const ol = Math.hypot(ox, oy) || 1;
      for (let k = -2; k <= 2; k++) {
        const a = dir + k * 0.45;
        const nx = x + Math.cos(a) * STEP;
        const ny = y + Math.sin(a) * STEP;
        // Mäander: leichtes Rauschen auf der Höhe, damit der Fluss nicht schnurgerade läuft
        const cell = Math.floor(nx / 12) * 4096 + Math.floor(ny / 12);
        const cur = Math.floor(x / 12) * 4096 + Math.floor(y / 12);
        if (cell !== cur && seen.has(cell)) continue;
        const e = elev(nx, ny) + warp.noise(nx / 40, ny / 40) * 0.0015 - ((Math.cos(a) * ox + Math.sin(a) * oy) / ol) * 0.002;
        if (!best || e < best.e) best = { x: nx, y: ny, e, a };
      }
      if (!best || best.e > here + 0.006) break; // Senke: der Fluss endet in einem See
      seen.add(Math.floor(best.x / 12) * 4096 + Math.floor(best.y / 12));
      x = best.x;
      y = best.y;
      dir = best.a;
      path.push({ x, y });
      if (best.e - warp.noise(x / 40, y / 40) * 0.0015 < SEA_LEVEL - 0.002 || elev(x, y) < SEA_LEVEL) {
        ok = true;
        break;
      }
    }
    if (path.length < 30) continue;
    riverCount++;
    // Rastern: Breite wächst mit der Länge (1 → 3 Kacheln); jede Kachel nur einmal prüfen
    const cand = new Set<number>();
    for (let i = 1; i < path.length; i++) {
      const r = 0.6 + Math.min(1.2, (i * STEP) / 500);
      const a = path[i - 1];
      const b = path[i];
      for (let t = 0; t < 1; t += 0.25) {
        const cx = a.x + (b.x - a.x) * t;
        const cy = a.y + (b.y - a.y) * t;
        for (let ty = Math.floor(cy - r); ty <= Math.ceil(cy + r); ty++) {
          for (let tx = Math.floor(cx - r); tx <= Math.ceil(cx + r); tx++) {
            if ((tx + 0.5 - cx) ** 2 + (ty + 0.5 - cy) ** 2 <= r * r) cand.add(tx * 65536 + ty);
          }
        }
      }
    }
    if (!ok) {
      // Kein Meer erreicht: See am Ende
      const end = path[path.length - 1];
      const lr = 4 + rnd() * 3;
      for (let ty = Math.floor(end.y - lr); ty <= Math.ceil(end.y + lr); ty++) {
        for (let tx = Math.floor(end.x - lr * 1.4); tx <= Math.ceil(end.x + lr * 1.4); tx++) {
          if (((tx + 0.5 - end.x) / 1.4) ** 2 + (ty + 0.5 - end.y) ** 2 <= lr * lr) cand.add(tx * 65536 + ty);
        }
      }
    }
    for (const key of cand) {
      if (rivers.has(key)) continue;
      const tx = Math.floor(key / 65536);
      const ty = key % 65536;
      // Nur auf Land unterhalb der Gipfel; Orte, Ruinen und Obelisken bleiben trocken
      const e = elev(tx + 0.5, ty + 0.5);
      if (e < SEA_LEVEL || (e - SEA_LEVEL) / (1 - SEA_LEVEL) > PEAK_H) continue;
      if (keepDry(tx, ty)) continue;
      rivers.add(key);
    }
  }
  return rivers;
}

// ---------------------------------------------------------------- Chronik

export interface Lore {
  worldName: string;
  fragments: { title: string; text: string }[];
}

const EVENTS = [
  { nom: 'der Sternfall', dat: 'dem Sternfall', text: 'Ein Stern stürzte vom Himmel und zerbrach in tausend leuchtende Kristalle.' },
  { nom: 'die Große Stille', dat: 'der Großen Stille', text: 'Eines Morgens verstummten alle Winde, und aus der Stille wuchsen Kristalle aus dem Boden.' },
  { nom: 'die Spaltung', dat: 'der Spaltung', text: 'Ein Riss ging durch den Himmel, und aus ihm fiel Metall, das niemand geschmiedet hatte.' },
  { nom: 'die Lichterflut', dat: 'der Lichterflut', text: 'Eine Welle aus Licht rollte über das Land und weckte die Kristalle in der Erde.' },
];
const cap1 = (s: string) => s[0].toUpperCase() + s.slice(1);
const ARTIFACTS = [
  { nom: 'das Herz von {world}', acc: 'das Herz von {world}' },
  { nom: 'die Krone aus Glas', acc: 'die Krone aus Glas' },
  { nom: 'der Erste Kern', acc: 'den Ersten Kern' },
  { nom: 'das Sternenauge', acc: 'das Sternenauge' },
  { nom: 'die Runenmaschine', acc: 'die Runenmaschine' },
];
const THREATS = ['der Schatten unter den Gipfeln', 'der Hungernde Schwarm', 'die Rostkönigin', 'das Echo des Sterns', 'der Leere Wanderer'];

/** Seed-basierte Weltgeschichte in acht Fragmenten. */
export function generateLore(seed: number, meta: { realms: Realm[]; settlements: Settlement[]; rivals?: number[] }): Lore {
  const rnd = mulberry32(seed ^ 0x10de);
  const worldName = `${pick(rnd, ['Ael', 'Myr', 'Cal', 'Ther', 'Vey', 'Or'])}${pick(rnd, ['theron', 'dris', 'avon', 'ensia', 'galoth', 'umbra'])}`;
  const ev = pick(rnd, EVENTS);
  const art = pick(rnd, ARTIFACTS);
  const artifact = art.nom.replace('{world}', worldName);
  const artAcc = art.acc.replace('{world}', worldName);
  const threat = pick(rnd, THREATS);
  const age = 200 + Math.floor(rnd() * 800);
  const shuffled = shuffle([...meta.realms], rnd);
  // Der Krieg der Chronik ist der Streit eines Rivalenpaares (M15)
  const r1 = shuffled[0];
  const r2 = meta.rivals?.[r1.id] !== undefined ? meta.realms[meta.rivals[r1.id]] : shuffled[1];
  const cap = (r: Realm) => meta.settlements[r.capital]?.name ?? r.name;
  const f = (r: Realm) => FACTIONS[r.faction].the;
  return {
    worldName,
    fragments: [
      { title: 'I. Die Zeit davor', text: `Vor ${age} Jahren war ${worldName} ein stilles Land aus Wäldern und Wind. Niemand kannte Magie, niemand kannte Maschinen.` },
      { title: `II. ${cap1(ev.nom)}`, text: `${ev.text} Die Alten nennen es ${ev.nom}.` },
      { title: 'III. Die Splitter', text: 'Die Kristalle trugen Kraft in sich. Die einen sangen Zauber in sie hinein, die anderen bauten Maschinen um sie herum.' },
      { title: `IV. ${cap1(artifact)}`, text: `Aus dem größten Splitter schufen die ersten Gelehrten ${artAcc}. Wer es hielt, konnte Zauber und Maschine zugleich beherrschen.` },
      { title: 'V. Der Bruch', text: `Um ${artAcc} entbrannte Streit. ${cap1(f(r1))} von ${r1.name} und ${f(r2)} von ${r2.name} führten Krieg, bis ${artifact} verloren ging.` },
      { title: 'VI. Die Reiche', text: `Aus der Asche erhoben sich sechs Reiche. ${cap(r1)} und ${cap(r2)} wurden ihre stolzesten Städte – und blieben Rivalen.` },
      { title: `VII. ${cap1(threat)}`, text: `Doch mit ${ev.dat} war noch etwas gekommen, das nur geschlafen hatte: ${threat}. Die Irrlichter und Drohnen sind seine Vorboten.` },
      { title: 'VIII. Die Hoffnung', text: `Es heißt, wer alle Obelisken liest, findet ${artAcc} – und kann ${threat} ein zweites Mal bannen.` },
    ],
  };
}
