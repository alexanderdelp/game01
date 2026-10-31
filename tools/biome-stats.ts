/**
 * Misst, wie lange man durch ein Biom läuft: mittlere Lauflänge (Kacheln) gleicher Biome entlang von Linien über Land.
 * npx vite-node tools/biome-stats.ts [seed …]
 */
import { BIOMES } from '../src/world/biomes';
import { WORLD_TILES, WorldGen } from '../src/world/WorldGen';

/** Laufgeschwindigkeit in Kacheln/s (150 px/s bei 32-px-Kacheln). */
const TILES_PER_S = 150 / 32;

for (const seed of process.argv.slice(2).length ? process.argv.slice(2) : ['test', 'alpha', 'nebel']) {
  const w = new WorldGen(seed);
  const runs: number[] = [];
  const step = 4;
  for (let line = 0; line < 24; line++) {
    const horizontal = line % 2 === 0;
    const pos = Math.round(((line >> 1) + 0.5) * (WORLD_TILES / 12));
    let cur = -1;
    let len = 0;
    for (let i = 0; i < WORLD_TILES; i += step) {
      const b = horizontal ? w.biomeAt(i, pos) : w.biomeAt(pos, i);
      if (b === cur) len += step;
      else {
        if (cur >= 0 && BIOMES[cur].walkable && len > 0) runs.push(len);
        cur = b;
        len = step;
      }
    }
  }
  runs.sort((a, b) => a - b);
  // längengewichtetes Mittel: wie lange ist das Biom, in dem man sich gerade befindet?
  const weighted = runs.reduce((s, r) => s + r * r, 0) / runs.reduce((s, r) => s + r, 0);
  const median = runs[Math.floor(runs.length / 2)];
  console.log(`${seed}: ${runs.length} Abschnitte, Median ${median} Kacheln, gewichtet ${Math.round(weighted)} Kacheln ≈ ${Math.round(weighted / TILES_PER_S)} s`);
}
