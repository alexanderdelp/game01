import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../src/world/biomes';
import { WorldGen } from '../../src/world/WorldGen';
import { historyOf } from '../../src/history';
import { INHABITED, type History } from '../../src/history/types';
import { eventText, plainLinker } from '../../src/history/narrate';
import { territory } from '../../src/history/query';

const SEED = 'nebel-kristall-427';
const world = new WorldGen(SEED);
const h: History = historyOf(world);

describe('Vorgeschichte – Simulation', () => {
  it('ist deterministisch aus dem Seed', () => {
    const b = historyOf(new WorldGen(SEED));
    expect(b.events.length).toBe(h.events.length);
    expect(b.sites.map((s) => [s.name, s.tx, s.ty])).toEqual(h.sites.map((s) => [s.name, s.tx, s.ty]));
    expect(b.figures.map((f) => f.name)).toEqual(h.figures.map((f) => f.name));
  });

  it('läuft in wenigen Sekunden', () => {
    expect(h.ms).toBeLessThan(5000);
  });

  it('erzeugt eine reiche Geschichte', () => {
    expect(h.civs.filter((c) => c.fell === undefined).length).toBeGreaterThanOrEqual(6);
    const living = h.sites.filter((s) => INHABITED.has(s.kind) && s.destroyed === undefined);
    expect(living.length).toBeGreaterThan(40);
    expect(h.sites.filter((s) => s.destroyed !== undefined).length).toBeGreaterThan(5);
    expect(h.artifacts.filter((a) => a.site !== undefined).length).toBeGreaterThan(5);
    for (const k of ['battle', 'war', 'shattering', 'burial', 'beast_arrive', 'artifact_made'] as const) expect(h.events.some((e) => e.k === k), k).toBe(true);
    expect(h.artifacts.filter((a) => a.great).length).toBe(1);
  });

  it('legt Orte auf begehbares Land, mit Abstand zueinander', () => {
    for (const s of h.sites) {
      expect(BIOMES[world.baseBiomeAt(s.tx, s.ty)].walkable, s.name).toBe(true);
      expect(world.meta.waterAt(s.tx, s.ty) === null || !h.rivers.has(s.tx * 65536 + s.ty), s.name).toBe(true);
    }
    const inh = h.sites.filter((s) => INHABITED.has(s.kind));
    for (const a of inh) for (const b of inh) if (a !== b) expect(Math.hypot(a.tx - b.tx, a.ty - b.ty)).toBeGreaterThanOrEqual(44);
  });

  it('Figuren sterben nicht vor der Geburt; Bezüge stimmen', () => {
    for (const f of h.figures) {
      if (f.died !== undefined) expect(f.died, f.name).toBeGreaterThanOrEqual(f.born);
      if (f.killer !== undefined) expect(h.figures[f.killer]).toBeDefined();
      for (const c of f.children) expect(h.figures[c].born).toBeGreaterThan(f.born);
      for (const o of f.offices) expect(o.to ?? Infinity).toBeGreaterThanOrEqual(o.from);
    }
  });

  it('jede Ruine hat einen Untergang im Protokoll', () => {
    for (const s of h.sites.filter((x) => x.destroyed !== undefined)) {
      expect(s.fall, s.name).toBeDefined();
      const e = h.events[s.fall!];
      expect(e.sites).toContain(s.id);
      expect(e.y).toBeLessThanOrEqual(Math.max(0, s.destroyed!));
    }
  });

  it('Artefakte liegen genau an einem Ort oder bei einer Figur', () => {
    for (const a of h.artifacts) {
      expect((a.site !== undefined) !== (a.heldBy !== undefined), a.name).toBe(true);
      if (a.site !== undefined) expect(h.sites[a.site].arts).toContain(a.id);
      if (a.heldBy !== undefined) expect(h.figures[a.heldBy].holds).toContain(a.id);
    }
  });

  it('Ereignisse sind zeitlich geordnet und erzählbar', () => {
    const L = plainLinker(h);
    for (let i = 1; i < h.events.length; i++) expect(h.events[i].y).toBeGreaterThanOrEqual(h.events[i - 1].y);
    for (const e of h.events) {
      const t = eventText(h, e, L);
      expect(t.length, e.k).toBeGreaterThan(10);
      expect(t, e.k).not.toMatch(/undefined|NaN/);
    }
  });

  it('Grenzen im Zeitverlauf: am Ende gehört Land den lebenden Reichen', () => {
    const own = territory(h, h.years);
    const alive = new Set(h.civs.filter((c) => c.fell === undefined).map((c) => c.id));
    let n = 0;
    for (const o of own) if (o >= 0) {
      n++;
      expect(alive.has(o)).toBe(true);
    }
    expect(n).toBeGreaterThan(500);
  });

  it('Länge ist einstellbar', () => {
    const short = historyOf(world, { years: 300 });
    expect(short.years).toBe(300);
    expect(short.events[short.events.length - 1].y).toBeLessThanOrEqual(300);
  });
});
