/** Klima: Große Flut (Küstenorte versinken) und Eiszeit (der Norden verödet, Reiche ziehen nach Süden). */
import { HISTORY_GRID } from '../types';
import type { WorldEventDef } from './types';

const N = HISTORY_GRID;

export const flood: WorldEventDef = {
  id: 'flood',
  label: 'Große Flut',
  summary: 'Das Meer steigt: tief liegende Küstenorte versinken, die übrigen verlieren viele Menschen; Jahrzehnte des Wiederaufbaus.',
  details: [1, 2],
  duration: [20, 40],
  mods: { growth: 0.7, founding: 0.7 },
  start(sim) {
    const sunk: number[] = [];
    const civs = new Set<number>();
    for (const s of [...sim.living]) {
      const c = sim.cellOfSite(s);
      if (!c.coast) continue;
      if (c.h < 0.12 && sim.rnd() < 0.65) {
        s.sunk = true;
        sunk.push(s.id);
        if (sim.ownerOf(s) >= 0) civs.add(sim.ownerOf(s));
        sim.destroy(s, sim.ev('sunk', { sites: [s.id], civs: [sim.ownerOf(s)].filter((x) => x >= 0) }));
      } else s.pop *= 0.6;
    }
    return { sites: sunk.slice(0, 8), civs: [...civs] };
  },
  text(_h, e, L) {
    if (e.n === 1) return 'Das Wasser zog sich zurück. Wo Häfen standen, rauscht seither die Brandung über versunkenen Mauern.';
    return `Die Große Flut: Das Meer stieg und verschlang die Küsten${e.sites.length ? ` – ${e.sites.slice(0, 5).map(L.site).join(', ')}${e.sites.length > 5 ? ' und andere' : ''} versanken` : ''}.`;
  },
};

/** Wie weit der Norden vereist (0 = gar nicht, 1 = ganz): bis 40 % der Karte. */
const frost = (cy: number) => Math.max(0, 1 - cy / (N * 0.4));

export const iceage: WorldEventDef = {
  id: 'iceage',
  label: 'Eiszeit',
  summary: 'Jahrhunderte der Kälte: Der Norden verödet, Orte dort werden aufgegeben, Hunger wird häufiger.',
  details: [1, 2],
  duration: [200, 500],
  mods: { famine: 3, growth: 0.85 },
  fertility(sim, cx, cy) {
    const h = sim.cells[cy * N + cx]?.h ?? 0;
    return (1 - 0.8 * frost(cy)) * (h > 0.3 ? 0.6 : 1);
  },
  step(sim) {
    for (const s of [...sim.living]) {
      const f = frost(sim.cellOf(s)[1]);
      if (f > 0.2 && sim.chance(0.004 * f)) sim.destroy(s, sim.ev('abandon', { sites: [s.id], civs: [sim.ownerOf(s)].filter((c) => c >= 0), cause: 'iceage' }));
    }
  },
  text(_h, e) {
    if (e.n === 1) return 'Die Gletscher wichen nach Norden zurück. Langsam kehrte Leben in die verlassenen Täler zurück.';
    return 'Die Eiszeit begann: Gletscher schoben sich aus dem Norden heran, Ernten erfroren, und ganze Landstriche wurden verlassen.';
  },
};
