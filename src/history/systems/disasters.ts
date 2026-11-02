/** Seuchen und Hungersnöte: treffen einige Orte eines Reiches; kleine Orte werden danach verlassen. */
import type { Sim } from '../simulate';
import type { HistorySystem } from './types';

function strike(sim: Sim, k: 'plague' | 'famine'): void {
  const civs = sim.aliveCivs().filter((c) => sim.sitesOf(c.id).length > 1);
  if (!civs.length) return;
  const civ = sim.pick(civs);
  let own = sim.sitesOf(civ.id);
  if (k === 'famine') own = own.sort((a, b) => sim.fert(...sim.cellOf(a)) - sim.fert(...sim.cellOf(b)));
  const hit = own.slice(0, 2 + Math.floor(sim.rnd() * 3));
  sim.ev(k, { civs: [civ.id], sites: hit.map((s) => s.id), n: Math.round(hit.reduce((s, x) => s + x.pop * 0.45, 0)) });
  for (const s of hit) s.pop *= 0.55;
  if (k === 'plague') for (const f of sim.figures.slice(-300)) if (sim.isAlive(f) && f.civ === civ.id && sim.rnd() < 0.1) sim.die(f, 'plague');
  for (const s of hit) {
    if (s.pop < 80 * sim.cfg.settlements.popScale && s.id !== civ.capital) sim.destroy(s, sim.ev('abandon', { civs: [civ.id], sites: [s.id], cause: k }));
  }
}

export const disasters: HistorySystem = {
  id: 'disasters',
  label: 'Seuchen & Hunger',
  summary: 'Seuchen und Hungersnöte treffen einige Orte eines Reiches; kleine Orte werden danach verlassen.',
  step(sim) {
    const r = sim.rate('disasters') * sim.mod('plague');
    for (let i = sim.count(0.004 * r, 4); i > 0; i--) strike(sim, 'plague');
    for (let i = sim.count(0.003 * sim.rate('disasters') * sim.mod('famine'), 4); i > 0; i--) strike(sim, 'famine');
  },
};
