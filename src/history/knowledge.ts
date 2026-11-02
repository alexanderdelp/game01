/**
 * Überlieferung: Aus der wahren Geschichte wird, was man heute weiß. Je Ereignis eine Klarheit 0–1 aus Zeitalter,
 * Bedeutung, Gedächtnis des Volks, späteren dunklen Zeitaltern, Untergang des berichtenden Reichs und Rauschen.
 * Orte, Figuren, Reiche und Artefakte erben die beste Stufe ihrer Ereignisse. Rein.
 */
import { importanceOf } from './events';
import { epochAt } from './timeline';
import type { History } from './types';
import { worldEventDef } from './worldEvents';

/** 0 verschollen, 1 Sage, 2 vage, 3 gewiss */
export type Lore = 0 | 1 | 2 | 3;
export const LORE_LABEL = ['verschollen', 'Sage', 'vage', 'gewiss'] as const;

export interface Knowledge {
  ev: Uint8Array;
  site: Uint8Array;
  fig: Uint8Array;
  art: Uint8Array;
  civ: Uint8Array;
}

const level = (c: number): Lore => (c >= 0.7 ? 3 : c >= 0.45 ? 2 : c >= 0.25 ? 1 : 0);

/** Deterministisches Rauschen −1 … 1 je Ereignis. */
const noise = (seed: number, id: number) => ((Math.imul(id + 0x9e37, 0x85ebca6b) ^ seed) >>> 0) / 2147483648 - 1;

export function assessKnowledge(h: History): Knowledge {
  const k = h.config.knowledge;
  const tl = { epochs: h.epochs, end: h.years };
  const dark = h.worldRuns.filter((r) => worldEventDef(r.def)?.darkAge).map((r) => r.from);
  const ev = new Uint8Array(h.events.length);
  for (const e of h.events) {
    let c = epochAt(tl, Math.max(0, e.y)).clarity + importanceOf(e.k) * k.importance;
    const civ = h.civs[e.civs[0]];
    if (civ) {
      c += k.memory[civ.race] ?? 0;
      if (civ.fell !== undefined) c -= k.fallenLoss;
    }
    for (const d of dark) if (d > e.y) c -= k.darkAgeLoss;
    c += noise(h.seed, e.id) * k.noise;
    ev[e.id] = level(c);
  }
  const best = (ids: number[], base: Lore = 0) => ids.reduce<number>((m, i) => Math.max(m, ev[i] ?? 0), base);
  const site = new Uint8Array(h.sites.length);
  for (const s of h.sites) site[s.id] = s.destroyed === undefined && s.founded >= 0 && s.kind !== 'tomb' && s.kind !== 'battlefield' && s.kind !== 'lair' ? 3 : best(s.events);
  const fig = new Uint8Array(h.figures.length);
  for (const f of h.figures) fig[f.id] = f.died === undefined ? 3 : best(f.events);
  const civ = new Uint8Array(h.civs.length);
  for (const c of h.civs) civ[c.id] = c.fell === undefined ? 3 : best(c.events);
  const art = new Uint8Array(h.artifacts.length);
  for (const a of h.artifacts) {
    // Ein verlorenes Artefakt ist so bekannt wie sein Verlust; ein getragenes wie seine Entstehung
    const evs = h.events.filter((e) => e.arts.includes(a.id));
    const lostEv = a.lost ? evs.filter((e) => e.y >= a.lost!.y) : [];
    art[a.id] = a.heldBy !== undefined && h.figures[a.heldBy]?.died === undefined ? 3 : a.lost ? best(lostEv.map((e) => e.id)) : best(evs.map((e) => e.id));
  }
  return { ev, site, fig, art, civ };
}

/** Jahresangabe nach Überlieferung: genau, „um 3450“ oder nur das Zeitalter. */
export function loreYear(h: History, y: number, lore: number): string {
  if (y < 0) return 'Vorzeit';
  if (lore >= 3) return `Jahr ${y}`;
  const ep = epochAt({ epochs: h.epochs, end: h.years }, y);
  if (lore === 2) {
    const r = ep.step >= 10 ? 100 : 50;
    return `um ${Math.round(y / r) * r}`;
  }
  return ep.label;
}
