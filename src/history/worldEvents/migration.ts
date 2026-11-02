/** Völkerwanderung: Ein Reich verlässt seine Heimat und gründet weit entfernt eine neue Hauptstadt. */
import { placeName } from '../names';
import { HISTORY_CELL } from '../types';
import type { WorldEventDef } from './types';

const C = HISTORY_CELL;

export const migration: WorldEventDef = {
  id: 'migration',
  label: 'Völkerwanderung',
  summary: 'Ein Reich verlässt seine Heimat – die alten Orte werden zu Ruinen – und gründet weit entfernt eine neue Hauptstadt.',
  details: [0, 1, 2],
  duration: [0, 0],
  repeat: true,
  silent: true,
  start(sim, a) {
    const civs = sim.aliveCivs().filter((c) => sim.sitesOf(c.id).length >= 3);
    if (!civs.length) return;
    const civ = sim.pick(civs);
    const old = sim.sites[civ.capital];
    const [ox, oy] = sim.cellOf(old);
    const caps = sim.aliveCivs().map((c) => {
      const [cx, cy] = sim.cellOf(sim.sites[c.capital]);
      return { cx, cy };
    });
    // Weit weg und frei; im Notfall zumindest weit weg
    let to = null as { cx: number; cy: number } | null;
    for (let k = 0; k < 6 && !to; k++) {
      const o = sim.origin(civ.race, caps, 14, k < 4);
      if (o && Math.hypot(o.cx - ox, o.cy - oy) > 30) to = o;
    }
    if (!to) return;
    const p = sim.place(to.cx * C + C / 2, to.cy * C + C / 2, 'city', C);
    if (!p) return;
    const own = sim.sitesOf(civ.id);
    const people = own.reduce((s, x) => s + x.pop, 0);
    const cap = sim.addSite('city', p, civ.id, sim.uniqueName(() => placeName(sim.rnd, civ.race)), people * 0.4);
    const e = sim.ev('migrate', { civs: [civ.id], sites: [cap.id, old.id], n: Math.round(people * 0.4) }, true);
    a.run.events.push(e.id);
    a.run.site = cap.id;
    civ.capital = cap.id;
    for (const s of own) if (sim.rnd() < 0.75) sim.destroy(s, sim.ev('abandon', { sites: [s.id], civs: [civ.id], cause: 'migration' }));
    return { civs: [civ.id], sites: [cap.id, old.id], figs: e.figs };
  },
  text() {
    return 'Eine Völkerwanderung.';
  },
};
