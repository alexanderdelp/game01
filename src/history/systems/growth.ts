/**
 * Wachstum: Orte wachsen logistisch bis zu ihrer Tragfähigkeit (Boden, Fluss, Küste, Handel, Hauptstadt, Lagegunst,
 * Platz zum Nachbarn), bauen Mauern, gründen Tochterdörfer und Sonderorte (Türme, Labore, Tempel, Festungen, Minen).
 */
import { B } from '../../world/biomes';
import { placeName, specialName } from '../names';
import { PREF } from '../rules';
import type { Sim } from '../simulate';
import { popForRoom, tierOf, townRoom } from '../towns';
import { HISTORY_CELL, HISTORY_GRID, type Civ, type Site, type SiteKind } from '../types';
import type { HistorySystem } from './types';

const N = HISTORY_GRID;
const C = HISTORY_CELL;
/** Sonderorte bleiben klein */
const SPECIAL_POP = 120;

/** Tragfähigkeit eines Ortes (Einwohner). */
export function popCap(sim: Sim, s: Site): number {
  const [cx, cy] = sim.cellOf(s);
  const c = sim.cells[cy * N + cx];
  const scale = sim.cfg.settlements.popScale;
  if (s.kind !== 'city' && s.kind !== 'village') return SPECIAL_POP * scale;
  const civ = sim.civs[sim.ownerOf(s)];
  const capital = civ?.capital === s.id;
  const trade = Math.min(4, sim.tradeRoutes.get(s.id) ?? 0);
  const base = 200 + 7000 * sim.fert(cx, cy) + (c.river ? 2500 : 0) + (c.coast ? 2000 : 0) + 1500 * trade;
  const cap = base * (sim.favor.get(s.id) ?? 0.5) * (capital ? 2.5 : 1) * scale;
  return Math.max(60 * scale, Math.min(cap, popForRoom(sim.cfg, sim.room.get(s.id) ?? 30)));
}

function expand(sim: Sim, civ: Civ, from: Site): void {
  const [cx, cy] = sim.cellOf(from);
  let best: { cx: number; cy: number; s: number } | null = null;
  for (let k = 0; k < 10; k++) {
    const a = sim.rnd() * Math.PI * 2;
    const d = 3 + sim.rnd() * 4;
    const nx = Math.round(cx + Math.cos(a) * d);
    const ny = Math.round(cy + Math.sin(a) * d);
    const c = sim.cell(nx, ny);
    if (!c || !c.land) continue;
    const o = sim.owner[ny * N + nx];
    if (o !== -1 && o !== civ.id) continue;
    const pref = PREF[civ.race][c.biome as B] ?? 0.1;
    const s = sim.fert(nx, ny) + pref * 0.5 + c.wood * 0.2 + c.ore * 0.2 + c.shard * 0.6 + (c.river ? 0.5 : 0) + (c.coast ? 0.3 : 0) + sim.rnd() * 0.3;
    if (!best || s > best.s) best = { cx: nx, cy: ny, s };
  }
  if (!best || best.s < 0.6) return;
  const p = sim.place(best.cx * C + C / 2, best.cy * C + C / 2, 'village');
  if (!p) return;
  const settlers = 120 * sim.cfg.settlements.popScale;
  const s = sim.addSite('village', p, civ.id, sim.uniqueName(() => placeName(sim.rnd, civ.race)), settlers);
  from.pop = Math.max(30, from.pop - settlers);
  sim.ev('site_found', { civs: [civ.id], sites: p.onRuin ? [s.id, from.id, p.onRuin.id] : [s.id, from.id], cause: p.onRuin ? 'ruin' : undefined });
}

function special(sim: Sim, civ: Civ, own: Site[], kind: SiteKind): void {
  const base = sim.pick(own);
  const [cx, cy] = sim.cellOf(base);
  let best: { cx: number; cy: number; s: number } | null = null;
  for (let k = 0; k < 10; k++) {
    const nx = cx + Math.floor(sim.rnd() * 7) - 3;
    const ny = cy + Math.floor(sim.rnd() * 7) - 3;
    const c = sim.cell(nx, ny);
    if (!c || !c.land) continue;
    const border = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const o = sim.owner[(ny + dy) * N + nx + dx];
      return o !== -1 && o !== civ.id;
    });
    const s = kind === 'tower' ? c.shard * 2 + c.h : kind === 'lab' ? c.scrap + c.shard : kind === 'mine' ? c.ore * 2 : kind === 'fortress' ? (border ? 2 : 0) + c.h : c.fert + c.h;
    if (!best || s + sim.rnd() * 0.3 > best.s) best = { cx: nx, cy: ny, s };
  }
  if (!best || (kind === 'mine' && best.s < 0.8)) return;
  const p = sim.place(best.cx * C + C / 2, best.cy * C + C / 2, kind);
  if (!p) return;
  const s = sim.addSite(kind, p, civ.id, sim.uniqueName(() => specialName(sim.rnd, kind, civ.race, base.name)), 40);
  const builder = sim.figures.find((f) => sim.isAlive(f) && f.civ === civ.id && (kind === 'tower' ? f.role === 'mage' : kind === 'lab' ? f.role === 'engineer' : kind === 'temple' ? f.role === 'priest' : false));
  sim.ev('site_found', { civs: [civ.id], sites: [s.id, base.id], figs: builder ? [builder.id] : [] });
}

export const growth: HistorySystem = {
  id: 'growth',
  label: 'Wachstum & Gründungen',
  summary: 'Orte wachsen bis zur Tragfähigkeit (Boden, Fluss, Küste, Handel, Platz), bauen Mauern und gründen Tochterorte und Sonderorte.',
  step(sim) {
    const cfg = sim.cfg;
    const rate = 0.02 * sim.rate('growth') * sim.mod('growth');
    // Platz bis zum Nachbarn ändert sich langsam: alle 25 Jahre neu
    const epochKey = Math.floor(sim.y / 25);
    if (sim.flags.roomAt !== epochKey) {
      sim.flags.roomAt = epochKey;
      for (const s of sim.living) sim.room.set(s.id, townRoom(sim, s));
    }
    const size = new Map<number, number>();
    for (const s of sim.living) size.set(sim.ownerOf(s), (size.get(sim.ownerOf(s)) ?? 0) + 1);
    const total = sim.living.size;
    const wallTier = cfg.towns.wallTier;
    const townPop = cfg.towns.tiers[Math.min(3, cfg.towns.tiers.length - 1)]?.minPop ?? 3000;
    for (const s of [...sim.living]) {
      const cap = popCap(sim, s);
      // Logistisches Wachstum, geschlossen über den Schritt gerechnet (auch Schrumpfen, wenn die Tragfähigkeit fällt)
      const k = Math.exp(-rate * sim.dt);
      s.pop = cap / (1 + (cap / Math.max(1, s.pop) - 1) * k);
      if (s.kind === 'village' && s.pop > townPop) s.kind = 'city';
      const civ = sim.civs[sim.ownerOf(s)];
      if (!civ) continue;
      if (s.walls === undefined && tierOf(cfg, s.pop) >= wallTier && wallTier < cfg.towns.tiers.length && sim.chance(civ.faction === 'traders' ? 0.008 : 0.03)) {
        s.walls = sim.y;
        sim.ev('walls', { civs: [civ.id], sites: [s.id] });
      }
      if (s.kind !== 'city' && s.kind !== 'village') continue;
      // Neue Dörfer bevorzugt an Flüssen, Küsten und Ressourcen; große Reiche wachsen langsamer (weich bei ~18 Orten)
      const free = Math.max(0, 1 - (size.get(civ.id) ?? 0) / 18) * Math.max(0, 1 - total / cfg.settlements.maxAlive);
      if (s.pop > 600 * cfg.settlements.popScale && sim.chance(0.03 * sim.rate('growth') * sim.mod('founding') * free)) expand(sim, civ, s);
    }
    for (const civ of sim.aliveCivs()) {
      if (sim.living.size >= cfg.settlements.maxAlive || !sim.chance(0.008 * sim.rate('growth') * sim.mod('founding'))) continue;
      const own = sim.sitesOf(civ.id);
      // Sonderorte nur, solange das Reich genug Dörfer und Städte hat, die sie versorgen
      const towns = own.filter((s) => s.kind === 'city' || s.kind === 'village').length;
      if (own.length < 3 || own.length - towns > 1 + towns / 3) continue;
      const kind: SiteKind | null = civ.faction === 'mages' ? 'tower' : civ.faction === 'techno' ? 'lab' : civ.faction === 'order' ? 'temple' : civ.faction === 'clan' ? 'fortress' : null;
      if (kind) special(sim, civ, own, kind);
      if (sim.rnd() < 0.3) special(sim, civ, own, 'mine');
    }
  },
};
