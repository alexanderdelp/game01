/**
 * Die Zersplitterung (fest, kurz vor der Gegenwart): Ein Erzmagier und ein Ingenieur bauen einen Turm auf der reichsten
 * Splitter-Ader, schmieden das Herz der Welt und versuchen, den größten Splitter zu bändigen. Der Versuch zerreißt das Land.
 */
import { specialName } from '../names';
import type { ActiveRun, Sim } from '../simulate';
import { HISTORY_CELL, type Figure, type Site } from '../types';
import type { WorldEventDef } from './types';

const C = HISTORY_CELL;

interface State { site?: Site; mage?: Figure; engineer?: Figure; forged?: boolean }

function prepare(sim: Sim, st: State): void {
  const civs = sim.aliveCivs();
  const mages = civs.find((c) => c.faction === 'mages') ?? civs[0];
  const techno = civs.find((c) => c.faction === 'techno') ?? mages;
  if (!mages) return;
  // Reichste Ader in der Nähe des Magierreichs
  const own = sim.sitesOf(mages.id);
  let best: { cx: number; cy: number; s: number } | null = null;
  for (const s of own.length ? own : [sim.sites[mages.capital]]) {
    const [cx, cy] = sim.cellOf(s);
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const c = sim.cell(cx + dx, cy + dy);
      if (!c || !c.land) continue;
      const v = c.shard + sim.rnd() * 0.1;
      if (!best || v > best.s) best = { cx: cx + dx, cy: cy + dy, s: v };
    }
  }
  if (!best) return;
  const p = sim.place(best.cx * C + C / 2, best.cy * C + C / 2, 'tower', C) ?? sim.place(best.cx * C + C / 2, best.cy * C + C / 2, 'tower', C * 2);
  if (!p) return;
  st.mage = sim.addFigure('mage', mages.race, mages.id, 60);
  st.engineer = sim.addFigure('engineer', techno.race, techno.id, 45);
  sim.immortal.add(st.mage.id).add(st.engineer.id);
  st.site = sim.addSite('tower', p, mages.id, sim.uniqueName(() => specialName(sim.rnd, 'tower', mages.race, '')), 60);
  sim.ev('site_found', { civs: [mages.id, techno.id], sites: [st.site.id], figs: [st.mage.id, st.engineer.id], cause: 'great' }, true);
}

function forge(sim: Sim, st: State): void {
  if (!st.mage || !st.engineer || !st.site) return;
  sim.makeArtifact(st.mage, true);
  const e = sim.events[sim.events.length - 1];
  e.figs.push(st.engineer.id);
  e.sites.push(st.site.id);
  st.site.events.push(e.id);
}

function shatter(sim: Sim, st: State, a: ActiveRun): void {
  const { site, mage, engineer } = st;
  if (!site || !mage || !engineer) return;
  const p = sim.place(site.tx, site.ty, 'crater', 60) ?? { tx: site.tx + 6, ty: site.ty + 4 };
  const crater = sim.addSite('crater', p, -1, specialName(sim.rnd, 'crater', 'human', site.name), 0);
  a.run.site = crater.id;
  const ruined = sim.near(site.tx, site.ty, 4.5 * C, (s) => sim.alive(s));
  const e = sim.ev('shattering', { figs: [mage.id, engineer.id], sites: [crater.id, ...ruined.map((s) => s.id)], civs: [...new Set(ruined.map((s) => sim.ownerOf(s)).filter((c) => c >= 0))], n: ruined.length }, true);
  a.run.events.push(e.id);
  for (const s of ruined) sim.destroy(s, e);
  sim.immortal.delete(mage.id);
  sim.immortal.delete(engineer.id);
  // Das Herz bleibt im Krater
  for (const f of [mage, engineer]) sim.die(f, 'shattering', undefined, crater);
  const great = sim.artifacts.find((x) => x.great);
  if (great && great.heldBy !== undefined) sim.drop(great, sim.figures[great.heldBy], crater, 'shattering');
  // Splitterbrut erwacht
  const [cx, cy] = sim.cellOf(crater);
  for (let k = 0; k < 2 + Math.floor(sim.rnd() * 2); k++) sim.spawnBeast({ cx, cy }, 1);
  // Schuldzuweisung: alle gegen Magier und Technokraten
  const blamed = new Set([mage.civ, engineer.civ]);
  for (const c of sim.aliveCivs()) for (const b of blamed) if (c.id !== b && sim.civs[b]) c.opinion[b] = sim.civs[b].opinion[c.id] = Math.min(c.opinion[b] ?? 0, 0) - 30;
}

export const shattering: WorldEventDef = {
  id: 'shattering',
  label: 'Die Zersplitterung',
  summary: 'Fest 250–400 Jahre vor heute: Erzmagier und Ingenieur wollen den größten Splitter bändigen; das Land zerreißt, Bestien erwachen.',
  details: [2, 3],
  fixedAgo: [250, 400],
  duration: [25, 25],
  silent: true,
  mods: { beasts: 3 },
  start(sim, a) {
    prepare(sim, a.state as State);
  },
  step(sim, a) {
    const st = a.state as State;
    if (!st.forged && sim.y >= a.run.from + 13) {
      st.forged = true;
      forge(sim, st);
    }
  },
  end(sim, a) {
    shatter(sim, a.state as State, a);
  },
  text() {
    return 'Die Zersplitterung.';
  },
};
