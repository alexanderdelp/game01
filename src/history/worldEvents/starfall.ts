/** Splitterfall: Kristalle stürzen vom Himmel, reißen Krater, säen Splitter-Adern und wecken Bestien. */
import { B } from '../../world/biomes';
import { listText } from '../narrate';
import { placeName } from '../names';
import { HISTORY_CELL, HISTORY_GRID } from '../types';
import type { WorldEventDef } from './types';

const N = HISTORY_GRID;
const C = HISTORY_CELL;

export const starfall: WorldEventDef = {
  id: 'starfall',
  label: 'Splitterfall',
  summary: 'Kristalle stürzen vom Himmel: Krater, neue Splitter-Adern, erwachende Bestien – danach blüht die Magie.',
  details: [0, 1],
  duration: [150, 300],
  mods: { mages: 2.5, beasts: 1.5 },
  start(sim, a) {
    const groves = sim.cells.map((c, i) => ({ c, i })).filter((x) => x.c.land && x.c.biome === B.CrystalGrove);
    const lands = groves.length >= 3 ? groves : sim.cells.map((c, i) => ({ c, i })).filter((x) => x.c.land);
    const craters: number[] = [];
    const ruined: number[] = [];
    const n = 2 + Math.floor(sim.rnd() * 3);
    for (let k = 0; k < n * 4 && craters.length < n; k++) {
      const { i } = sim.pick(lands);
      const cx = i % N;
      const cy = Math.floor(i / N);
      if (craters.some((id) => Math.hypot(sim.cellOf(sim.sites[id])[0] - cx, sim.cellOf(sim.sites[id])[1] - cy) < 12)) continue;
      const p = sim.place(cx * C + C / 2, cy * C + C / 2, 'crater', C);
      if (!p) continue;
      const crater = sim.addSite('crater', p, -1, `Sternenfall ${placeName(sim.rnd, 'elf')}`, 0);
      craters.push(crater.id);
      for (const s of sim.near(crater.tx, crater.ty, 2.5 * C, (x) => sim.alive(x))) {
        ruined.push(s.id);
        sim.destroy(s, sim.ev('abandon', { sites: [s.id], civs: [sim.ownerOf(s)].filter((c) => c >= 0), cause: 'starfall' }, true));
      }
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const c = sim.cell(cx + dx, cy + dy);
        if (c?.land && dx * dx + dy * dy <= 9) c.shard = Math.max(c.shard, 0.7 - Math.hypot(dx, dy) * 0.1);
      }
      if (sim.rnd() < 0.7) sim.spawnBeast({ cx, cy }, 1);
    }
    a.run.site = craters[0];
    a.state.ruined = ruined.length;
    return { sites: craters };
  },
  text(_h, e, L) {
    if (e.n === 1) return 'Das Leuchten des Splitterfalls verblasste. Die Kristalle blieben – und mit ihnen die Magie.';
    return `Der Splitterfall: Kristalle stürzten vom Himmel und rissen ${e.sites.length > 1 ? 'Krater' : 'einen Krater'} in das Land – ${listText(e.sites.map(L.site))}. Wo sie aufschlugen, wuchsen Splitter-Adern, und Ungeheuer erwachten.`;
  },
};
