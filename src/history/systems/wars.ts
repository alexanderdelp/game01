/** Kriege: Schlachten um den nächsten Ort des Gegners, Verrat, Eroberung oder Zerstörung, Frieden. */
import { specialName } from '../names';
import { MIN_CIVS } from '../rules';
import type { Sim, War } from '../simulate';
import { HISTORY_CELL, type Figure } from '../types';
import type { HistorySystem } from './types';

const C = HISTORY_CELL;

function commander(sim: Sim, civ: number): Figure | undefined {
  const heroes: Figure[] = [];
  for (let i = sim.figures.length - 1; i >= 0 && i > sim.figures.length - 600; i--) {
    const f = sim.figures[i];
    if (sim.isAlive(f) && f.civ === civ && f.role === 'hero' && sim.y - f.born >= 18) heroes.push(f);
  }
  return heroes.length && sim.rnd() < 0.7 ? sim.pick(heroes) : sim.ruler(sim.civs[civ]);
}

function battle(sim: Sim, w: War): void {
  const flip = sim.rnd() < 0.35;
  const atk = flip ? w.b : w.a;
  const def = flip ? w.a : w.b;
  const mine = sim.sitesOf(atk);
  const theirs = sim.sitesOf(def);
  if (!mine.length || !theirs.length) return sim.peace(w);
  // Ziel: der nächstgelegene Ort des Gegners
  let target = theirs[0];
  let from = mine[0];
  let bd = Infinity;
  for (const t of theirs) for (const m of mine) {
    const d = Math.hypot(t.tx - m.tx, t.ty - m.ty);
    if (d < bd) {
      bd = d;
      target = t;
      from = m;
    }
  }
  if (bd > 30 * C) return;
  // Das Schlachtfeld liegt zwischen den Orten
  const bx = target.tx + (from.tx - target.tx) * 0.35;
  const by = target.ty + (from.ty - target.ty) * 0.35;
  let field = sim.near(bx, by, C * 1.5, (s) => s.kind === 'battlefield')[0];
  if (!field) {
    const p = sim.place(bx, by, 'battlefield', C * 0.6);
    if (p) field = sim.addSite('battlefield', p, -1, specialName(sim.rnd, 'battlefield', 'human', target.name), 0);
  }
  const ca = commander(sim, atk);
  const cd = commander(sim, def);
  const bonus = (f?: Figure) => (f ? 1 + f.holds.length * 0.15 + (f.role === 'hero' ? 0.2 : 0) : 1);
  const sa = sim.strength(atk) * bonus(ca);
  const walls = target.walls !== undefined ? 1.25 : 1;
  const sd = sim.strength(def) * bonus(cd) * (target.kind === 'fortress' || target.kind === 'city' ? 1.25 : 1) * walls;
  let atkWins = sim.rnd() < sa / (sa + sd);
  // Gefallene: ein Teil der beteiligten Bevölkerung
  const dead = Math.round(Math.max(40, Math.min(25000, (0.02 + sim.rnd() * 0.08) * (target.pop + from.pop))));
  const e = sim.ev('battle', { civs: [atk, def], sites: field ? [field.id, target.id] : [target.id], figs: [ca?.id, cd?.id].filter((x): x is number => x !== undefined), n: dead });
  w.battles++;
  // Verrat: Ein Verteidiger öffnet die Tore
  if (!atkWins && sim.rnd() < 0.08) {
    const traitor = sim.addFigure('traitor', sim.civs[def].race, def, 25 + Math.floor(sim.rnd() * 30));
    atkWins = true;
    sim.ev('betrayal', { figs: [traitor.id], civs: [def, atk], sites: [target.id] });
  }
  e.win = atkWins ? atk : def;
  w.wins[atk === w.a ? (atkWins ? 0 : 1) : atkWins ? 1 : 0]++;
  const loserCmd = atkWins ? cd : ca;
  const winnerCmd = atkWins ? ca : cd;
  if (loserCmd && sim.rnd() < 0.35) sim.die(loserCmd, 'battle', winnerCmd, field ?? target);
  if (winnerCmd && sim.rnd() < 0.08) sim.die(winnerCmd, 'battle', loserCmd && sim.isAlive(loserCmd) ? loserCmd : undefined, field ?? target);
  if (!atkWins) return;
  target.pop *= 0.6;
  const defCiv = sim.civs[def];
  const last = theirs.length === 1;
  if (last && sim.aliveCivs().length <= MIN_CIVS + 1) return sim.peace(w);
  if (sim.rnd() < 0.4 || target.kind === 'mine') {
    sim.destroy(target, sim.ev('raze', { civs: [atk, def], sites: [target.id], figs: ca ? [ca.id] : [] }));
  } else {
    target.owners.push({ y: sim.y, civ: atk });
    sim.ev('conquest', { civs: [atk, def], sites: [target.id], figs: ca ? [ca.id] : [] });
  }
  if (defCiv.capital === target.id) sim.moveCapital(defCiv);
}

export const wars: HistorySystem = {
  id: 'wars',
  label: 'Kriege',
  summary: 'Reiche im Krieg schlagen Schlachten um den nächsten Ort des Gegners; Orte werden erobert oder zerstört, bis Frieden ist.',
  step(sim) {
    for (const w of [...sim.wars]) {
      if (sim.civs[w.a].fell !== undefined || sim.civs[w.b].fell !== undefined) {
        sim.wars = sim.wars.filter((x) => x !== w);
        continue;
      }
      // Je Jahr ~0,6 Schlachten; in langen Schritten höchstens drei (weniger Detail in alten Zeiten)
      const n = sim.dt === 1 ? (sim.rnd() < 0.6 ? 1 : 0) : sim.count(0.6, 3);
      for (let i = 0; i < n && sim.wars.includes(w); i++) battle(sim, w);
      const len = sim.y - w.start;
      if (sim.wars.includes(w) && (sim.chance(0.08 + 0.04 * Math.min(len, 20)) || Math.abs(w.wins[0] - w.wins[1]) >= 3)) sim.peace(w);
    }
  },
};
