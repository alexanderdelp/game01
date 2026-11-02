/** Aufstieg der Reiche: die Urreiche zu Beginn, neue Reiche in leerem Land, das Erwachen der Synths. */
import { HISTORY_GRID, type Race } from '../types';
import { MIN_CIVS, RACE_FACTIONS } from '../rules';
import type { Sim } from '../simulate';
import type { HistorySystem } from './types';

const N = HISTORY_GRID;

/** Zellen der Hauptstädte (Abstand für neue Reiche). */
const capitals = (sim: Sim) => sim.aliveCivs().map((c) => {
  const [cx, cy] = sim.cellOf(sim.sites[c.capital]);
  return { cx, cy };
});

function awakenSynths(sim: Sim): void {
  const relic = sim.sites.find((s) => s.kind === 'relic');
  const scrap = sim.cells.map((c, i) => ({ c, i })).filter((x) => x.c.scrap >= 0.3 && x.c.land && sim.owner[x.i] === -1);
  const at = relic ? sim.cellOf(relic) : scrap.length ? [scrap[0].i % N, Math.floor(scrap[0].i / N)] : null;
  if (!at) return;
  for (let k = 0; k < 8; k++) {
    const civ = sim.foundCiv('synth', 'techno', at[0] + Math.floor(sim.rnd() * 7) - 3, at[1] + Math.floor(sim.rnd() * 7) - 3, undefined, undefined, 'awaken');
    if (civ) {
      const e = sim.events[sim.events.length - 1];
      if (relic && e?.k === 'awaken') {
        e.sites.push(relic.id);
        relic.events.push(e.id);
      }
      return;
    }
  }
}

export const emergence: HistorySystem = {
  id: 'emergence',
  label: 'Aufstieg der Reiche',
  summary: 'Urreiche erscheinen über das erste Zehntel der Zeit verteilt; später entstehen neue Reiche in leerem Land; die Synths erwachen.',
  step(sim) {
    // Urreiche zu ihrem geplanten Jahr
    for (let i = 0; i < (sim.flags.origins ?? 0); i++) {
      if (sim.flags[`originDone${i}`] || sim.y < sim.flags[`origin${i}`]) continue;
      sim.flags[`originDone${i}`] = 1;
      const race = sim.originRaces[sim.flags[`originRace${i}`]] ?? 'human';
      for (const dist of [22, 16, 10]) {
        const o = sim.origin(race, capitals(sim), dist);
        if (o && sim.foundCiv(race, sim.pick(RACE_FACTIONS[race]), o.cx, o.cy)) break;
      }
    }
    if (sim.cfg.civs.races.synth && sim.flags.synths !== undefined && !sim.flags.synthsDone && sim.y >= sim.flags.synths) {
      sim.flags.synthsDone = 1;
      awakenSynths(sim);
    }
    // Neue Reiche, solange Platz ist und es weniger als angestrebt gibt
    const alive = sim.aliveCivs().length;
    if (alive >= sim.cfg.civs.maxAlive || sim.y < (sim.flags.origin0 ?? 0) + 50) return;
    const want = Math.max(sim.cfg.civs.target, MIN_CIVS);
    const p = alive < MIN_CIVS ? 0.05 : alive < want ? 0.006 : 0.0008;
    if (!sim.chance(p * sim.rate('emergence') * sim.mod('founding'))) return;
    const races = (Object.keys(sim.cfg.civs.races) as Race[]).filter((r) => sim.cfg.civs.races[r] && (r !== 'synth' || sim.flags.synthsDone));
    const race = sim.pick(races.length ? races : (['human'] as Race[]));
    const o = sim.origin(race, capitals(sim), 14);
    if (!o) return;
    const civ = sim.foundCiv(race, sim.pick(RACE_FACTIONS[race]), o.cx, o.cy);
    // Ein junges Reich auf alten Ruinen beruft sich auf deren Erbe
    if (civ) {
      const cap = sim.sites[civ.capital];
      if (cap.on !== undefined) cap.name = cap.name.length < 14 && sim.rnd() < 0.5 ? `Neu-${sim.sites[cap.on].name}` : cap.name;
    }
  },
};
