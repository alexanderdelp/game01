import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../src/world/biomes';
import { CHUNK_TILES, WORLD_TILES, WorldGen } from '../../src/world/WorldGen';

const w = new WorldGen('test');

describe('M19 – große Biome (R1)', () => {
  it('ein Biom ist im Mittel (längengewichtet) über 280 Kacheln lang ≈ 1 min zu Fuß', () => {
    const runs: number[] = [];
    for (let line = 0; line < 8; line++) {
      const pos = Math.round((line + 0.5) * (WORLD_TILES / 8));
      let cur = -1;
      let len = 0;
      for (let i = 0; i < WORLD_TILES; i += 8) {
        const b = line % 2 ? w.biomeAt(i, pos) : w.biomeAt(pos, i);
        if (b === cur) len += 8;
        else {
          if (cur >= 0 && BIOMES[cur].walkable) runs.push(len);
          cur = b;
          len = 8;
        }
      }
    }
    const weighted = runs.reduce((s, r) => s + r * r, 0) / runs.reduce((s, r) => s + r, 0);
    expect(weighted).toBeGreaterThan(280);
  });
});

describe('M19 – Pfade und Pflanzen (R2, R3)', () => {
  it('Trampelpfade verbinden Orte, liegen auf begehbarem Land und tragen keine Pflanzen', () => {
    const m = w.meta;
    const s = m.settlements[0];
    // Vom Ortsrand aus in irgendeiner Richtung beginnt ein Pfad
    let found = 0;
    for (let dy = -s.radius - 6; dy <= s.radius + 6; dy++) {
      for (let dx = -s.radius - 6; dx <= s.radius + 6; dx++) {
        if (!m.isRoad(s.tx + dx, s.ty + dy)) continue;
        found++;
        expect(BIOMES[w.biomeAt(s.tx + dx, s.ty + dy)].walkable).toBe(true);
        expect(w.decorationAt(s.tx + dx, s.ty + dy)).toBeNull();
      }
    }
    expect(found).toBeGreaterThan(10);
  });

  it('Bäume wachsen gehäuft (Haine/Lichtungen) und mit jungen Bäumen am Rand', () => {
    const counts: number[] = [];
    let young = 0;
    const c0 = Math.floor(w.findSpawn().tx / CHUNK_TILES);
    for (let cy = c0 - 12; cy < c0 + 12; cy += 2) {
      for (let cx = c0 - 12; cx < c0 + 12; cx += 2) {
        const d = w.chunk(cx, cy).decorations;
        counts.push(d.filter((x) => ['oak', 'pine', 'youngoak', 'youngpine'].includes(x.kind)).length);
        young += d.filter((x) => x.kind === 'youngoak' || x.kind === 'youngpine').length;
      }
    }
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
    // Gleichmäßige Streuung hätte etwa Varianz ≈ Mittelwert (Poisson); Häufung deutlich mehr
    expect(variance).toBeGreaterThan(mean * 3);
    expect(young).toBeGreaterThan(0);
  });
});
