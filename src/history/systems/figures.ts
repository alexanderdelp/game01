/** Figuren: Alter und Tod, Erben der Herrscher, Erbfolge (mit Spaltung), Helden, Gelehrte und ihre Artefakte. */
import type { Civ } from '../types';
import type { Sim } from '../simulate';
import type { HistorySystem } from './types';

function succession(sim: Sim, civ: Civ): void {
  const last = sim.figures[civ.rulers[civ.rulers.length - 1]];
  const heir = last?.children.map((c) => sim.figures[c]).find((c) => sim.isAlive(c) && sim.y - c.born >= 16);
  const own = sim.sitesOf(civ.id);
  // Erbfolgestreit: großes Reich ohne Erben zerbricht
  if (!heir && own.length >= 8 && sim.aliveCivs().length < sim.cfg.civs.maxAlive && sim.rnd() < 0.25) sim.split(civ, own);
  if (sim.ruler(civ)) return;
  const next = heir ?? sim.addFigure('ruler', civ.race, civ.id, 25 + Math.floor(sim.rnd() * 20));
  sim.crown(civ, next);
}

export const figures: HistorySystem = {
  id: 'figures',
  label: 'Figuren',
  summary: 'Herrscher altern, bekommen Erben und sterben; Helden, Erzmagier, Ingenieure und Priester treten auf und schaffen Artefakte.',
  step(sim) {
    const r = sim.rate('figures');
    // Nur die jüngeren Figuren können noch leben: von hinten suchen spart Zeit über Jahrtausende
    for (let i = sim.figures.length - 1; i >= 0; i--) {
      const f = sim.figures[i];
      if (!sim.isAlive(f)) continue;
      const age = sim.y - f.born;
      if (age > sim.lifespan(f)) {
        sim.die(f, 'age');
        continue;
      }
      // Herrscher bekommen Kinder (Erben); in der Sagenzeit nur die nötigsten
      if (f.role === 'ruler' && f.race !== 'synth' && f.offices.some((o) => o.to === undefined) && age > 20 && age < 50 && f.children.length < (sim.detail === 0 ? 1 : 4) && sim.chance(0.07)) {
        const child = sim.addFigure('ruler', f.race, f.civ, Math.max(0, Math.min(sim.dt - 1, age - 18)), f.id);
        sim.ev('birth', { figs: [child.id, f.id], civs: [f.civ] });
      }
      // Erzmagier, Ingenieure und Priester schaffen Artefakte
      if ((f.role === 'mage' || f.role === 'engineer' || f.role === 'priest') && age > 30 && sim.chance(0.02 * r * (sim.detail === 0 ? 0.3 : 1))) {
        const made = sim.artifacts.filter((a) => a.maker === f.id).length;
        if (made < 2) sim.makeArtifact(f);
      }
    }
    // In der Gegenwart treten mehr Figuren auf: Sie leben noch und tragen die Geschichte ins Spiel
    const many = sim.detail >= 3 ? 2 : sim.detail === 0 ? 0.3 : 1;
    for (const civ of sim.aliveCivs()) {
      if (!sim.ruler(civ)) succession(sim, civ);
      const race = civ.race;
      if (sim.chance(0.007 * r * many)) {
        const h = sim.addFigure('hero', race, civ.id, 18 + Math.floor(sim.rnd() * 6));
        sim.ev('hero_rise', { figs: [h.id], civs: [civ.id], sites: [civ.capital] });
      }
      const mageP = (civ.faction === 'mages' ? 0.012 : race === 'elf' ? 0.005 : 0.002) * sim.mod('mages');
      if (sim.chance(mageP * r * many)) sim.addFigure('mage', race, civ.id, 35 + Math.floor(sim.rnd() * 20));
      const engP = civ.faction === 'techno' ? 0.012 : 0.002;
      if (sim.chance(engP * r * many)) sim.addFigure('engineer', race, civ.id, 30 + Math.floor(sim.rnd() * 20));
      if (civ.faction === 'order' && sim.chance(0.008 * r * many)) sim.addFigure('priest', race, civ.id, 30 + Math.floor(sim.rnd() * 20));
    }
  },
};
