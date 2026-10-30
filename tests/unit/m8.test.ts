import { describe, expect, it } from 'vitest';
import { enemiesForChunk } from '../../src/combat/enemies';
import { BIOMES } from '../../src/world/biomes';
import { OBELISKS } from '../../src/world/meta';
import { npcsForChunk } from '../../src/world/npcs';
import { CHUNK_TILES, WorldGen } from '../../src/world/WorldGen';

describe('World Building (R1, R2)', () => {
  const w = new WorldGen('test');
  const m = w.meta;

  it('deterministisch', () => {
    const m2 = new WorldGen('test').meta;
    expect(m2.realms).toEqual(m.realms);
    expect(m2.settlements.map((s) => [s.name, s.tx, s.ty])).toEqual(m.settlements.map((s) => [s.name, s.tx, s.ty]));
    expect(m2.lore).toEqual(m.lore);
    expect(new WorldGen('anders').meta.lore.worldName === m.lore.worldName && new WorldGen('anders').meta.realms[0].name === m.realms[0].name).toBe(false);
  });

  it('6 Reiche mit Hauptstadt und Fraktion; jede Kachel hat ein Reich', () => {
    expect(m.realms).toHaveLength(6);
    for (const r of m.realms) {
      expect(r.capital).toBeGreaterThanOrEqual(0);
      expect(m.settlements[r.capital].capital).toBe(true);
    }
    const seen = new Set<number>();
    for (let y = 300; y < 3800; y += 97) for (let x = 300; x < 3800; x += 97) seen.add(m.realmAt(x, y).id);
    expect(seen.size).toBe(6);
  });

  it('Siedlungen und Obelisken liegen auf begehbarem Land, Chronik hat 8 Fragmente', () => {
    expect(m.settlements.length).toBeGreaterThanOrEqual(12);
    for (const s of m.settlements) {
      expect(BIOMES[w.biomeAt(s.tx, s.ty)].walkable).toBe(true);
      expect(s.buildings.length).toBeGreaterThan(2);
    }
    expect(m.obelisks.length).toBe(OBELISKS);
    for (const o of m.obelisks) expect(BIOMES[w.biomeAt(o.tx, o.ty)].walkable).toBe(true);
    expect(m.lore.fragments).toHaveLength(8);
    expect(m.lore.fragments.every((f) => f.text.length > 40)).toBe(true);
  });
});

describe('Siedlungen (R3)', () => {
  const w = new WorldGen('test');
  const s = w.meta.settlements[0];

  it('Gebäude und Brunnen als Dekoration, keine Bäume im Ort', () => {
    const well = w.decorationAt(s.tx, s.ty);
    expect(well?.kind).toBe('well');
    for (let dy = -s.radius; dy <= s.radius; dy++) {
      for (let dx = -s.radius; dx <= s.radius; dx++) {
        if (Math.hypot(dx, dy) > s.radius) continue;
        const d = w.decorationAt(s.tx + dx, s.ty + dy);
        if (d) expect(['house', 'tower', 'neonhouse', 'stall', 'well', 'flowers', 'tuft']).toContain(d.kind);
      }
    }
  });

  it('Händler und Bewohner im Ortskern, keine Gegner in der Nähe', () => {
    const cx = Math.floor(s.tx / CHUNK_TILES);
    const cy = Math.floor(s.ty / CHUNK_TILES);
    const npcs = npcsForChunk(w, cx, cy);
    expect(npcs.some((n) => n.role === 'merchant')).toBe(true);
    expect(npcs.filter((n) => n.role === 'villager').length).toBeGreaterThan(0);
    const spawn = w.findSpawn();
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) expect(enemiesForChunk(w, cx + dx, cy + dy, spawn).filter((e) => Math.hypot(e.tx - s.tx, e.ty - s.ty) < s.radius + 6)).toEqual([]);
  });

  it('Truhen und Schreine sind verstreut', () => {
    let chests = 0;
    let shrines = 0;
    for (let cy = 80; cy < 180; cy++) for (let cx = 80; cx < 180; cx++) {
      const p = w.meta.chunkPoi(cx, cy);
      if (p?.kind === 'chest') chests++;
      if (p?.kind === 'shrine') shrines++;
      if (p) expect(w.meta.poiAt(p.tx, p.ty)).toEqual(p);
    }
    expect(chests).toBeGreaterThan(100);
    expect(shrines).toBeGreaterThan(30);
  });
});
