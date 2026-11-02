/**
 * Größe und Gestalt der Orte: Größenstufen (Weiler … Großstadt), Platz bis zum Nachbarort und die Vorgaben für den
 * Stadtplan im Spiel (Gebäudezahl, Mauerring, Verfall). Rein.
 */
import type { HistoryConfig } from './config';
import type { Sim } from './simulate';
import { INHABITED, type History, type Site } from './types';

/** Fläche je Gebäude im Stadtplan (Kacheln², inklusive Gassen). */
export const TILES_PER_BUILDING = 22;

/** Index der Größenstufe einer Einwohnerzahl. */
export function tierOf(cfg: HistoryConfig, pop: number): number {
  let t = 0;
  cfg.towns.tiers.forEach((x, i) => {
    if (pop >= x.minPop) t = i;
  });
  return t;
}

/** Gebäude für eine Einwohnerzahl. */
export function buildingsFor(cfg: HistoryConfig, pop: number): number {
  return Math.max(3, Math.min(cfg.towns.maxBuildings, Math.round(pop / cfg.towns.peoplePerHouse)));
}

/** Radius (Kacheln) eines Ortes mit so vielen Gebäuden. */
export function radiusFor(buildings: number): number {
  return Math.max(6, Math.round(Math.sqrt((buildings * TILES_PER_BUILDING) / Math.PI)) + 3);
}

/** Platz bis zum nächsten bewohnten Nachbarn (Radius in Kacheln, halber Abstand minus Rand). */
export function townRoom(sim: Sim, s: Site): number {
  let d = 400;
  for (const o of sim.near(s.tx, s.ty, 400, (x) => x !== s && sim.alive(x))) d = Math.min(d, Math.hypot(o.tx - s.tx, o.ty - s.ty));
  return Math.max(8, d / 2 - 4);
}

/** Höchste Einwohnerzahl, die auf den Platz passt. */
export function popForRoom(cfg: HistoryConfig, room: number): number {
  const r = Math.max(0, room - 3);
  return ((Math.PI * r * r) / TILES_PER_BUILDING) * cfg.towns.peoplePerHouse;
}

/** Vorgaben für den Stadtplan eines heute bewohnten Ortes. */
export interface TownPlan {
  tier: number;
  tierLabel: string;
  pop: number;
  buildings: number;
  /** Radius der heutigen Bebauung */
  radius: number;
  /** Mauerring (Radius in Kacheln) oder 0 */
  wall: number;
  /** Anteil verfallener Häuser zwischen Bebauung und Mauer (0–1) */
  decay: number;
  /** Gründungsjahr, Blütezeit, Mauerbau */
  founded: number;
  peakYear: number;
  wallYear?: number;
}

export function townPlan(h: History, s: Site): TownPlan {
  const cfg = h.config;
  const tier = tierOf(cfg, s.pop);
  const buildings = INHABITED.has(s.kind) && s.kind !== 'city' && s.kind !== 'village' ? Math.min(12, buildingsFor(cfg, s.pop)) : buildingsFor(cfg, s.pop);
  const radius = radiusFor(buildings);
  const peakB = buildingsFor(cfg, s.peak.pop);
  const walled = s.walls !== undefined;
  const wall = walled ? Math.max(radius + 2, radiusFor(peakB) + 1) : 0;
  const decay = walled ? Math.max(0, 1 - s.pop / Math.max(1, s.peak.pop)) : 0;
  return { tier, tierLabel: cfg.towns.tiers[tier]?.label ?? '', pop: Math.round(s.pop), buildings, radius, wall, decay, founded: s.founded, peakYear: s.peak.y, wallYear: s.walls };
}
