/**
 * Vorgeschichte – Kern der Simulation. Aus Seed + Konfiguration läuft eine Weltgeschichte über Jahrtausende auf einem
 * groben Raster der echten Landschaft. Deterministisch, rein (ohne Phaser), auch im Web Worker lauffähig.
 *
 * Aufbau: `Sim` hält den Zustand und gemeinsame Hilfen. Die Schleife geht über Schritte variabler Länge (`timeline.ts`).
 * In jedem Schritt laufen die Weltereignisse (`worldEvents/`) und danach alle Systeme (`systems/`). Wahrscheinlichkeiten
 * sind je Jahr angegeben; `chance(p)` rechnet sie auf die Schrittlänge `dt` um.
 */
import { B, BIOMES } from '../world/biomes';
import { traceRivers, type Faction, type Terrain } from '../world/meta';
import { Simplex2 } from '../world/noise';
import { mulberry32 } from '../world/rng';
import { RUGGED_H, SEA_LEVEL, WORLD_TILES } from '../world/WorldGen';
import { resolveConfig, type HistoryConfig, type PartialConfig } from './config';
import { importanceOf } from './events';
import { assessKnowledge } from './knowledge';
import { ARTIFACT_KINDS, BEASTS, artifactName, beastName, personName, placeName, realmName, specialName, worldName } from './names';
import { reach } from './query';
import { CIV_COLORS, FERT, LIFESPAN, ORE, PREF, RACE_FACTIONS, WOOD } from './rules';
import { SYSTEMS } from './systems';
import { epochAt, steps, timelineOf, type Epoch, type Timeline } from './timeline';
import { townRoom } from './towns';
import {
  HISTORY_CELL, HISTORY_GRID, INHABITED,
  type Artifact, type Cell, type Civ, type DeathCause, type EventKind, type Figure, type HEvent, type History, type Race, type Role, type Site, type SiteKind, type WorldRun,
} from './types';
import { WORLD_EVENTS, scheduleWorldEvents, type ModKey, type WorldEventDef } from './worldEvents';

export interface HistoryOptions {
  /** Teil-Konfiguration über dem Standard (`config.ts`) */
  config?: PartialConfig;
}

const N = HISTORY_GRID;
const C = HISTORY_CELL;

/** Wie in meta.ts: Boden, auf dem Orte entstehen dürfen. */
const GOOD = new Set<B>([B.Hills, B.Grassland, B.Forest, B.Savanna, B.Beach, B.Tundra, B.Desert, B.CrystalGrove, B.ScrapWastes, B.Jungle, B.Snow]);
/** Ruinen, die älter sind, blockieren keine Neugründung mehr (man baut auf ihnen). */
const RUIN_SETTLE_AGE = 120;

export interface War { a: number; b: number; start: number; battles: number; ev: number; wins: [number, number] }

/** Ein Weltereignis während der Simulation. */
export interface ActiveRun { run: WorldRun; def: WorldEventDef; state: Record<string, unknown> }

type Refs = { civs?: number[]; figs?: number[]; sites?: number[]; arts?: number[]; n?: number; win?: number; cause?: string };

export class Sim {
  readonly cfg: HistoryConfig;
  readonly tl: Timeline;
  readonly rnd: () => number;
  readonly cells: Cell[] = [];
  readonly civs: Civ[] = [];
  readonly sites: Site[] = [];
  readonly figures: Figure[] = [];
  readonly artifacts: Artifact[] = [];
  readonly events: HEvent[] = [];
  readonly rivers: Set<number>;
  readonly worldName: string;
  /** Reich je Zelle im aktuellen Schritt (−1 = niemand) */
  owner = new Int16Array(N * N).fill(-1);
  wars: War[] = [];
  alliances = new Set<string>();
  /** Bewohnte Orte, die bestehen */
  living = new Set<Site>();
  /** Orte je Zelle (für schnelle Abstandsprüfungen) */
  private readonly grid = new Map<number, Site[]>();
  /** Handelswege je Ort */
  readonly tradeRoutes = new Map<number, number>();
  /** Platz bis zum Nachbarort (Radius in Kacheln), alle paar Jahrzehnte neu */
  readonly room = new Map<number, number>();
  /** Lagegunst je Ort (0–1, aus dem Seed) */
  readonly favor = new Map<number, number>();
  /** Merker für Systeme und Weltereignisse (z. B. `synths` = Jahr des Erwachens) */
  readonly flags: Record<string, number> = {};
  /** Geplante Weltereignisse (sortiert) und gerade aktive */
  runs: { run: WorldRun; def: WorldEventDef }[] = [];
  active: ActiveRun[] = [];
  y = 0;
  /** Länge des aktuellen Schritts in Jahren */
  dt = 1;
  epoch!: Epoch;
  private readonly elev: (x: number, y: number) => number;

  constructor(private readonly t: Terrain, cfg: HistoryConfig) {
    this.cfg = cfg;
    this.tl = timelineOf(cfg);
    this.epoch = this.tl.epochs[0];
    this.rnd = mulberry32(t.seed ^ 0x4157);
    this.elev = t.elevationAt ? t.elevationAt.bind(t) : () => 0.5;
    this.worldName = worldName(mulberry32(t.seed ^ 0x10de));
    this.rivers = traceRivers(t, new Simplex2(t.seed ^ 0x51a7));
    this.buildCells();
  }

  get years(): number {
    return this.tl.end;
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

  cellOfSite(s: Site): Cell {
    const [cx, cy] = this.cellOf(s);
    return this.cells[cy * N + cx];
  }

  /** Fruchtbarkeit einer Zelle heute (Weltereignisse wie die Eiszeit verändern sie). */
  fert(cx: number, cy: number): number {
    let f = this.cells[cy * N + cx]?.fert ?? 0;
    for (const a of this.active) if (a.def.fertility) f *= a.def.fertility(this, cx, cy);
    return f;
  }

  // ------------------------------------------------------------ Zeit, Zufall, Stärke

  /** Wahrscheinlichkeit je Jahr → für den aktuellen Schritt. */
  chance(perYear: number): boolean {
    if (perYear <= 0) return false;
    const p = this.dt === 1 ? perYear : 1 - Math.pow(1 - Math.min(1, perYear), this.dt);
    return this.rnd() < p;
  }

  /** Erwartete Anzahl in diesem Schritt bei einer Rate je Jahr (ganzzahlig gezogen, höchstens `max`). */
  count(perYear: number, max = Infinity): number {
    const x = perYear * this.dt;
    const n = Math.floor(x) + (this.rnd() < x - Math.floor(x) ? 1 : 0);
    return Math.min(max, n);
  }

  /** Stärke eines Systems laut Konfiguration (0 = aus). */
  rate(system: string): number {
    const s = this.cfg.systems[system];
    return !s ? 1 : s.on ? s.rate : 0;
  }

  /** Produkt der Modifikatoren aktiver Weltereignisse. */
  mod(key: ModKey): number {
    let m = 1;
    for (const a of this.active) m *= a.def.mods?.[key] ?? 1;
    return m;
  }

  get detail(): number {
    return this.epoch.detail;
  }

  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.rnd() * a.length)];
  }

  // ------------------------------------------------------------ Ereignisse

  /**
   * Ein Ereignis. Unter der Mindestbedeutung des Zeitalters wird es nicht protokolliert (`id` −1), wirkt aber.
   * Wer die ID speichern will (z. B. als Untergang eines Ortes), ruft `keep(e)`.
   */
  ev(k: EventKind, refs: Refs = {}, force = false): HEvent {
    const e: HEvent = { id: -1, y: this.y, k, civs: refs.civs ?? [], figs: refs.figs ?? [], sites: refs.sites ?? [], arts: refs.arts ?? [] };
    if (refs.n !== undefined) e.n = refs.n;
    if (refs.win !== undefined) e.win = refs.win;
    if (refs.cause !== undefined) e.cause = refs.cause;
    if (force || importanceOf(k) >= this.epoch.minImportance) this.keep(e);
    return e;
  }

  /** Ereignis ins Protokoll aufnehmen (falls noch nicht geschehen) und seine ID liefern. */
  keep(e: HEvent): number {
    if (e.id >= 0) return e.id;
    e.id = this.events.length;
    this.events.push(e);
    for (const c of e.civs) this.civs[c]?.events.push(e.id);
    for (const f of e.figs) this.figures[f]?.events.push(e.id);
    for (const s of e.sites) this.sites[s]?.events.push(e.id);
    return e.id;
  }

  // ------------------------------------------------------------ Abfragen

  ownerOf(s: Site): number {
    return s.owners[s.owners.length - 1].civ;
  }

  alive(s: Site): boolean {
    return this.living.has(s);
  }

  sitesOf(civ: number): Site[] {
    const out: Site[] = [];
    for (const s of this.living) if (this.ownerOf(s) === civ) out.push(s);
    return out;
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

  cellOf(s: { tx: number; ty: number }): [number, number] {
    return [Math.floor(s.tx / C), Math.floor(s.ty / C)];
  }

  /** Einflussgebiet eines Ortes (Radius in Zellen nach Größe). */
  reach(s: Site): number {
    return reach(s);
  }

  /** Orte im Umkreis (Kacheln) einer Position, über das Zellraster. */
  near(tx: number, ty: number, r: number, filter: (s: Site) => boolean = () => true): Site[] {
    const out: Site[] = [];
    const c0x = Math.floor((tx - r) / C);
    const c1x = Math.floor((tx + r) / C);
    const c0y = Math.floor((ty - r) / C);
    const c1y = Math.floor((ty + r) / C);
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      for (const s of this.grid.get(cy * N + cx) ?? []) if (Math.hypot(s.tx - tx, s.ty - ty) < r && filter(s)) out.push(s);
    }
    return out;
  }

  // ------------------------------------------------------------ Orte

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
   * Kachelgenauer Platz in der Nähe eines Punktes. Bewohnte Orte halten `settlements.spacing` Abstand untereinander,
   * alle anderen Orte mindestens 34 zu bewohnten und 16 zu sonstigen. Alte Ruinen blockieren nicht: auf ihnen darf man
   * neu bauen (`onRuin` liefert dann die Ruine darunter).
   */
  place(cx: number, cy: number, kind: SiteKind, spread = C * 0.45): { tx: number; ty: number; onRuin?: Site } | null {
    const settle = INHABITED.has(kind) || kind === 'relic';
    const spacing = this.cfg.settlements.spacing;
    for (let i = 0; i < 30; i++) {
      const tx = Math.round(cx + (this.rnd() * 2 - 1) * spread);
      const ty = Math.round(cy + (this.rnd() * 2 - 1) * spread);
      if (tx < 60 || ty < 60 || tx >= WORLD_TILES - 60 || ty >= WORLD_TILES - 60) continue;
      let ok = true;
      let onRuin: Site | undefined;
      for (const s of this.near(tx, ty, spacing)) {
        const d = Math.hypot(s.tx - tx, s.ty - ty);
        const sSettle = INHABITED.has(s.kind) || s.kind === 'relic';
        const oldRuin = s.destroyed !== undefined && INHABITED.has(s.kind) && this.y - s.destroyed > RUIN_SETTLE_AGE && !s.sunk;
        if (oldRuin) {
          if (settle && d < 24 && s.on === undefined && !onRuin) onRuin = s;
          if (d < 8) ok = false;
          continue;
        }
        if (d < (settle && sSettle ? spacing : settle || sSettle ? 34 : 16)) {
          ok = false;
          break;
        }
      }
      if (!ok || !this.good(tx, ty, 1) || !this.good(tx + 2, ty + 1, 0)) continue;
      if (this.riverNear(tx, ty, settle ? 13 : 4)) continue;
      return onRuin ? { tx, ty, onRuin } : { tx, ty };
    }
    return null;
  }

  addSite(kind: SiteKind, p: { tx: number; ty: number; onRuin?: Site }, civ: number, name: string, pop: number): Site {
    const s: Site = { id: this.sites.length, kind, name, tx: p.tx, ty: p.ty, founded: this.y, owners: [{ y: this.y, civ }], pop, events: [], arts: [], buried: [], peak: { pop, y: this.y } };
    if (p.onRuin && INHABITED.has(kind)) {
      s.on = p.onRuin.id;
      (p.onRuin.under ??= []).push(s.id);
    }
    this.sites.push(s);
    const [cx, cy] = this.cellOf(s);
    const k = cy * N + cx;
    const list = this.grid.get(k);
    if (list) list.push(s);
    else this.grid.set(k, [s]);
    // Lagegunst: wenige Orte werden groß, viele bleiben klein
    const u = ((Math.imul(s.id + 1, 2654435761) ^ this.t.seed) >>> 0) / 4294967296;
    this.favor.set(s.id, 0.04 + 0.96 * u * u * u);
    if (INHABITED.has(kind)) {
      this.living.add(s);
      this.room.set(s.id, townRoom(this, s));
      this.paintOwner(s);
    }
    return s;
  }

  uniqueName(make: () => string): string {
    let n = make();
    for (let k = 0; k < 12 && this.sites.some((s) => s.name === n); k++) n = make();
    return n;
  }

  /** Ort wird zerstört oder verlassen → Ruine. Wer dort Artefakte trug, verliert sie nicht (die Figuren fliehen). */
  destroy(s: Site, e: HEvent): void {
    if (s.destroyed !== undefined) return;
    s.destroyed = this.y;
    s.fall = this.keep(e);
    s.pop = 0;
    this.living.delete(s);
    const civ = this.civs[this.ownerOf(s)];
    if (civ && civ.capital === s.id) this.moveCapital(civ);
  }

  moveCapital(civ: Civ): void {
    const own = this.sitesOf(civ.id).filter((s) => s.kind === 'city' || s.kind === 'village');
    if (!own.length) {
      const any = this.sitesOf(civ.id);
      if (any.length) {
        civ.capital = any[0].id;
        return;
      }
      this.fallCiv(civ);
      return;
    }
    const cap = own.reduce((a, b) => (b.pop > a.pop ? b : a));
    civ.capital = cap.id;
    cap.kind = 'city';
  }

  fallCiv(civ: Civ): void {
    if (civ.fell !== undefined) return;
    civ.fell = this.y;
    for (const f of this.figures) if (f.civ === civ.id && this.isAlive(f) && f.role === 'ruler') for (const o of f.offices) if (o.to === undefined) o.to = this.y;
    for (const s of this.sitesOf(civ.id)) s.owners.push({ y: this.y, civ: -1 });
    this.wars = this.wars.filter((w) => w.a !== civ.id && w.b !== civ.id);
    this.ev('civ_fall', { civs: [civ.id] });
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
    for (const s of this.living) {
      const civ = this.ownerOf(s);
      if (civ < 0) continue;
      const [cx, cy] = this.cellOf(s);
      const r = this.reach(s);
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

  // ------------------------------------------------------------ Reiche

  /** Bester Ort für ein Volk in freiem Land, weit weg von anderen (`taken`). */
  origin(race: Race, taken: { cx: number; cy: number }[], minDist: number, freeLand = true): { cx: number; cy: number } | null {
    let best: { cx: number; cy: number; s: number } | null = null;
    for (let k = 0; k < 500; k++) {
      const cx = 8 + Math.floor(this.rnd() * (N - 16));
      const cy = 8 + Math.floor(this.rnd() * (N - 16));
      const c = this.cells[cy * N + cx];
      if (!c.land) continue;
      const pref = PREF[race][c.biome as B] ?? 0;
      if (pref <= 0) continue;
      if (freeLand && this.owner[cy * N + cx] !== -1) continue;
      if (taken.some((o) => Math.hypot(o.cx - cx, o.cy - cy) < minDist)) continue;
      const s = pref + this.fert(cx, cy) + (c.river ? 0.4 : 0) + (c.coast ? 0.3 : 0) + c.shard * 0.3 + this.rnd() * 0.3;
      if (!best || s > best.s) best = { cx, cy, s };
    }
    return best;
  }

  foundCiv(race: Race, faction: Faction, cx: number, cy: number, parent?: number, capital?: Site, kind: EventKind = 'civ_found'): Civ | null {
    const id = this.civs.length;
    let name = realmName(this.rnd, race);
    for (let k = 0; k < 12 && this.civs.some((c) => c.name === name); k++) name = realmName(this.rnd, race);
    let cap = capital;
    if (!cap) {
      const p = this.place(cx * C + C / 2, cy * C + C / 2, 'city', C * 0.8);
      if (!p) return null;
      cap = this.addSite('city', p, id, this.uniqueName(() => placeName(this.rnd, race)), Math.round((400 + this.rnd() * 300) * this.cfg.settlements.popScale));
    }
    const civ: Civ = { id, name, race, faction, color: CIV_COLORS[id % CIV_COLORS.length], founded: this.y, capital: cap.id, rulers: [], events: [], opinion: {} };
    if (parent !== undefined) civ.parent = parent;
    this.civs.push(civ);
    const founder = this.addFigure('ruler', race, id, 25 + Math.floor(this.rnd() * 20));
    this.crown(civ, founder, false);
    if (parent === undefined) this.ev(kind, { civs: [id], figs: [founder.id], sites: [cap.id] });
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

  /** Reich spaltet sich: der ferne Teil folgt einer neuen Hauptstadt. */
  split(civ: Civ, own: Site[], cause?: string): Civ | null {
    const cap = this.sites[civ.capital];
    const far = own.reduce((a, b) => (Math.hypot(b.tx - cap.tx, b.ty - cap.ty) > Math.hypot(a.tx - cap.tx, a.ty - cap.ty) ? b : a));
    const group = own.filter((s) => s !== cap && Math.hypot(s.tx - far.tx, s.ty - far.ty) < Math.hypot(s.tx - cap.tx, s.ty - cap.ty));
    if (group.length < 2) return null;
    const newCap = group.reduce((a, b) => (b.pop > a.pop ? b : a));
    const faction = this.rnd() < 0.5 ? civ.faction : this.pick(RACE_FACTIONS[civ.race]);
    const child = this.foundCiv(civ.race, faction, 0, 0, civ.id, newCap);
    if (!child) return null;
    for (const s of group) s.owners.push({ y: this.y, civ: child.id });
    if (newCap.kind === 'village') newCap.kind = 'city';
    civ.opinion[child.id] = child.opinion[civ.id] = -45;
    const refs: Refs = { civs: [child.id, civ.id], sites: [newCap.id], figs: [child.rulers[0]], n: group.length };
    if (cause) refs.cause = cause;
    this.ev('split', refs);
    return child;
  }

  strength(civ: number): number {
    return Math.sqrt(this.sitesOf(civ).reduce((s, x) => s + x.pop, 0) / 10 + 1);
  }

  declareWar(a: number, b: number, cause: string): void {
    const [atk, def] = this.strength(a) >= this.strength(b) ? [a, b] : [b, a];
    const e = this.ev('war', { civs: [atk, def], cause });
    this.wars.push({ a: atk, b: def, start: this.y, battles: 0, ev: e.id, wins: [0, 0] });
  }

  peace(w: War): void {
    this.wars = this.wars.filter((x) => x !== w);
    if (this.civs[w.a].fell !== undefined || this.civs[w.b].fell !== undefined) return;
    this.civs[w.a].opinion[w.b] = this.civs[w.b].opinion[w.a] = -10;
    this.ev('peace', { civs: [w.a, w.b], win: w.wins[0] > w.wins[1] ? w.a : w.wins[1] > w.wins[0] ? w.b : -1, n: this.y - w.start });
  }

  // ------------------------------------------------------------ Figuren und Artefakte

  addFigure(role: Role, race: Race | 'beast', civ: number, age: number, parent?: number): Figure {
    const female = race !== 'beast' && race !== 'synth' && this.rnd() < 0.5;
    let name = race === 'beast' ? beastName(this.rnd) : personName(this.rnd, race, female);
    // Keine zwei Lebenden gleichen Namens (nur die letzten paar hundert Figuren können noch leben)
    const taken = (n: string) => {
      for (let i = this.figures.length - 1; i >= 0 && i > this.figures.length - 400; i--) if (this.figures[i].name === n && this.figures[i].died === undefined) return true;
      return false;
    };
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
    // Artefakte werden immer protokolliert: ihre Geschichte soll sich verfolgen lassen
    this.ev('artifact_made', { figs: [maker.id], arts: [a.id], civs: civ ? [civ.id] : [] }, true);
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

  drop(a: Artifact, holder: Figure | null, site: Site, how: NonNullable<Artifact['lost']>['how']): void {
    if (holder) holder.holds = holder.holds.filter((x) => x !== a.id);
    a.heldBy = undefined;
    a.site = site.id;
    a.lost = { y: this.y, how };
    site.arts.push(a.id);
    if (how !== 'buried') this.ev('artifact_lost', { arts: [a.id], figs: holder ? [holder.id] : [], sites: [site.id], cause: how }, true);
  }

  /** Tod einer Figur; Ämter enden, Artefakte werden vererbt, begraben, erbeutet oder gehen verloren. */
  die(f: Figure, cause: DeathCause, killer?: Figure, site?: Site): void {
    if (!this.isAlive(f)) return;
    if (this.immortal.has(f.id)) return;
    // In langen Schritten stirbt man am Alter zum richtigen Jahr, nicht erst am Schrittende
    f.died = cause === 'age' ? Math.min(this.y, f.born + this.lifespan(f)) : this.y;
    f.cause = cause;
    if (killer) {
      f.killer = killer.id;
      killer.kills++;
    }
    if (site) f.deathSite = site.id;
    for (const o of f.offices) if (o.to === undefined) o.to = Math.max(o.from, f.died);
    const civ = this.civs[f.civ];
    // Bestattung: Herrscher und manche Helden bekommen ein Grabmal
    let tomb: Site | null = null;
    if (f.race !== 'beast' && civ && (cause === 'age' || cause === 'plague' || cause === 'murder') && ((f.role === 'ruler' && f.offices.length > 0) || (f.role === 'hero' && this.rnd() < 0.25) || f.role === 'mage')) {
      tomb = this.tombFor(civ);
    }
    this.ev('death', { figs: killer ? [f.id, killer.id] : [f.id], civs: civ ? [civ.id] : [], sites: site ? [site.id] : tomb ? [tomb.id] : [], cause });
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
          this.ev('artifact_loot', { arts: [a.id], figs: [killer.id, f.id] }, true);
        } else if (site) this.drop(a, f, site, 'battle');
        else if (heir) this.give(a, f, heir, 'inherit');
      } else if (cause === 'beast') {
        if (killer?.lair !== undefined) this.drop(a, f, this.sites[killer.lair], 'hoard');
      } else if (cause === 'shattering' || cause === 'cataclysm') {
        if (site) this.drop(a, f, site, cause === 'shattering' ? 'shattering' : 'ruin');
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
    if (tomb) this.ev('burial', { figs: [f.id], sites: [tomb.id], arts: buried, civs: civ ? [civ.id] : [] }, buried.length > 0);
  }

  /** Figuren, die (noch) nicht sterben dürfen, z. B. die Hauptfiguren eines Weltereignisses. */
  readonly immortal = new Set<number>();

  /** Grabmal eines Reiches nahe der Hauptstadt (wird wiederverwendet). */
  tombFor(civ: Civ): Site | null {
    const cap = this.sites[civ.capital];
    if (!cap) return null;
    const near = this.near(cap.tx, cap.ty, 140, (s) => s.kind === 'tomb' && this.ownerOf(s) === civ.id && s.buried.length < 12)[0];
    if (near) return near;
    const p = this.place(cap.tx, cap.ty, 'tomb', 90);
    if (!p) return null;
    return this.addSite('tomb', p, civ.id, specialName(this.rnd, 'tomb', civ.race, cap.name), 0);
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
      if (!near && !this.near(cx * C, cy * C, 10 * C, (s) => this.alive(s)).length) continue;
      const p = this.place(cx * C + C / 2, cy * C + C / 2, 'lair');
      if (!p) continue;
      const b = this.addFigure('beast', 'beast', -1, 50 + Math.floor(this.rnd() * 100));
      b.beastKind = k;
      const nearest = this.near(p.tx, p.ty, 12 * C, (s) => INHABITED.has(s.kind)).reduce<Site | null>((a, s) => (!a || Math.hypot(s.tx - p.tx, s.ty - p.ty) < Math.hypot(a.tx - p.tx, a.ty - p.ty) ? s : a), null);
      const lair = this.addSite('lair', p, -1, specialName(this.rnd, 'lair', 'human', nearest?.name ?? this.worldName), 0);
      lair.beast = b.id;
      b.lair = lair.id;
      this.ev('beast_arrive', { figs: [b.id], sites: [lair.id] }, true);
      return b;
    }
    return null;
  }

  // ------------------------------------------------------------ Ablauf

  /** Vorzeit: Relikte der Ersten Maschinen in der Schrottödnis. */
  private prehistory(): void {
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
    const e = this.ev('prehistory', { sites: relics }, true);
    for (const id of relics) this.sites[id].fall = e.id;
  }

  /** Die Urreiche: über das erste Zehntel der Zeit verteilt (nicht alle im selben Jahr). */
  private planOrigins(): void {
    const races = (['human', 'elf', 'orc'] as Race[]).filter((r) => this.cfg.civs.races[r]);
    if (!races.length) races.push('human');
    const span = Math.max(1, Math.min(this.tl.end * 0.1, this.tl.epochs[0].years * 0.5));
    for (let i = 0; i < this.cfg.civs.initial; i++) {
      this.flags[`origin${i}`] = i === 0 ? 0 : Math.round(this.rnd() * span);
      this.flags[`originRace${i}`] = races.indexOf(races[i % races.length]);
    }
    this.flags.origins = this.cfg.civs.initial;
    this.flags.originRaces = races.length;
    this.originRaces = races;
  }

  originRaces: Race[] = [];

  run(): void {
    this.prehistory();
    this.planOrigins();
    this.runs = scheduleWorldEvents(this);
    // Ohne Krieg der Maschinen erwachen die Synths nach gut einem Drittel der Zeit
    if (!this.runs.some((r) => r.def.id === 'machinewar')) this.flags.synths = Math.round(this.tl.end * 0.35);
    let prev = 0;
    for (const st of steps(this.tl)) {
      this.dt = st.dt;
      this.epoch = st.epoch;
      this.worldEventsStep(prev, st.y);
      this.y = st.y;
      this.recomputeOwner();
      for (const sys of SYSTEMS) {
        if (this.rate(sys.id) <= 0) continue;
        if (sys.minDetail !== undefined && this.detail < sys.minDetail) continue;
        sys.step(this);
      }
      for (const s of this.living) if (s.pop > s.peak.pop) s.peak = { pop: Math.round(s.pop), y: this.y };
      prev = st.y;
    }
    this.y = this.tl.end;
  }

  /** Weltereignisse beginnen und enden im Schritt (prev, y] in zeitlicher Reihenfolge; aktive laufen danach je Schritt. */
  private worldEventsStep(prev: number, y: number): void {
    const acts: { t: number; start: boolean; run: WorldRun; def: WorldEventDef }[] = [];
    for (const r of this.runs) {
      if (r.run.from > prev && r.run.from <= y) acts.push({ t: r.run.from, start: true, ...r });
      if (r.run.to > prev && r.run.to <= y && r.run.from <= y) acts.push({ t: Math.max(r.run.from, r.run.to), start: false, ...r });
    }
    acts.sort((a, b) => a.t - b.t || (a.start ? -1 : 1));
    for (const act of acts) {
      this.y = act.t;
      this.epoch = epochAt(this.tl, this.y);
      if (act.start) {
        const a: ActiveRun = { run: act.run, def: act.def, state: {} };
        this.active.push(a);
        const refs = act.def.start?.(this, a) ?? {};
        if (!act.def.silent) act.run.events.unshift(this.ev('world', { ...refs, cause: act.def.id, n: 0 }, true).id);
      } else {
        const a = this.active.find((x) => x.run === act.run);
        if (!a) continue;
        a.def.step?.(this, a);
        a.def.end?.(this, a);
        if (!a.def.silent && a.run.to > a.run.from) a.run.events.push(this.ev('world', { cause: a.def.id, n: 1 }, true).id);
        this.active = this.active.filter((x) => x !== a);
      }
    }
    this.y = y;
    this.epoch = epochAt(this.tl, Math.max(0, y - 1));
    for (const a of this.active) a.def.step?.(this, a);
  }

  result(ms: number): History {
    const shattering = this.runs.find((r) => r.def.id === 'shattering')?.run.to ?? 0;
    const h: History = {
      seed: this.t.seed, years: this.tl.end, config: this.cfg, epochs: this.tl.epochs, worldRuns: this.runs.map((r) => r.run),
      knowledge: { ev: new Uint8Array(0), site: new Uint8Array(0), fig: new Uint8Array(0), art: new Uint8Array(0), civ: new Uint8Array(0) },
      worldName: this.worldName, shattering, cells: this.cells,
      civs: this.civs, sites: this.sites, figures: this.figures, artifacts: this.artifacts, events: this.events, rivers: this.rivers, ms,
    };
    h.knowledge = assessKnowledge(h);
    return h;
  }
}

/** Erzeugt die Vorgeschichte einer Welt (deterministisch aus Seed, Landschaft und Konfiguration). */
export function generateHistory(t: Terrain, opts: HistoryOptions = {}): History {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const sim = new Sim(t, resolveConfig(opts.config));
  sim.run();
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return sim.result(t1 - t0);
}

export { ARTIFACT_KINDS, BEASTS, WORLD_EVENTS };
