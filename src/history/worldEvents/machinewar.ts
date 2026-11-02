/** Krieg der Ersten Maschinen: Die Relikte der Vorzeit erwachen und verwüsten das Umland; aus ihren Resten erwachen die Synths. */
import { listText } from '../narrate';
import { HISTORY_CELL } from '../types';
import type { WorldEventDef } from './types';

const C = HISTORY_CELL;

export const machinewar: WorldEventDef = {
  id: 'machinewar',
  label: 'Krieg der Ersten Maschinen',
  summary: 'Die Relikte der Vorzeit erwachen und verwüsten das Umland der Schrottödnis; danach erwachen aus ihren Resten die Synths.',
  details: [0, 1],
  duration: [80, 250],
  mods: { growth: 0.85, founding: 0.6 },
  start(sim, a) {
    const relics = sim.sites.filter((s) => s.kind === 'relic');
    for (const r of relics.slice(0, 2)) sim.spawnBeast({ cx: sim.cellOf(r)[0], cy: sim.cellOf(r)[1] }, 2);
    a.run.site = relics[0]?.id;
    return { sites: relics.map((s) => s.id) };
  },
  step(sim) {
    for (const r of sim.sites) {
      if (r.kind !== 'relic') continue;
      for (const s of sim.near(r.tx, r.ty, 14 * C, (x) => sim.alive(x))) {
        if (sim.chance(0.006)) sim.destroy(s, sim.ev('abandon', { sites: [s.id, r.id], civs: [sim.ownerOf(s)].filter((c) => c >= 0), cause: 'machinewar' }));
      }
    }
  },
  end(sim) {
    if (sim.flags.synths === undefined) sim.flags.synths = sim.y + 30 + Math.floor(sim.rnd() * 120);
  },
  text(_h, e, L) {
    if (e.n === 1) return 'Die Kriegsmaschinen verstummten. In ihren Trümmern regte sich etwas Neues.';
    return `Der Krieg der Ersten Maschinen: ${e.sites.length ? listText(e.sites.map(L.site)) : 'Die Relikte der Vorzeit'} erwachten und zogen verheerend durch das Umland.`;
  },
};
