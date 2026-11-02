import { describe, expect, it } from 'vitest';
import { WorldGen } from '../../src/world/WorldGen';
import { layoutTown } from '../../src/world/townLayout';
import { historyOf } from '../../src/history';
import { DEFAULT_CONFIG, PRESETS, decodeConfig, encodeConfig, resolveConfig, totalYears } from '../../src/history/config';
import { SECTIONS, getPath } from '../../src/history/schema';
import { SYSTEMS } from '../../src/history/systems';
import { steps, timelineOf } from '../../src/history/timeline';
import { townPlan } from '../../src/history/towns';
import { INHABITED } from '../../src/history/types';
import { WORLD_EVENTS } from '../../src/history/worldEvents';

const SEED = 'nebel-kristall-427';
const world = new WorldGen(SEED);
/** Kurze Geschichte für schnelle Tests: drei Zeitalter, ~1.100 Jahre */
const SHORT = PRESETS.find((p) => p.id === 'short')!.config;

describe('Vorgeschichte – Konfiguration', () => {
  it('Standard: mehrere tausend Jahre in Zeitaltern', () => {
    expect(totalYears(DEFAULT_CONFIG)).toBeGreaterThan(5000);
    expect(DEFAULT_CONFIG.epochs.map((e) => e.detail)).toEqual([0, 1, 2, 3]);
  });

  it('URL-Kodierung: nur Abweichungen, verlustfrei', () => {
    expect(encodeConfig(resolveConfig({}))).toBe('');
    const c = resolveConfig({ settlements: { popScale: 2 }, worldEvents: { count: 3 } });
    const back = resolveConfig(decodeConfig(encodeConfig(c)));
    expect(back).toEqual(c);
    expect(decodeConfig('kaputt!!')).toEqual({});
  });

  it('begrenzt unsinnige Werte', () => {
    const c = resolveConfig({ settlements: { popScale: -3, maxAlive: 99999 }, epochs: [{ id: 'x', label: 'X', years: 5, step: 900, detail: 9 as 0, minImportance: 0, clarity: 2 }] });
    expect(c.settlements.popScale).toBeGreaterThan(0);
    expect(c.settlements.maxAlive).toBeLessThanOrEqual(400);
    expect(c.epochs[0].years).toBeGreaterThanOrEqual(10);
    expect(c.epochs[0].step).toBeLessThanOrEqual(c.epochs[0].years);
    expect(c.epochs[0].detail).toBe(3);
  });

  it('Schritte decken die Zeitalter lückenlos ab', () => {
    const tl = timelineOf(DEFAULT_CONFIG);
    let y = 0;
    for (const s of steps(tl)) {
      expect(s.y - s.dt).toBe(y);
      expect(s.dt).toBeLessThanOrEqual(s.epoch.step);
      y = s.y;
    }
    expect(y).toBe(tl.end);
  });

  it('Schema zeigt auf echte Felder; Register haben Standardwerte', () => {
    for (const sec of SECTIONS) for (const f of sec.fields) expect(getPath(DEFAULT_CONFIG, f.path), f.path).toBeDefined();
    for (const s of SYSTEMS) expect(DEFAULT_CONFIG.systems[s.id], s.id).toBeDefined();
    for (const d of WORLD_EVENTS) expect(DEFAULT_CONFIG.worldEvents.defs[d.id], d.id).toBeDefined();
  });
});

describe('Vorgeschichte – Zeitalter, Weltereignisse, Überlieferung (Standard)', () => {
  const h = historyOf(world);

  it('läuft über Jahrtausende in wenigen Sekunden', () => {
    expect(h.years).toBe(totalYears(DEFAULT_CONFIG));
    expect(h.ms).toBeLessThan(6000);
  });

  it('plant Weltereignisse mit Abstand, die Zersplitterung kurz vor heute', () => {
    const random = h.worldRuns.filter((r) => r.def !== 'shattering');
    expect(random.length).toBeGreaterThanOrEqual(3);
    const sorted = [...h.worldRuns].sort((a, b) => a.from - b.from);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].from).toBeGreaterThanOrEqual(sorted[i - 1].to + h.config.worldEvents.minGap);
    expect(h.years - h.shattering).toBeGreaterThanOrEqual(250);
    expect(h.years - h.shattering).toBeLessThanOrEqual(400);
    for (const r of random) expect(['world', 'migrate']).toContain(h.events[r.events[0]]?.k);
  });

  it('altes Wissen ist bruchstückhaft, junges gewiss', () => {
    const share = (from: number, to: number) => {
      const evs = h.events.filter((e) => e.y >= from && e.y < to);
      return evs.filter((e) => h.knowledge.ev[e.id] === 3).length / Math.max(1, evs.length);
    };
    const [myth, , , recent] = h.epochs;
    expect(share(myth.from, myth.to)).toBeLessThan(0.3);
    expect(share(recent.from, recent.to)).toBeGreaterThan(0.8);
    // Manches ist verschollen
    expect(h.knowledge.ev.some((v) => v === 0)).toBe(true);
    expect(h.knowledge.art.some((v, i) => v === 0 && h.artifacts[i].lost)).toBe(true);
  });

  it('große, realistische Städte mit Mauern; Orte auf alten Ruinen', () => {
    const living = h.sites.filter((s) => INHABITED.has(s.kind) && s.destroyed === undefined);
    const plans = living.map((s) => townPlan(h, s));
    expect(Math.max(...plans.map((p) => p.pop))).toBeGreaterThan(8000);
    expect(Math.max(...plans.map((p) => p.buildings))).toBeGreaterThan(150);
    expect(plans.filter((p) => p.wall > 0).length).toBeGreaterThan(5);
    expect(plans.filter((p) => p.tier <= 1).length).toBeGreaterThan(10);
    expect(h.sites.some((s) => s.on !== undefined)).toBe(true);
  });
});

describe('Vorgeschichte – abschaltbar und einstellbar', () => {
  it('ohne Weltereignisse und ohne Kriege', () => {
    const h = historyOf(world, {
      config: { ...SHORT, worldEvents: { count: 0, defs: { shattering: { on: false, weight: 0 } } }, systems: { wars: { on: false, rate: 1 } } },
    });
    expect(h.worldRuns.length).toBe(0);
    expect(h.events.some((e) => e.k === 'battle' || e.k === 'shattering')).toBe(false);
  });

  it('nur gewählte Völker', () => {
    const h = historyOf(world, { config: { ...SHORT, civs: { races: { human: false, elf: true, orc: false, synth: false } } } });
    expect(h.civs.every((c) => c.race === 'elf')).toBe(true);
  });
});

describe('Stadtplan', () => {
  const base = { tx: 1000, ty: 1000, decay: 0, tier: 4, style: 'mixed' as const, dirs: [0.3, 2.5], fields: false, seed: 42, maxRadius: 200 };

  it('erreicht die gewünschte Gebäudezahl ohne Überlappung, mit Mauer und Toren', () => {
    const out = layoutTown({ ...base, buildings: 300, radius: 40, wall: 48 }, () => true);
    const houses = out.pieces.filter((p) => p.kind === 'house' || p.kind === 'neonhouse' || p.kind === 'tower');
    expect(houses.length).toBeGreaterThanOrEqual(270);
    const walls = out.pieces.filter((p) => p.kind === 'wall');
    expect(walls.length).toBeGreaterThan(150);
    // Häuser belegen 3 × 3 Kacheln und überlappen nicht
    const cells = new Set<string>();
    for (const p of houses) for (let dy = -2; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) {
      const k = `${p.tx + dx},${p.ty + dy}`;
      expect(cells.has(k), k).toBe(false);
      cells.add(k);
    }
    // Tore: auf den Hauptstraßen steht keine Mauer
    for (const d of base.dirs) {
      const x = Math.round(1000 + Math.cos(d) * 48);
      const y = Math.round(1000 + Math.sin(d) * 48);
      expect(walls.some((w) => Math.abs(w.tx - x) <= 1 && Math.abs(w.ty - y) <= 1)).toBe(false);
    }
  });

  it('bleibt bei gebrochenen Radien vollständig (eng stehende Nachbarorte)', () => {
    const out = layoutTown({ ...base, buildings: 184, radius: 33, wall: 35, maxRadius: 33.6 }, () => true);
    expect(out.pieces.filter((p) => p.kind === 'house' || p.kind === 'neonhouse').length).toBeGreaterThan(100);
  });

  it('verfallene Häuser zwischen Bebauung und Mauer, Felder vor dem Dorf, Wasser bleibt frei', () => {
    const decayed = layoutTown({ ...base, buildings: 60, radius: 18, wall: 40, decay: 0.7 }, () => true);
    expect(decayed.pieces.some((p) => p.kind === 'rubble')).toBe(true);
    const river = (tx: number) => tx >= 1004 && tx <= 1005;
    const village = layoutTown({ ...base, tier: 1, buildings: 20, radius: 10, wall: 0, fields: true }, (tx) => !river(tx));
    expect(village.pieces.some((p) => p.kind === 'field')).toBe(true);
    for (const p of village.pieces) expect(river(p.tx), `${p.kind} ${p.tx}`).toBe(false);
  });
});
