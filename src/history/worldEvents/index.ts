/**
 * Weltereignisse: einschneidende, weltweite Ereignisse, die die Geschichte in Zeitalter gliedern.
 *
 * Neues Weltereignis: Datei mit einer `WorldEventDef` anlegen, hier in `WORLD_EVENTS` eintragen und in `config.ts`
 * (`worldEvents.defs`) mit `{ on: true, weight: 1 }` vorbelegen. Planung: `scheduleWorldEvents` wählt nach Gewicht
 * und setzt die Ereignisse mit Mindestabstand in passende Zeitalter.
 */
import { mulberry32 } from '../../world/rng';
import type { Sim } from '../simulate';
import type { WorldRun } from '../types';
import { darkage, goldenage } from './ages';
import { flood, iceage } from './climate';
import { machinewar } from './machinewar';
import { migration } from './migration';
import { plagueage } from './plagueage';
import { shattering } from './shattering';
import { starfall } from './starfall';
import type { WorldEventDef } from './types';

export type { ModKey, WorldEventDef, WorldRefs } from './types';
export { MOD_LABELS } from './types';

export const WORLD_EVENTS: WorldEventDef[] = [starfall, machinewar, flood, iceage, plagueage, darkage, migration, goldenage, shattering];

export const worldEventDef = (id: string): WorldEventDef | undefined => WORLD_EVENTS.find((d) => d.id === id);

/** Plant die Weltereignisse einer Geschichte (deterministisch, eigener Zufallsstrom). */
export function scheduleWorldEvents(sim: Sim): { run: WorldRun; def: WorldEventDef }[] {
  const rnd = mulberry32((sim.cfg.epochs.length * 7919) ^ sim.tl.end ^ (sim.rnd() * 4294967296));
  const conf = sim.cfg.worldEvents;
  const end = sim.tl.end;
  const out: { run: WorldRun; def: WorldEventDef }[] = [];
  const fits = (from: number, to: number) => out.every(({ run }) => to + conf.minGap <= run.from || from >= run.to + conf.minGap);
  const enabled = (d: WorldEventDef) => conf.defs[d.id]?.on !== false;
  const dur = (d: WorldEventDef) => d.duration[0] + Math.round(rnd() * (d.duration[1] - d.duration[0]));
  // Feste Ereignisse zuerst (die Zersplitterung kurz vor der Gegenwart)
  for (const d of WORLD_EVENTS) {
    if (!d.fixedAgo || !enabled(d)) continue;
    const ago = d.fixedAgo[0] + Math.round(rnd() * (d.fixedAgo[1] - d.fixedAgo[0]));
    const len = dur(d);
    const to = end > ago + len + 50 ? end - ago : Math.round(end * 0.6);
    out.push({ run: { def: d.id, from: Math.max(1, to - len), to, events: [] }, def: d });
  }
  // Zufällige nach Gewicht
  const pool = WORLD_EVENTS.filter((d) => !d.fixedAgo && enabled(d) && (conf.defs[d.id]?.weight ?? 1) > 0);
  for (let i = 0; i < conf.count && pool.length; i++) {
    const total = pool.reduce((s, d) => s + (conf.defs[d.id]?.weight ?? 1), 0);
    let x = rnd() * total;
    let def = pool[0];
    for (const d of pool) {
      x -= conf.defs[d.id]?.weight ?? 1;
      if (x <= 0) {
        def = d;
        break;
      }
    }
    const epochs = sim.tl.epochs.filter((e) => def.details.includes(e.detail));
    const span = epochs.reduce((s, e) => s + e.years, 0);
    for (let k = 0; k < 40 && span > 0; k++) {
      let at = rnd() * span;
      const ep = epochs.find((e) => (at -= e.years) < 0) ?? epochs[epochs.length - 1];
      const len = dur(def);
      const from = Math.round(ep.from + Math.max(1, rnd() * (ep.years - Math.min(len, ep.years * 0.5))));
      const to = Math.min(end - 1, from + len);
      if (from < 1 || from >= end || !fits(from, to)) continue;
      out.push({ run: { def: def.id, from, to, events: [] }, def });
      break;
    }
    if (!def.repeat) pool.splice(pool.indexOf(def), 1);
  }
  return out.sort((a, b) => a.run.from - b.run.from);
}
