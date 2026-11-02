/** Großbestien: tauchen in der Wildnis auf, überfallen nahe Orte, Helden ziehen gegen sie. */
import { HISTORY_CELL } from '../types';
import type { HistorySystem } from './types';

const C = HISTORY_CELL;

export const beasts: HistorySystem = {
  id: 'beasts',
  label: 'Großbestien',
  summary: 'Bestien beziehen einen Hort in der Wildnis, überfallen nahe Orte und horten Beute; Helden ziehen gegen sie.',
  step(sim) {
    const r = sim.rate('beasts') * sim.mod('beasts');
    if (sim.chance(0.01 * r)) sim.spawnBeast();
    for (let i = sim.figures.length - 1; i >= 0; i--) {
      const b = sim.figures[i];
      if (b.race !== 'beast' || !sim.isAlive(b) || b.lair === undefined) continue;
      const lair = sim.sites[b.lair];
      // Raubzüge
      if (sim.chance(0.12 * Math.min(r, 3))) {
        const prey = sim.near(lair.tx, lair.ty, 7 * C, (s) => sim.alive(s));
        if (prey.length) {
          const s = sim.pick(prey);
          s.pop *= 0.85;
          const civ = sim.ownerOf(s);
          const victims = civ < 0 ? [] : sim.figures.slice(-300).filter((f) => sim.isAlive(f) && f.civ === civ && f.race !== 'beast' && f.role !== 'ruler');
          const victim = victims.length && sim.rnd() < 0.2 ? sim.pick(victims) : null;
          const e = sim.ev('beast_raid', { figs: victim ? [b.id, victim.id] : [b.id], sites: [s.id], civs: civ >= 0 ? [civ] : [] });
          if (victim) sim.die(victim, 'beast', b, lair);
          if (s.kind === 'village' && s.pop < 150 * sim.cfg.settlements.popScale && sim.rnd() < 0.25) sim.destroy(s, e);
        }
      }
      // Helden ziehen gegen die Bestie
      if (sim.chance(0.06)) {
        const heroes = sim.figures.slice(-400).filter((f) => sim.isAlive(f) && f.role === 'hero' && sim.y - f.born >= 18 && sim.near(lair.tx, lair.ty, 9 * C, (s) => sim.alive(s) && sim.ownerOf(s) === f.civ).length > 0);
        if (heroes.length) {
          const h = sim.pick(heroes);
          if (sim.rnd() < 0.4 + h.holds.length * 0.12) {
            sim.die(b, 'slain', h, lair);
            sim.ev('beast_slain', { figs: [h.id, b.id], sites: [lair.id], civs: [h.civ] }, true);
            const loot = lair.arts.length && sim.rnd() < 0.5 ? sim.artifacts[lair.arts[0]] : null;
            if (loot) {
              sim.give(loot, null, h, 'found');
              sim.ev('artifact_loot', { arts: [loot.id], figs: [h.id], sites: [lair.id] }, true);
            }
          } else {
            sim.ev('hero_falls', { figs: [h.id, b.id], sites: [lair.id], civs: [h.civ] });
            sim.die(h, 'beast', b, lair);
          }
        }
      }
    }
  },
};
