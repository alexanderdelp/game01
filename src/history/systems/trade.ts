/** Handel: Händler knüpfen Wege zu Städten anderer Reiche; das verbessert Beziehungen und lässt Orte wachsen. */
import { HISTORY_CELL } from '../types';
import type { HistorySystem } from './types';

export const trade: HistorySystem = {
  id: 'trade',
  label: 'Handel',
  summary: 'Händler (vor allem Freie Händler) eröffnen Handelswege zu Städten anderer Reiche: bessere Beziehungen, größere Orte.',
  step(sim) {
    const r = sim.rate('trade') * sim.mod('trade');
    for (const civ of sim.aliveCivs()) {
      if (!sim.chance((civ.faction === 'traders' ? 0.04 : 0.006) * r)) continue;
      const own = sim.sitesOf(civ.id);
      if (!own.length) continue;
      const a = sim.pick(own);
      const partners = sim.near(a.tx, a.ty, 25 * HISTORY_CELL, (s) => sim.alive(s) && s.kind === 'city' && sim.ownerOf(s) !== civ.id && sim.ownerOf(s) >= 0 && (civ.opinion[sim.ownerOf(s)] ?? 0) > -20);
      if (!partners.length) continue;
      const b = sim.pick(partners);
      const other = sim.ownerOf(b);
      civ.opinion[other] = Math.min(100, (civ.opinion[other] ?? 0) + 15);
      sim.civs[other].opinion[civ.id] = civ.opinion[other];
      for (const s of [a, b]) sim.tradeRoutes.set(s.id, (sim.tradeRoutes.get(s.id) ?? 0) + 1);
      sim.ev('trade', { civs: [civ.id, other], sites: [a.id, b.id] });
    }
  },
};
