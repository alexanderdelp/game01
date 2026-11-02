/** Verfall alter Reiche: Je älter und größer ein Reich, desto eher zerfällt es in Bürgerkriegen. */
import { MIN_CIVS } from '../rules';
import type { HistorySystem } from './types';

export const decline: HistorySystem = {
  id: 'decline',
  label: 'Verfall alter Reiche',
  summary: 'Alte, große Reiche zerfallen in Bürgerkriegen; so entstehen über Jahrtausende immer neue Reiche.',
  step(sim) {
    const r = sim.rate('decline') * sim.mod('war');
    for (const civ of sim.aliveCivs()) {
      const own = sim.sitesOf(civ.id);
      if (own.length < 5) continue;
      const age = sim.y - civ.founded;
      if (!sim.chance(0.0006 * r * Math.min(4, age / 400) * (own.length / 8))) continue;
      if (sim.aliveCivs().length >= sim.cfg.civs.maxAlive) continue;
      const child = sim.split(civ, own, 'decline');
      // Selten zerbricht das Reich ganz: der Rest wird herrenlos, die Hauptstadt fällt
      if (child && sim.rnd() < 0.15 && sim.aliveCivs().length > MIN_CIVS + 2) {
        const rest = sim.sitesOf(civ.id);
        for (const s of rest) if (s.id !== civ.capital && sim.rnd() < 0.5) sim.destroy(s, sim.ev('abandon', { civs: [civ.id], sites: [s.id], cause: 'decline' }));
      }
    }
  },
};
