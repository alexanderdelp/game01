/** Beziehungen benachbarter Reiche: Grenzen und Splitter-Adern verfeinden, Handel und gleiche Fraktion verbinden. */
import { HISTORY_GRID } from '../types';
import type { HistorySystem } from './types';

const N = HISTORY_GRID;

export const relations: HistorySystem = {
  id: 'relations',
  label: 'Beziehungen',
  summary: 'Nachbarn verfeinden sich über Grenzen und Splitter-Adern; daraus entstehen Kriege, aus Freundschaft Bündnisse.',
  step(sim) {
    const border = new Map<string, { n: number; shard: number }>();
    for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N - 1; cx++) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (cy + dy >= N) continue;
        const a = sim.owner[cy * N + cx];
        const b = sim.owner[(cy + dy) * N + cx + dx];
        if (a === -1 || b === -1 || a === b) continue;
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        const v = border.get(key) ?? { n: 0, shard: 0 };
        v.n++;
        v.shard = Math.max(v.shard, sim.cells[cy * N + cx].shard, sim.cells[(cy + dy) * N + cx + dx].shard);
        border.set(key, v);
      }
    }
    const r = sim.rate('relations');
    const war = sim.rate('wars') * sim.mod('war');
    for (const [key, v] of border) {
      const [a, b] = key.split(',').map(Number);
      const ca = sim.civs[a];
      const cb = sim.civs[b];
      // Drift je Jahr; der Zufall wächst mit der Wurzel der Schrittlänge
      let d = (-0.35 - v.shard * 0.8) * r * sim.dt + (sim.rnd() - 0.5) * 3 * Math.sqrt(sim.dt);
      if (ca.race !== cb.race) d -= 0.3 * r * sim.dt;
      if (ca.faction === 'traders' || cb.faction === 'traders') d += 0.5 * sim.dt;
      if (ca.faction === cb.faction) d += 0.2 * sim.dt;
      const o = Math.max(-100, Math.min(100, (ca.opinion[b] ?? 0) + d));
      ca.opinion[b] = cb.opinion[a] = o;
      const atWar = sim.wars.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
      if (!atWar && !sim.alliances.has(key) && o < -40 && sim.chance(0.04 * war)) sim.declareWar(a, b, v.shard > 0.4 ? 'shard' : 'border');
      else if (!atWar && !sim.alliances.has(key) && o > 30 && sim.chance(0.03)) {
        sim.alliances.add(key);
        sim.ev('alliance', { civs: [a, b] });
      } else if (sim.alliances.has(key) && o < 0) sim.alliances.delete(key);
    }
  },
};
