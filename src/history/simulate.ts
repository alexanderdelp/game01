/**
 * Vorgeschichte: Aus dem Seed läuft eine Weltgeschichte über Jahrhunderte (Jahresschritte) auf einem groben Raster
 * der echten Landschaft. Deterministisch, rein (ohne Phaser), auch im Web Worker lauffähig.
 */
import { B, BIOMES } from '../world/biomes';
import { FACTIONS, traceRivers, type Faction, type Terrain } from '../world/meta';
import { Simplex2 } from '../world/noise';
import { mulberry32 } from '../world/rng';
import { RUGGED_H, SEA_LEVEL, WORLD_TILES } from '../world/WorldGen';
import { reach } from './query';
import { ARTIFACT_KINDS, BEASTS, artifactName, beastName, personName, placeName, realmName, specialName, worldName } from './names';
import {
  HISTORY_CELL, HISTORY_GRID, INHABITED,
  type Artifact, type Cell, type Civ, type DeathCause, type EventKind, type Figure, type HEvent, type History, type Race, type Role, type Site, type SiteKind,
} from './types';

export interface HistoryOptions {
  /** Länge der Vorgeschichte in Jahren (300–1000). */
  years?: number;
}

export const DEFAULT_YEARS = 600;
/** Mindestens so viele Reiche überleben (das Spiel braucht sechs). */
const MIN_CIVS = 6;
/** Weiche Obergrenze bewohnter Orte in der ganzen Welt (das Spiel hat ohne Vorgeschichte ~55 Siedlungen). */
const MAX_SITES = 120;
const N = HISTORY_GRID;
const C = HISTORY_CELL;

const CIV_COLORS = [0xe0b030, 0x2fe0d8, 0xe04a5a, 0x9b6af0, 0x4cb53e, 0xf08a3a, 0x5a8ae0, 0xe070c0, 0xa0d040, 0xc0c0c0, 0x40a0a0, 0xd06040];

/** Wie gut ein Volk in einem Biom lebt (0–1). */
const PREF: Record<Race, Partial<Record<B, number>>> = {
  human: { [B.Grassland]: 1, [B.Forest]: 0.8, [B.Savanna]: 0.7, [B.Hills]: 0.6, [B.Beach]: 0.5, [B.Tundra]: 0.3 },
  elf: { [B.Forest]: 1, [B.Jungle]: 0.9, [B.CrystalGrove]: 1, [B.Grassland]: 0.4, [B.Swamp]: 0.3 },
  orc: { [B.Hills]: 1, [B.Savanna]: 0.9, [B.Desert]: 0.6, [B.Tundra]: 0.6, [B.Grassland]: 0.4, [B.Mountain]: 0.3 },
  synth: { [B.ScrapWastes]: 1, [B.Desert]: 0.4, [B.Grassland]: 0.3 },
};
const LIFESPAN: Record<Race, [number, number]> = { human: [50, 85], elf: [160, 320], orc: [40, 70], synth: [120, 260] };
const FERT: Partial<Record<B, number>> = {
  [B.Grassland]: 0.8, [B.Forest]: 0.6, [B.Savanna]: 0.6, [B.Jungle]: 0.5, [B.Hills]: 0.5, [B.Swamp]: 0.3, [B.Beach]: 0.4,
  [B.Tundra]: 0.2, [B.Desert]: 0.1, [B.Snow]: 0.05, [B.CrystalGrove]: 0.5, [B.ScrapWastes]: 0.15, [B.Mountain]: 0.1,
};
const WOOD: Partial<Record<B, number>> = { [B.Forest]: 0.9, [B.Jungle]: 1, [B.Swamp]: 0.5, [B.Tundra]: 0.4, [B.Grassland]: 0.2, [B.Savanna]: 0.2, [B.Hills]: 0.3 };
const ORE: Partial<Record<B, number>> = { [B.Mountain]: 0.9, [B.Snow]: 0.5, [B.Hills]: 0.6, [B.Desert]: 0.3, [B.Tundra]: 0.2 };
/** Wie in meta.ts: Boden, auf dem Orte entstehen dürfen. */
const GOOD = new Set<B>([B.Hills, B.Grassland, B.Forest, B.Savanna, B.Beach, B.Tundra, B.Desert, B.CrystalGrove, B.ScrapWastes, B.Jungle, B.Snow]);

interface War { a: number; b: number; start: number; battles: number; ev: number; wins: [number, number] }

class Sim {
  readonly rnd: () => number;
  readonly cells: Cell[] = [];
  readonly civs: Civ[] = [];
  readonly sites: Site[] = [];
  readonly figures: Figure[] = [];
  readonly artifacts: Artifact[] = [];
  readonly events: HEvent[] = [];
  readonly rivers: Set<number>;
  readonly worldName: string;
  /** Reich je Zelle im aktuellen Jahr (−1 = niemand) */
  owner = new Int16Array(N * N).fill(-1);
  wars: War[] = [];
  alliances = new Set<string>();
  shattering = 0;
  y = 0;
  private readonly elev: (x: number, y: number) => number;

  constructor(private readonly t: Terrain, readonly years: number) {
    this.rnd = mulberry32(t.seed ^ 0x4157);
    this.elev = t.elevationAt ? t.elevationAt.bind(t) : () => 0.5;
    this.worldName = worldName(mulberry32(t.seed ^ 0x10de));
    this.rivers = traceRivers(t, new Simplex2(t.seed ^ 0x51a7));
    this.buildCells();
  }

  // ------------------------------------------------------------ Geografie und Geologie

  private buildCells(): void {
    const shard = new Simplex2(this.t.seed ^ 0x5a1d);
    const ore = new Simplex2(this.t.seed ^ 0x0e0e);
    const riverCells = new Uint8Array(N * N);
    for (const k of this.rivers) {
      const tx = Math.floor(k / 65536);
      const ty = k % 65536;
      riverCells[Math.floor(ty / C) * N + Math.floor(tx / C)] = 1;
    }
    for (let cy = 0; cy < N; cy++) {
      for (let cx = 0; cx < N; cx++) {
        const tx = cx * C + C / 2;
        const ty = cy * C + C / 2;
        const b = this.t.biomeAt(tx, ty);
        const land = BIOMES[b].walkable;
        const h = Math.max(0, (this.elev(tx, ty) - SEA_LEVEL) / (1 - SEA_LEVEL));
        const river = riverCells[cy * N + cx] === 1;
        // Splitter-Adern: Kristallhaine und schmale Adern (Gratrauschen), bevorzugt im Bergland
        const vein = 1 - Math.abs(shard.noise(cx / 9, cy / 9));
        const sh = b === B.CrystalGrove ? 1 : vein > 0.93 ? 0.4 + (vein - 0.93) * 8 * (h > 0.2 ? 1 : 0.6) : 0;
        this.cells.push({
          land, biome: b, h, coast: false, river,
          fert: Math.min(1, (FERT[b] ?? 0) + (river ? 0.3 : 0)),
          wood: WOOD[b] ?? 0,
          ore: Math.min(1, (ORE[b] ?? 0) * (0.6 + 0.4 * (ore.noise(cx / 6, cy / 6) * 0.5 + 0.5))),
          shard: land ? Math.min(1, sh) : 0,
          scrap: b === B.ScrapWastes ? 1 : 0,
        });
      }
    }
    for (let cy = 0; cy < N; cy++) {
      for (let cx = 0; cx < N; cx++) {
        const c = this.cells[cy * N + cx];
        if (!c.land) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const o = this.cell(cx + dx, cy + dy);
          if (o && !o.land && o.biome !== B.Peak) c.coast = true;
          if (o && o.scrap === 1 && c.scrap === 0) c.scrap = 0.3;
        }
        if (c.coast) c.fert = Math.min(1, c.fert + 0.15);
      }
    }
  }

  cell(cx: number, cy: number): Cell | undefined {
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return undefined;
    return this.cells[cy * N + cx];
  }

  // ------------------------------------------------------------ Hilfen

  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.rnd() * a.length)];
  }

  ev(k: EventKind, refs: { civs?: number[]; figs?: number[]; sites?: number[]; arts?: number[]; n?: number; win?: number; cause?: string } = {}): HEvent {
    const e: HEvent = { id: this.events.length, y: this.y, k, civs: refs.civs ?? [], figs: refs.figs ?? [], sites: refs.sites ?? [], arts: refs.arts ?? [] };
    if (refs.n !== undefined) e.n = refs.n;
    if (refs.win !== undefined) e.win = refs.win;
    if (refs.cause !== undefined) e.cause = refs.cause;
    this.events.push(e);
    for (const c of e.civs) this.civs[c]?.events.push(e.id);
    for (const f of e.figs) this.figures[f]?.events.push(e.id);
    for (const s of e.sites) this.sites[s]?.events.push(e.id);
    return e;
  }

  ownerOf(s: Site): number {
    return s.owners[s.owners.length - 1].civ;
  }

  alive(s: Site): boolean {
    return s.destroyed === undefined && INHABITED.has(s.kind);
  }

  sitesOf(civ: number): Site[] {
    return this.sites.filter((s) => this.alive(s) && this.ownerOf(s) === civ);
  }

  aliveCivs(): Civ[] {
    return this.civs.filter((c) => c.fell === undefined);
  }

  isAlive(f: Figure): boolean {
    return f.died === undefined;
  }

  ruler(civ: Civ): Figure | undefined {
    const r = this.figures[civ.rulers[civ.rulers.length - 1]];
    return r && this.isAlive(r) ? r : undefined;
  }

  /** Begehbarer, ebener Baugrund wie `WorldMeta.isGood`. */
  private good(tx: number, ty: number, r = 1): boolean {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!GOOD.has(this.t.biomeAt(tx + dx * 2, ty + dy * 2))) return false;
    return (this.elev(tx + 0.5, ty + 0.5) - SEA_LEVEL) / (1 - SEA_LEVEL) <= RUGGED_H - 0.02;
  }

  private riverNear(tx: number, ty: number, r: number): boolean {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (this.rivers.has((tx + dx) * 65536 + ty + dy)) return true;
    return false;
  }

  /**
   * Kachelgenauer Platz in der Nähe eines Punktes. Bewohnte Orte halten 44 Kacheln Abstand untereinander
   * (wie die Siedlungen im Spiel), alle anderen Orte mindestens 34 zu bewohnten und 16 zu sonstigen.
   */
  place(cx: number, cy: number, kind: SiteKind, spread = C * 0.45): { tx: number; ty: number } | null {
    const settle = INHABITED.has(kind) || kind === 'relic';
    for (let i = 0; i < 30; i++) {
      const tx = Math.round(cx + (this.rnd() * 2 - 1) * spread);
      const ty = Math.round(cy + (this.rnd() * 2 - 1) * spread);
      if (tx < 60 || ty < 60 || tx >= WORLD_TILES - 60 || ty >= WORLD_TILES - 60) continue;
      let ok = true;
      for (const s of this.sites) {
        const d = Math.hypot(s.tx - tx, s.ty - ty);
        const sSettle = INHABITED.has(s.kind) || s.kind === 'relic';
        if (d < (settle && sSettle ? 44 : settle || sSettle ? 34 : 16)) {
          ok = false;
          break;
        }
      }
      if (!ok || !this.good(tx, ty, 1) || !this.good(tx + 2, ty + 1, 0)) continue;
      if (this.riverNear(tx, ty, settle ? 13 : 4)) continue;
      return { tx, ty };
    }
    return null;
  }

  addSite(kind: SiteKind, p: { tx: number; ty: number }, civ: number, name: string, pop: number): Site {
    const s: Site = { id: this.sites.length, kind, name, tx: p.tx, ty: p.ty, founded: this.y, owners: [{ y: this.y, civ }], pop, events: [], arts: [], buried: [] };
    this.sites.push(s);
    if (INHABITED.has(kind)) this.paintOwner(s);
    return s;
  }

  uniqueName(make: () => string): string {
    let n = make();
    for (let k = 0; k < 12 && this.sites.some((s) => s.name === n); k++) n = make();
    return n;
  }

  addFigure(role: Role, race: Race | 'beast', civ: number, age: number, parent?: number): Figure {
    const female = race !== 'beast' && race !== 'synth' && this.rnd() < 0.5;
    // Keine zwei Lebenden gleichen Namens
    const taken = (n: string) => this.figures.some((f) => f.name === n && f.died === undefined);
    let name = race === 'beast' ? beastName(this.rnd) : personName(this.rnd, race, female);
    for (let k = 0; k < 6 && taken(name); k++) name = race === 'beast' ? beastName(this.rnd) : personName(this.rnd, race, female);
    const f: Figure = { id: this.figures.length, name, race, female, role, civ, born: this.y - age, children: [], offices: [], events: [], holds: [], kills: 0 };
    if (parent !== undefined) {
      f.parent = parent;
      this.figures[parent].children.push(f.id);
    }
    this.figures.push(f);
    return f;
  }

  lifespan(f: Figure): number {
    if (f.race === 'beast') return 250 + ((f.id * 7919) % 300);
    const [a, b] = LIFESPAN[f.race];
    return a + ((f.id * 2654435761) >>> 0) % (b - a);
  }

  cellOf(s: { tx: number; ty: number }): [number, number] {
    return [Math.floor(s.tx / C), Math.floor(s.ty / C)];
  }

  /** Einflussgebiet eines Ortes (Radius in Zellen nach Größe). */
  reach(s: Site): number {
    return reach(s);
  }

  private paintOwner(s: Site): void {
    const [cx, cy] = this.cellOf(s);
    const civ = this.ownerOf(s);
    const r = this.reach(s);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const c = this.cell(cx + dx, cy + dy);
      if (!c || !c.land || dx * dx + dy * dy > r * r) continue;
      const i = (cy + dy) * N + cx + dx;
      if (this.owner[i] === -1) this.owner[i] = civ;
    }
  }

  /** Grenzen neu berechnen (nächster bewohnter Ort im Einflussgebiet). */
  recomputeOwner(): void {
    this.owner.fill(-1);
    const best = new Float32Array(N * N).fill(1e9);
    const size = new Map<number, number>();
    let total = 0;
    for (const s of this.sites) if (this.alive(s)) {
      size.set(this.ownerOf(s), (size.get(this.ownerOf(s)) ?? 0) + 1);
      total++;
    }
    for (const s of this.sites) {
      if (!this.alive(s)) continue;
      const [cx, cy] = this.cellOf(s);
      const r = this.reach(s);
      const civ = this.ownerOf(s);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const c = this.cell(cx + dx, cy + dy);
        const d = dx * dx + dy * dy;
        if (!c || !c.land || d > r * r) continue;
        const i = (cy + dy) * N + cx + dx;
        const w = d / r;
        if (w < best[i]) {
          best[i] = w;
          this.owner[i] = civ;
        }
      }
    }
  }

  // ------------------------------------------------------------ Anfang

  /** Vorzeit: Relikte der Ersten Maschinen in der Schrottödnis. */
  prehistory(): void {
    const scrap = this.cells.map((c, i) => ({ c, i })).filter((x) => x.c.scrap === 1);
    const relics: number[] = [];
    for (let k = 0; k < 4 && scrap.length; k++) {
      const { i } = scrap[Math.floor(this.rnd() * scrap.length)];
      const p = this.place((i % N) * C + C / 2, Math.floor(i / N) * C + C / 2, 'relic');
      if (!p) continue;
      const s = this.addSite('relic', p, -1, specialName(this.rnd, 'relic', 'synth', ''), 0);
      s.founded = -1000 - Math.floor(this.rnd() * 2000);
      s.destroyed = -1;
      relics.push(s.id);
    }
    const e = this.ev('prehistory', { sites: relics });
    for (const id of relics) this.sites[id].fall = e.id;
  }

  /** Bester Ort für ein Volk, weit weg von anderen Ursprüngen. */
  private origin(race: Race, taken: { cx: number; cy: number }[], minDist: number): { cx: number; cy: number } | null {
    let best: { cx: number; cy: number; s: number } | null = null;
    for (let k = 0; k < 500; k++) {
      const cx = 8 + Math.floor(this.rnd() * (N - 16));
      const cy = 8 + Math.floor(this.rnd() * (N - 16));
      const c = this.cells[cy * N + cx];
      if (!c.land) continue;
      const pref = PREF[race][c.biome as B] ?? 0;
      if (pref <= 0) continue;
      if (taken.some((o) => Math.hypot(o.cx - cx, o.cy - cy) < minDist)) continue;
      const s = pref + c.fert + (c.river ? 0.4 : 0) + (c.coast ? 0.3 : 0) + c.shard * 0.3 + this.rnd() * 0.3;
      if (!best || s > best.s) best = { cx, cy, s };
    }
    return best;
  }

  foundCiv(race: Race, faction: Faction, cx: number, cy: number, parent?: number, capital?: Site): Civ | null {
    const id = this.civs.length;
    let name = realmName(this.rnd, race);
    for (let k = 0; k < 12 && this.civs.some((c) => c.name === name); k++) name = realmName(this.rnd, race);
    let cap = capital;
    if (!cap) {
      const p = this.place(cx * C + C / 2, cy * C + C / 2, 'city', C * 0.8);
      if (!p) return null;
      cap = this.addSite('city', p, id, this.uniqueName(() => placeName(this.rnd, race)), 200 + Math.floor(this.rnd() * 100));
    }
    const civ: Civ = { id, name, race, faction, color: CIV_COLORS[id % CIV_COLORS.length], founded: this.y, capital: cap.id, rulers: [], events: [], opinion: {} };
    if (parent !== undefined) civ.parent = parent;
    this.civs.push(civ);
    const founder = this.addFigure('ruler', race, id, 25 + Math.floor(this.rnd() * 20));
    this.crown(civ, founder, false);
    if (parent === undefined) this.ev(this.y === 0 ? 'civ_found' : 'awaken', { civs: [id], figs: [founder.id], sites: [cap.id] });
    return civ;
  }

  crown(civ: Civ, f: Figure, log = true): void {
    const prev = this.figures[civ.rulers[civ.rulers.length - 1]];
    if (prev) {
      const o = prev.offices.find((x) => x.civ === civ.id && x.to === undefined);
      if (o) o.to = this.y;
    }
    f.role = f.role === 'hero' ? 'hero' : 'ruler';
    f.offices.push({ civ: civ.id, from: this.y });
    civ.rulers.push(f.id);
    if (log) this.ev('ruler', { civs: [civ.id], figs: prev ? [f.id, prev.id] : [f.id] });
  }

  start(): void {
    this.prehistory();
    const plan: [Race, Faction][] = [['human', 'order'], ['human', 'traders'], ['human', 'techno'], ['elf', 'mages'], ['elf', this.rnd() < 0.5 ? 'mages' : 'order'], ['orc', 'clan'], ['orc', 'clan']];
    const taken: { cx: number; cy: number }[] = [];
    for (const [race, faction] of plan) {
      for (const dist of [22, 16, 10]) {
        const o = this.origin(race, taken, dist);
        if (o && this.foundCiv(race, faction, o.cx, o.cy)) {
          taken.push(o);
          break;
        }
      }
    }
    // Notfall: Fehlen Reiche (kleine Welt), mit Menschen auffüllen
    for (let k = 0; this.civs.length < MIN_CIVS + 1 && k < 20; k++) {
      const o = this.origin('human', taken, 8);
      if (o && this.foundCiv('human', this.pick(['order', 'traders', 'techno', 'clan', 'mages'] as Faction[]), o.cx, o.cy)) taken.push(o);
    }
    this.shattering = Math.round(this.years * (0.55 + this.rnd() * 0.15));
  }

  // ------------------------------------------------------------ Jahreslauf

  run(): void {
    this.start();
    const synthYear = 40 + Math.floor(this.rnd() * 80);
    for (this.y = 1; this.y <= this.years; this.y++) {
      if (this.y === synthYear) this.awakenSynths();
      if (this.y === this.shattering - 25) this.prepareShattering();
      if (this.y === this.shattering - 12) this.forgeGreat();
      if (this.y === this.shattering) this.shatter();
      this.recomputeOwner();
      this.figuresYear();
      this.growth();
      this.relations();
      this.warsYear();
      this.beastsYear();
      this.disasters();
    }
    this.y = this.years;
  }

  private awakenSynths(): void {
    const relic = this.sites.find((s) => s.kind === 'relic');
    const scrap = this.cells.map((c, i) => ({ c, i })).filter((x) => x.c.scrap >= 0.3 && x.c.land && this.owner[x.i] === -1);
    const at = relic ? this.cellOf(relic) : scrap.length ? [scrap[0].i % N, Math.floor(scrap[0].i / N)] : null;
    if (!at) return;
    for (let k = 0; k < 6; k++) {
      const civ = this.foundCiv('synth', 'techno', at[0] + Math.floor(this.rnd() * 5) - 2, at[1] + Math.floor(this.rnd() * 5) - 2);
      if (civ) {
        if (relic) {
          const e = this.events[this.events.length - 1];
          e.sites.push(relic.id);
          relic.events.push(e.id);
        }
        return;
      }
    }
  }

  private figuresYear(): void {
    for (const f of this.figures) {
      if (!this.isAlive(f)) continue;
      const age = this.y - f.born;
      if (age > this.lifespan(f)) {
        this.die(f, 'age');
        continue;
      }
      // Herrscher bekommen Kinder (Erben)
      if (f.role === 'ruler' && f.offices.some((o) => o.to === undefined) && f.race !== 'synth' && age > 20 && age < 50 && f.children.length < 4 && this.rnd() < 0.07) {
        const child = this.addFigure('ruler', f.race, f.civ, 0, f.id);
        this.ev('birth', { figs: [child.id, f.id], civs: [f.civ] });
      }
      // Erzmagier, Ingenieure und Priester schaffen Artefakte
      if ((f.role === 'mage' || f.role === 'engineer' || f.role === 'priest') && age > 30 && this.rnd() < 0.035) {
        const made = this.artifacts.filter((a) => a.maker === f.id).length;
        if (made < 2) this.makeArtifact(f);
      }
    }
    for (const civ of this.aliveCivs()) {
      if (!this.ruler(civ)) this.succession(civ);
      const race = civ.race;
      if (this.rnd() < 0.007) {
        const h = this.addFigure('hero', race, civ.id, 18 + Math.floor(this.rnd() * 6));
        this.ev('hero_rise', { figs: [h.id], civs: [civ.id], sites: [civ.capital] });
      }
      const mageP = civ.faction === 'mages' ? 0.012 : race === 'elf' ? 0.005 : 0.002;
      if (this.rnd() < mageP) this.addFigure('mage', race, civ.id, 35 + Math.floor(this.rnd() * 20));
      const engP = civ.faction === 'techno' ? 0.012 : 0.002;
      if (this.rnd() < engP) this.addFigure('engineer', race, civ.id, 30 + Math.floor(this.rnd() * 20));
      if (civ.faction === 'order' && this.rnd() < 0.008) this.addFigure('priest', race, civ.id, 30 + Math.floor(this.rnd() * 20));
    }
  }

  makeArtifact(maker: Figure, great = false): Artifact {
    const civ = this.civs[maker.civ];
    const kinds = maker.role === 'engineer' ? [4, 5, 9, 8] : maker.role === 'priest' ? [1, 3, 6] : [2, 3, 6, 7, 1, 0];
    const kind = great ? 4 : this.pick(kinds);
    const race = maker.race === 'beast' ? 'human' : maker.race;
    let name = great ? `Herz von ${this.worldName}` : artifactName(this.rnd, kind, race);
    for (let k = 0; k < 12 && this.artifacts.some((a) => a.name === name); k++) name = artifactName(this.rnd, kind, race);
    const a: Artifact = { id: this.artifacts.length, name, kind, maker: maker.id, made: this.y, holders: [{ fig: maker.id, y: this.y, how: 'made' }], heldBy: maker.id };
    if (great) a.great = true;
    this.artifacts.push(a);
    maker.holds.push(a.id);
    this.ev('artifact_made', { figs: [maker.id], arts: [a.id], civs: civ ? [civ.id] : [] });
    // Oft ein Geschenk an den Herrscher
    const r = civ && this.ruler(civ);
    if (!great && r && r !== maker && this.rnd() < 0.5) this.give(a, maker, r, 'gift');
    return a;
  }

  give(a: Artifact, from: Figure | null, to: Figure, how: 'gift' | 'inherit' | 'loot' | 'found'): void {
    if (from) from.holds = from.holds.filter((x) => x !== a.id);
    if (a.site !== undefined) {
      const s = this.sites[a.site];
      s.arts = s.arts.filter((x) => x !== a.id);
      a.site = undefined;
      a.lost = undefined;
    }
    to.holds.push(a.id);
    a.heldBy = to.id;
    a.holders.push({ fig: to.id, y: this.y, how });
  }

  drop(a: Artifact, holder: Figure, site: Site, how: NonNullable<Artifact['lost']>['how']): void {
    holder.holds = holder.holds.filter((x) => x !== a.id);
    a.heldBy = undefined;
    a.site = site.id;
    a.lost = { y: this.y, how };
    site.arts.push(a.id);
    if (how !== 'buried') this.ev('artifact_lost', { arts: [a.id], figs: [holder.id], sites: [site.id], cause: how });
  }

  /** Tod einer Figur; Ämter enden, Artefakte werden vererbt, begraben, erbeutet oder gehen verloren. */
  die(f: Figure, cause: DeathCause, killer?: Figure, site?: Site): void {
    if (!this.isAlive(f)) return;
    // Die Hauptfiguren der Zersplitterung erleben sie
    if ((f === this.greatMage || f === this.greatEngineer) && this.y < this.shattering) return;
    f.died = this.y;
    f.cause = cause;
    if (killer) {
      f.killer = killer.id;
      killer.kills++;
    }
    if (site) f.deathSite = site.id;
    for (const o of f.offices) if (o.to === undefined) o.to = this.y;
    const civ = this.civs[f.civ];
    // Bestattung: Herrscher und manche Helden bekommen ein Grabmal
    let tomb: Site | null = null;
    if (f.race !== 'beast' && civ && (cause === 'age' || cause === 'plague' || cause === 'murder') && (f.role === 'ruler' && f.offices.length > 0 || (f.role === 'hero' && this.rnd() < 0.25) || f.role === 'mage')) {
      tomb = this.tombFor(civ);
    }
    const e = this.ev('death', { figs: killer ? [f.id, killer.id] : [f.id], civs: civ ? [civ.id] : [], sites: site ? [site.id] : tomb ? [tomb.id] : [], cause });
    void e;
    if (tomb) {
      tomb.buried.push(f.id);
      f.deathSite ??= tomb.id;
    }
    const heir = f.children.map((c) => this.figures[c]).find((c) => this.isAlive(c) && this.y - c.born >= 16);
    const buried: number[] = [];
    for (const id of [...f.holds]) {
      const a = this.artifacts[id];
      if (cause === 'battle' || cause === 'slain' || cause === 'murder') {
        if (killer && killer.race !== 'beast' && this.isAlive(killer) && this.rnd() < 0.5) {
          this.give(a, f, killer, 'loot');
          this.ev('artifact_loot', { arts: [a.id], figs: [killer.id, f.id] });
        } else if (site) this.drop(a, f, site, 'battle');
        else if (heir) this.give(a, f, heir, 'inherit');
      } else if (cause === 'beast') {
        if (killer?.lair !== undefined) this.drop(a, f, this.sites[killer.lair], 'hoard');
      } else if (cause === 'shattering') {
        if (site) this.drop(a, f, site, 'shattering');
      } else if (tomb && (this.rnd() < 0.55 || !heir)) {
        this.drop(a, f, tomb, 'buried');
        buried.push(a.id);
      } else if (heir) this.give(a, f, heir, 'inherit');
      else {
        const r = civ && this.ruler(civ);
        if (r && r !== f) this.give(a, f, r, 'inherit');
        else if (tomb) {
          this.drop(a, f, tomb, 'buried');
          buried.push(a.id);
        }
      }
    }
    if (tomb) this.ev('burial', { figs: [f.id], sites: [tomb.id], arts: buried, civs: civ ? [civ.id] : [] });
  }

  /** Grabmal eines Reiches nahe der Hauptstadt (wird wiederverwendet). */
  tombFor(civ: Civ): Site | null {
    const cap = this.sites[civ.capital];
    if (!cap) return null;
    const near = this.sites.find((s) => s.kind === 'tomb' && this.ownerOf(s) === civ.id && Math.hypot(s.tx - cap.tx, s.ty - cap.ty) < 140 && s.buried.length < 12);
    if (near) return near;
    const p = this.place(cap.tx, cap.ty, 'tomb', 90);
    if (!p) return null;
    return this.addSite('tomb', p, civ.id, specialName(this.rnd, 'tomb', civ.race, cap.name), 0);
  }

  private succession(civ: Civ): void {
    const last = this.figures[civ.rulers[civ.rulers.length - 1]];
    const heir = last?.children.map((c) => this.figures[c]).find((c) => this.isAlive(c) && this.y - c.born >= 16);
    const own = this.sitesOf(civ.id);
    // Erbfolgestreit: großes Reich ohne Erben zerbricht
    if (!heir && own.length >= 8 && this.aliveCivs().length < 14 && this.rnd() < 0.25) this.split(civ, own);
    if (this.ruler(civ)) return;
    const next = heir ?? this.addFigure('ruler', civ.race, civ.id, 25 + Math.floor(this.rnd() * 20));
    this.crown(civ, next);
  }

  private split(civ: Civ, own: Site[]): void {
    const cap = this.sites[civ.capital];
    const far = own.reduce((a, b) => (Math.hypot(b.tx - cap.tx, b.ty - cap.ty) > Math.hypot(a.tx - cap.tx, a.ty - cap.ty) ? b : a));
    const group = own.filter((s) => s !== cap && Math.hypot(s.tx - far.tx, s.ty - far.ty) < Math.hypot(s.tx - cap.tx, s.ty - cap.ty));
    if (group.length < 2) return;
    const newCap = group.reduce((a, b) => (b.pop > a.pop ? b : a));
    const factions: Faction[] = ['mages', 'techno', 'clan', 'traders', 'order'];
    const faction = this.rnd() < 0.5 ? civ.faction : this.pick(factions);
    const child = this.foundCiv(civ.race, faction, 0, 0, civ.id, newCap);
    if (!child) return;
    for (const s of group) s.owners.push({ y: this.y, civ: child.id });
    if (newCap.kind === 'village') newCap.kind = 'city';
    civ.opinion[child.id] = child.opinion[civ.id] = -45;
    this.ev('split', { civs: [child.id, civ.id], sites: [newCap.id], figs: [child.rulers[0]], n: group.length });
  }

  private growth(): void {
    const size = new Map<number, number>();
    let total = 0;
    for (const s of this.sites) if (this.alive(s)) {
      size.set(this.ownerOf(s), (size.get(this.ownerOf(s)) ?? 0) + 1);
      total++;
    }
    for (const s of this.sites) {
      if (!this.alive(s)) continue;
      const [cx, cy] = this.cellOf(s);
      const c = this.cells[cy * N + cx];
      const civ = this.civs[this.ownerOf(s)];
      const capital = civ?.capital === s.id;
      const special = s.kind !== 'city' && s.kind !== 'village';
      const cap = special ? 120 : 150 + 900 * c.fert + (capital ? 400 : 0);
      s.pop += s.pop * 0.025 * (1 - s.pop / cap);
      if (s.kind === 'village' && s.pop > 950) s.kind = 'city';
      if (!civ || special) continue;
      // Neue Dörfer bevorzugt an Flüssen, Küsten und Ressourcen
      // Große Reiche wachsen langsamer (Verwaltung, Wege): weich begrenzt auf ~18 Orte
      if (s.pop > 220 && this.rnd() < 0.045 * Math.max(0, 1 - (size.get(civ.id) ?? 0) / 18) * Math.max(0, 1 - total / MAX_SITES)) this.expand(civ, s);
    }
    for (const civ of this.aliveCivs()) {
      const own = this.sitesOf(civ.id);
      // Händler knüpfen Handelswege, alle anderen gelegentlich
      if (own.length && this.rnd() < (civ.faction === 'traders' ? 0.04 : 0.006)) this.trade(civ, own);
      if (own.length < 3 || this.rnd() > 0.008) continue;
      const kind: SiteKind | null = civ.faction === 'mages' ? 'tower' : civ.faction === 'techno' ? 'lab' : civ.faction === 'order' ? 'temple' : civ.faction === 'clan' ? 'fortress' : null;
      if (kind) this.special(civ, own, kind);
      if (this.rnd() < 0.3) this.special(civ, own, 'mine');
    }
  }

  private expand(civ: Civ, from: Site): void {
    const [cx, cy] = this.cellOf(from);
    let best: { cx: number; cy: number; s: number } | null = null;
    for (let k = 0; k < 10; k++) {
      const a = this.rnd() * Math.PI * 2;
      const d = 3 + this.rnd() * 4;
      const nx = Math.round(cx + Math.cos(a) * d);
      const ny = Math.round(cy + Math.sin(a) * d);
      const c = this.cell(nx, ny);
      if (!c || !c.land) continue;
      const o = this.owner[ny * N + nx];
      if (o !== -1 && o !== civ.id) continue;
      const pref = PREF[civ.race][c.biome as B] ?? 0.1;
      const s = c.fert + pref * 0.5 + c.wood * 0.2 + c.ore * 0.2 + c.shard * 0.6 + (c.river ? 0.5 : 0) + (c.coast ? 0.3 : 0) + this.rnd() * 0.3;
      if (!best || s > best.s) best = { cx: nx, cy: ny, s };
    }
    if (!best || best.s < 0.6) return;
    const p = this.place(best.cx * C + C / 2, best.cy * C + C / 2, 'village');
    if (!p) return;
    const s = this.addSite('village', p, civ.id, this.uniqueName(() => placeName(this.rnd, civ.race)), 60);
    from.pop -= 60;
    this.ev('site_found', { civs: [civ.id], sites: [s.id, from.id] });
  }

  private special(civ: Civ, own: Site[], kind: SiteKind): void {
    const base = this.pick(own);
    const [cx, cy] = this.cellOf(base);
    let best: { cx: number; cy: number; s: number } | null = null;
    for (let k = 0; k < 10; k++) {
      const nx = cx + Math.floor(this.rnd() * 7) - 3;
      const ny = cy + Math.floor(this.rnd() * 7) - 3;
      const c = this.cell(nx, ny);
      if (!c || !c.land) continue;
      const border = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const o = this.owner[(ny + dy) * N + nx + dx]; return o !== -1 && o !== civ.id; });
      const s = kind === 'tower' ? c.shard * 2 + c.h : kind === 'lab' ? c.scrap + c.shard : kind === 'mine' ? c.ore * 2 : kind === 'fortress' ? (border ? 2 : 0) + c.h : c.fert + c.h;
      if (!best || s + this.rnd() * 0.3 > best.s) best = { cx: nx, cy: ny, s };
    }
    if (!best || (kind === 'mine' && best.s < 0.8)) return;
    const p = this.place(best.cx * C + C / 2, best.cy * C + C / 2, kind);
    if (!p) return;
    const s = this.addSite(kind, p, civ.id, this.uniqueName(() => specialName(this.rnd, kind, civ.race, base.name)), 40);
    const builder = this.figures.find((f) => this.isAlive(f) && f.civ === civ.id && (kind === 'tower' ? f.role === 'mage' : kind === 'lab' ? f.role === 'engineer' : kind === 'temple' ? f.role === 'priest' : false));
    this.ev('site_found', { civs: [civ.id], sites: [s.id, base.id], figs: builder ? [builder.id] : [] });
  }

  private trade(civ: Civ, own: Site[]): void {
    const a = this.pick(own);
    const partners = this.sites.filter((s) => this.alive(s) && s.kind === 'city' && this.ownerOf(s) !== civ.id && Math.hypot(s.tx - a.tx, s.ty - a.ty) < 25 * C && (civ.opinion[this.ownerOf(s)] ?? 0) > -20);
    if (!partners.length) return;
    const b = this.pick(partners);
    const other = this.ownerOf(b);
    civ.opinion[other] = Math.min(100, (civ.opinion[other] ?? 0) + 15);
    this.civs[other].opinion[civ.id] = civ.opinion[other];
    this.ev('trade', { civs: [civ.id, other], sites: [a.id, b.id] });
  }

  // ------------------------------------------------------------ Beziehungen und Kriege

  private relations(): void {
    const border = new Map<string, { n: number; shard: number }>();
    for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N - 1; cx++) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (cy + dy >= N) continue;
        const a = this.owner[cy * N + cx];
        const b = this.owner[(cy + dy) * N + cx + dx];
        if (a === -1 || b === -1 || a === b) continue;
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        const v = border.get(key) ?? { n: 0, shard: 0 };
        v.n++;
        v.shard = Math.max(v.shard, this.cells[cy * N + cx].shard, this.cells[(cy + dy) * N + cx + dx].shard);
        border.set(key, v);
      }
    }
    for (const [key, v] of border) {
      const [a, b] = key.split(',').map(Number);
      const ca = this.civs[a];
      const cb = this.civs[b];
      let d = -0.35 - v.shard * 0.8 + (this.rnd() - 0.5) * 3;
      if (ca.race !== cb.race) d -= 0.3;
      if (ca.faction === 'traders' || cb.faction === 'traders') d += 0.5;
      if (ca.faction === cb.faction) d += 0.2;
      const o = Math.max(-100, Math.min(100, (ca.opinion[b] ?? 0) + d));
      ca.opinion[b] = cb.opinion[a] = o;
      const atWar = this.wars.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
      if (!atWar && !this.alliances.has(key) && o < -40 && this.rnd() < 0.04) this.declareWar(a, b, v.shard > 0.4 ? 'shard' : 'border');
      else if (!atWar && !this.alliances.has(key) && o > 30 && this.rnd() < 0.03) {
        this.alliances.add(key);
        this.ev('alliance', { civs: [a, b] });
      } else if (this.alliances.has(key) && o < 0) this.alliances.delete(key);
    }
  }

  private strength(civ: number): number {
    return Math.sqrt(this.sitesOf(civ).reduce((s, x) => s + x.pop, 0) + 1);
  }

  declareWar(a: number, b: number, cause: string): void {
    const [atk, def] = this.strength(a) >= this.strength(b) ? [a, b] : [b, a];
    const e = this.ev('war', { civs: [atk, def], cause });
    this.wars.push({ a: atk, b: def, start: this.y, battles: 0, ev: e.id, wins: [0, 0] });
  }

  private commander(civ: number): Figure | undefined {
    const heroes = this.figures.filter((f) => this.isAlive(f) && f.civ === civ && f.role === 'hero' && this.y - f.born >= 18);
    return heroes.length && this.rnd() < 0.7 ? this.pick(heroes) : this.ruler(this.civs[civ]);
  }

  private warsYear(): void {
    for (const w of [...this.wars]) {
      if (this.civs[w.a].fell !== undefined || this.civs[w.b].fell !== undefined) {
        this.wars = this.wars.filter((x) => x !== w);
        continue;
      }
      if (this.rnd() < 0.6) this.battle(w);
      const len = this.y - w.start;
      if (this.wars.includes(w) && (this.rnd() < 0.08 + 0.04 * len || Math.abs(w.wins[0] - w.wins[1]) >= 3)) this.peace(w);
    }
  }

  private peace(w: War): void {
    this.wars = this.wars.filter((x) => x !== w);
    if (this.civs[w.a].fell !== undefined || this.civs[w.b].fell !== undefined) return;
    this.civs[w.a].opinion[w.b] = this.civs[w.b].opinion[w.a] = -10;
    this.ev('peace', { civs: [w.a, w.b], win: w.wins[0] > w.wins[1] ? w.a : w.wins[1] > w.wins[0] ? w.b : -1, n: this.y - w.start });
  }

  private battle(w: War): void {
    const flip = this.rnd() < 0.35;
    const atk = flip ? w.b : w.a;
    const def = flip ? w.a : w.b;
    const mine = this.sitesOf(atk);
    const theirs = this.sitesOf(def);
    if (!mine.length || !theirs.length) return this.peace(w);
    // Ziel: der nächstgelegene Ort des Gegners
    let target = theirs[0];
    let from = mine[0];
    let bd = Infinity;
    for (const t of theirs) for (const m of mine) {
      const d = Math.hypot(t.tx - m.tx, t.ty - m.ty);
      if (d < bd) {
        bd = d;
        target = t;
        from = m;
      }
    }
    if (bd > 30 * C) return;
    // Das Schlachtfeld liegt zwischen den Orten
    const bx = target.tx + (from.tx - target.tx) * 0.35;
    const by = target.ty + (from.ty - target.ty) * 0.35;
    let field = this.sites.find((s) => s.kind === 'battlefield' && Math.hypot(s.tx - bx, s.ty - by) < C * 1.5);
    if (!field) {
      const p = this.place(bx, by, 'battlefield', C * 0.6);
      if (p) field = this.addSite('battlefield', p, -1, specialName(this.rnd, 'battlefield', 'human', target.name), 0);
    }
    const ca = this.commander(atk);
    const cd = this.commander(def);
    const bonus = (f?: Figure) => (f ? 1 + f.holds.length * 0.15 + (f.role === 'hero' ? 0.2 : 0) : 1);
    const sa = this.strength(atk) * bonus(ca);
    const sd = this.strength(def) * bonus(cd) * (target.kind === 'fortress' || target.kind === 'city' ? 1.25 : 1);
    let atkWins = this.rnd() < sa / (sa + sd);
    const dead = Math.round(40 + this.rnd() * 500);
    const e = this.ev('battle', { civs: [atk, def], sites: field ? [field.id, target.id] : [target.id], figs: [ca?.id, cd?.id].filter((x): x is number => x !== undefined), n: dead });
    w.battles++;
    // Verrat: Ein Verteidiger öffnet die Tore
    let traitor: Figure | null = null;
    if (!atkWins && this.rnd() < 0.08) {
      traitor = this.addFigure('traitor', this.civs[def].race, def, 25 + Math.floor(this.rnd() * 30));
      atkWins = true;
      this.ev('betrayal', { figs: [traitor.id], civs: [def, atk], sites: [target.id] });
    }
    e.win = atkWins ? atk : def;
    w.wins[atk === w.a ? (atkWins ? 0 : 1) : atkWins ? 1 : 0]++;
    const loserCmd = atkWins ? cd : ca;
    const winnerCmd = atkWins ? ca : cd;
    if (loserCmd && this.rnd() < 0.35) this.die(loserCmd, 'battle', winnerCmd, field ?? target);
    if (winnerCmd && this.rnd() < 0.08) this.die(winnerCmd, 'battle', loserCmd && this.isAlive(loserCmd) ? loserCmd : undefined, field ?? target);
    if (!atkWins) return;
    target.pop *= 0.6;
    const defCiv = this.civs[def];
    const last = theirs.length === 1;
    if (last && this.aliveCivs().length <= MIN_CIVS + 1) return this.peace(w);
    if (this.rnd() < 0.4 || target.kind === 'mine') {
      this.destroy(target, this.ev('raze', { civs: [atk, def], sites: [target.id], figs: ca ? [ca.id] : [] }));
    } else {
      target.owners.push({ y: this.y, civ: atk });
      this.ev('conquest', { civs: [atk, def], sites: [target.id], figs: ca ? [ca.id] : [] });
    }
    if (defCiv.capital === target.id) this.moveCapital(defCiv);
  }

  /** Ort wird zerstört oder verlassen → Ruine. Wer dort Artefakte trug, verliert sie nicht (die Figuren fliehen). */
  destroy(s: Site, e: HEvent): void {
    s.destroyed = this.y;
    s.fall = e.id;
    s.pop = 0;
    const civ = this.civs[this.ownerOf(s)];
    if (civ && civ.capital === s.id) this.moveCapital(civ);
  }

  private moveCapital(civ: Civ): void {
    const own = this.sitesOf(civ.id).filter((s) => s.kind === 'city' || s.kind === 'village');
    if (!own.length) {
      const any = this.sitesOf(civ.id);
      if (any.length) {
        civ.capital = any[0].id;
        return;
      }
      civ.fell = this.y;
      for (const f of this.figures) if (f.civ === civ.id && this.isAlive(f) && f.role === 'ruler') for (const o of f.offices) if (o.to === undefined) o.to = this.y;
      this.ev('civ_fall', { civs: [civ.id] });
      return;
    }
    const cap = own.reduce((a, b) => (b.pop > a.pop ? b : a));
    civ.capital = cap.id;
    cap.kind = 'city';
  }

  // ------------------------------------------------------------ Bestien

  spawnBeast(near?: { cx: number; cy: number }, kindIdx?: number): Figure | null {
    const k = kindIdx ?? Math.floor(this.rnd() * BEASTS.length);
    const def = BEASTS[k];
    for (let tries = 0; tries < 60; tries++) {
      const cx = near ? near.cx + Math.floor(this.rnd() * 9) - 4 : 6 + Math.floor(this.rnd() * (N - 12));
      const cy = near ? near.cy + Math.floor(this.rnd() * 9) - 4 : 6 + Math.floor(this.rnd() * (N - 12));
      const c = this.cell(cx, cy);
      if (!c || !c.land) continue;
      if (!near && !(def.biomes as readonly number[]).includes(c.biome) && this.rnd() < 0.8) continue;
      const own = this.owner[cy * N + cx];
      if (own !== -1 && !near) continue;
      // Nicht zu weit ab: die Bestie soll jemanden bedrohen
      if (!near && !this.sites.some((s) => this.alive(s) && Math.hypot(s.tx / C - cx, s.ty / C - cy) < 10)) continue;
      const p = this.place(cx * C + C / 2, cy * C + C / 2, 'lair');
      if (!p) continue;
      const b = this.addFigure('beast', 'beast', -1, 50 + Math.floor(this.rnd() * 100));
      b.beastKind = k;
      const nearest = this.sites.filter((s) => INHABITED.has(s.kind)).reduce<Site | null>((a, s) => (!a || Math.hypot(s.tx - p.tx, s.ty - p.ty) < Math.hypot(a.tx - p.tx, a.ty - p.ty) ? s : a), null);
      const lair = this.addSite('lair', p, -1, specialName(this.rnd, 'lair', 'human', nearest?.name ?? this.worldName), 0);
      lair.beast = b.id;
      b.lair = lair.id;
      this.ev('beast_arrive', { figs: [b.id], sites: [lair.id] });
      return b;
    }
    return null;
  }

  private beastsYear(): void {
    const afterShatter = this.y > this.shattering && this.y < this.shattering + 30;
    if (this.rnd() < (afterShatter ? 0.04 : 0.01)) this.spawnBeast();
    for (const b of this.figures) {
      if (b.race !== 'beast' || !this.isAlive(b) || b.lair === undefined) continue;
      const lair = this.sites[b.lair];
      // Raubzüge
      if (this.rnd() < 0.12) {
        const prey = this.sites.filter((s) => this.alive(s) && Math.hypot(s.tx - lair.tx, s.ty - lair.ty) < 7 * C);
        if (prey.length) {
          const s = this.pick(prey);
          s.pop *= 0.85;
          const civ = this.ownerOf(s);
          const victims = this.figures.filter((f) => this.isAlive(f) && f.civ === civ && f.race !== 'beast' && f.role !== 'ruler');
          const victim = victims.length && this.rnd() < 0.2 ? this.pick(victims) : null;
          const e = this.ev('beast_raid', { figs: victim ? [b.id, victim.id] : [b.id], sites: [s.id], civs: [civ] });
          if (victim) this.die(victim, 'beast', b, lair);
          if (s.kind === 'village' && s.pop < 90 && this.rnd() < 0.25) this.destroy(s, e);
        }
      }
      // Helden ziehen gegen die Bestie
      if (this.rnd() < 0.06) {
        const heroes = this.figures.filter((f) => this.isAlive(f) && f.role === 'hero' && this.y - f.born >= 18 && this.sites.some((s) => this.alive(s) && this.ownerOf(s) === f.civ && Math.hypot(s.tx - lair.tx, s.ty - lair.ty) < 9 * C));
        if (heroes.length) {
          const h = this.pick(heroes);
          if (this.rnd() < 0.4 + h.holds.length * 0.12) {
            this.die(b, 'slain', h, lair);
            this.ev('beast_slain', { figs: [h.id, b.id], sites: [lair.id], civs: [h.civ] });
            const loot = lair.arts.length && this.rnd() < 0.5 ? this.artifacts[lair.arts[0]] : null;
            if (loot) {
              this.give(loot, null, h, 'found');
              this.ev('artifact_loot', { arts: [loot.id], figs: [h.id], sites: [lair.id] });
            }
          } else {
            this.ev('hero_falls', { figs: [h.id, b.id], sites: [lair.id], civs: [h.civ] });
            this.die(h, 'beast', b, lair);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ Seuchen, Hunger, Zersplitterung

  private disasters(): void {
    if (this.rnd() < 0.004) this.plague('plague');
    if (this.rnd() < 0.003) this.plague('famine');
  }

  private plague(k: 'plague' | 'famine'): void {
    const civs = this.aliveCivs().filter((c) => this.sitesOf(c.id).length > 1);
    if (!civs.length) return;
    const civ = this.pick(civs);
    let own = this.sitesOf(civ.id);
    if (k === 'famine') own = own.sort((a, b) => this.cells[this.cellOf(a)[1] * N + this.cellOf(a)[0]].fert - this.cells[this.cellOf(b)[1] * N + this.cellOf(b)[0]].fert);
    const hit = own.slice(0, 2 + Math.floor(this.rnd() * 3));
    const e = this.ev(k, { civs: [civ.id], sites: hit.map((s) => s.id), n: Math.round(hit.reduce((s, x) => s + x.pop * 0.45, 0)) });
    for (const s of hit) s.pop *= 0.55;
    if (k === 'plague') for (const f of this.figures) if (this.isAlive(f) && f.civ === civ.id && this.rnd() < 0.1) this.die(f, 'plague');
    for (const s of hit) {
      if (s.pop < 45 && s.id !== civ.capital) {
        const a = this.ev('abandon', { civs: [civ.id], sites: [s.id], cause: k });
        this.destroy(s, a);
      }
    }
    void e;
  }

  private greatSite?: Site;
  private greatMage?: Figure;
  private greatEngineer?: Figure;

  /** Vorbereitung der Zersplitterung: ein Turm auf der reichsten Splitter-Ader. */
  private prepareShattering(): void {
    const civs = this.aliveCivs();
    const mages = civs.find((c) => c.faction === 'mages') ?? civs[0];
    const techno = civs.find((c) => c.faction === 'techno') ?? mages;
    if (!mages) return;
    // Reichste Ader in der Nähe des Magierreichs
    const own = this.sitesOf(mages.id);
    let best: { cx: number; cy: number; s: number } | null = null;
    for (const s of own.length ? own : [this.sites[mages.capital]]) {
      const [cx, cy] = this.cellOf(s);
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
        const c = this.cell(cx + dx, cy + dy);
        if (!c || !c.land) continue;
        const v = c.shard + this.rnd() * 0.1;
        if (!best || v > best.s) best = { cx: cx + dx, cy: cy + dy, s: v };
      }
    }
    if (!best) return;
    const p = this.place(best.cx * C + C / 2, best.cy * C + C / 2, 'tower', C) ?? this.place(best.cx * C + C / 2, best.cy * C + C / 2, 'tower', C * 2);
    if (!p) return;
    this.greatMage = this.addFigure('mage', mages.race, mages.id, 60);
    this.greatEngineer = this.addFigure('engineer', techno.race, techno.id, 45);
    this.greatSite = this.addSite('tower', p, mages.id, this.uniqueName(() => specialName(this.rnd, 'tower', mages.race, '')), 60);
    this.ev('site_found', { civs: [mages.id, techno.id], sites: [this.greatSite.id], figs: [this.greatMage.id, this.greatEngineer.id], cause: 'great' });
  }

  private forgeGreat(): void {
    if (!this.greatMage || !this.greatEngineer || !this.greatSite) return;
    const a = this.makeArtifact(this.greatMage, true);
    this.events[this.events.length - 1].figs.push(this.greatEngineer.id);
    this.events[this.events.length - 1].sites.push(this.greatSite.id);
    this.greatSite.events.push(this.events.length - 1);
    void a;
  }

  /** Die Zersplitterung: der Versuch, den größten Splitter zu bändigen, zerreißt das Land. */
  private shatter(): void {
    const site = this.greatSite;
    if (!site || !this.greatMage || !this.greatEngineer) return;
    const p = this.place(site.tx, site.ty, 'crater', 60) ?? { tx: site.tx + 6, ty: site.ty + 4 };
    const crater = this.addSite('crater', p, -1, specialName(this.rnd, 'crater', 'human', site.name), 0);
    const ruined = this.sites.filter((s) => this.alive(s) && Math.hypot(s.tx - site.tx, s.ty - site.ty) < 4.5 * C);
    const e = this.ev('shattering', { figs: [this.greatMage.id, this.greatEngineer.id], sites: [crater.id, ...ruined.map((s) => s.id)], civs: [...new Set(ruined.map((s) => this.ownerOf(s)))], n: ruined.length });
    for (const s of ruined) this.destroy(s, e);
    for (const f of [this.greatMage, this.greatEngineer]) {
      if (!this.isAlive(f)) continue;
      // Das Herz bleibt im Krater
      this.die(f, 'shattering', undefined, crater);
    }
    const great = this.artifacts.find((a) => a.great);
    if (great && great.heldBy !== undefined) this.drop(great, this.figures[great.heldBy], crater, 'shattering');
    // Splitterbrut erwacht
    const [cx, cy] = this.cellOf(crater);
    for (let k = 0; k < 2 + Math.floor(this.rnd() * 2); k++) this.spawnBeast({ cx, cy }, 1);
    // Schuldzuweisung: alle gegen Magier und Technokraten
    const blamed = new Set([this.greatMage.civ, this.greatEngineer.civ]);
    for (const c of this.aliveCivs()) for (const b of blamed) if (c.id !== b) c.opinion[b] = this.civs[b].opinion[c.id] = Math.min(c.opinion[b] ?? 0, 0) - 30;
  }

  result(ms: number): History {
    return {
      seed: this.t.seed, years: this.years, worldName: this.worldName, shattering: this.shattering, cells: this.cells,
      civs: this.civs, sites: this.sites, figures: this.figures, artifacts: this.artifacts, events: this.events, rivers: this.rivers, ms,
    };
  }
}

/** Erzeugt die Vorgeschichte einer Welt (deterministisch aus Seed und Landschaft). */
export function generateHistory(t: Terrain, opts: HistoryOptions = {}): History {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const years = Math.max(100, Math.min(1000, Math.round(opts.years ?? DEFAULT_YEARS)));
  const sim = new Sim(t, years);
  sim.run();
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return sim.result(t1 - t0);
}

export { ARTIFACT_KINDS, BEASTS, FACTIONS };
