/** Zeitalter: Dunkles Zeitalter (Zerfall, Krieg, Wissen geht verloren) und Goldenes Zeitalter (Blüte, Handel, Frieden). */
import type { WorldEventDef } from './types';

export const darkage: WorldEventDef = {
  id: 'darkage',
  label: 'Dunkles Zeitalter',
  summary: 'Das größte Reich zerbricht, Krieg statt Handel, kaum Wachstum – und Wissen geht verloren: alles davor wird schlechter überliefert.',
  details: [0, 1, 2],
  duration: [150, 350],
  repeat: true,
  darkAge: true,
  mods: { growth: 0.6, war: 1.8, trade: 0.3, founding: 0.5 },
  start(sim) {
    const big = sim.aliveCivs().map((c) => ({ c, own: sim.sitesOf(c.id) })).sort((a, b) => b.own.length - a.own.length)[0];
    if (!big || big.own.length < 4) return;
    const child = sim.split(big.c, big.own, 'darkage');
    return { civs: child ? [big.c.id, child.id] : [big.c.id] };
  },
  text(_h, e, L) {
    if (e.n === 1) return 'Das Dunkle Zeitalter ging zu Ende. Vieles, was man einst wusste, war vergessen.';
    return `Ein Dunkles Zeitalter brach an${e.civs.length ? `: ${L.civ(e.civs[0])} zerfiel` : ''}. Bibliotheken brannten, Wege verfielen, und die Chronisten schwiegen.`;
  },
};

export const goldenage: WorldEventDef = {
  id: 'goldenage',
  label: 'Goldenes Zeitalter',
  summary: 'Eine Zeit der Blüte: mehr Wachstum und Handel, weniger Krieg, mehr Gelehrte.',
  details: [1, 2],
  duration: [100, 250],
  mods: { growth: 1.4, trade: 2, war: 0.4, mages: 1.5 },
  text(_h, e) {
    if (e.n === 1) return 'Das Goldene Zeitalter verblasste; was blieb, waren seine Städte.';
    return 'Ein Goldenes Zeitalter begann: Handelswege verbanden die Reiche, Städte wuchsen, Gelehrte und Baumeister schufen Wunder.';
  },
};
