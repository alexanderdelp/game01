import { describe, expect, it } from 'vitest';
import { LAB_DEFAULTS, LAB_MOVE, applyLabSnapshot, exportLabCode, gradeFactor, labSnapshot, smoothDir } from '../../src/lab/labTuning';
import { PLACES, parsePlace } from '../../src/lab/places';
import { SLOPE, slopeSpeed } from '../../src/world/terrain';

describe('M33 Bewegungslabor', () => {
  it('Orte: bekannte ID, eigener Ort, Standard ist der Berg', () => {
    expect(parsePlace('klippen').seed).toBe('test');
    expect(parsePlace('gipfel,100,200')).toMatchObject({ id: 'eigen', seed: 'gipfel', tx: 100, ty: 200 });
    expect(parsePlace(null).id).toBe('berg');
    expect(parsePlace('unsinn').id).toBe('berg');
    expect(PLACES.filter((p) => p.summit).every((p) => p.seed === 'gipfel')).toBe(true);
  });

  it('Anlauf und Abbremsen: 0 = sofort, sonst stetige Annäherung', () => {
    applyLabSnapshot(LAB_DEFAULTS);
    expect(smoothDir({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.016)).toEqual({ x: 1, y: 0 });
    const m = { ...LAB_MOVE, accel: 0.2, decel: 0.1 };
    let d = { x: 0, y: 0 };
    for (let i = 0; i < 6; i++) d = smoothDir(d, { x: 1, y: 0 }, 0.016, m);
    expect(d.x).toBeGreaterThan(0.3);
    expect(d.x).toBeLessThan(1);
    const stop = smoothDir({ x: 1, y: 0 }, { x: 0, y: 0 }, 0.05, m);
    expect(stop.x).toBeCloseTo(0.5);
  });

  it('Steigung: bergauf bremst, bergab beschleunigt, begrenzt', () => {
    const m = { ...LAB_MOVE, uphill: 0.5, downhill: 0.4 };
    expect(gradeFactor(0, m)).toBe(1);
    expect(gradeFactor(0.4, m)).toBeCloseTo(0.8);
    expect(gradeFactor(-0.5, m)).toBeCloseTo(1.2);
    expect(gradeFactor(5, m)).toBe(0.4);
    expect(gradeFactor(-5, m)).toBe(1.6);
    expect(gradeFactor(1, { ...m, uphill: 0 })).toBe(1);
  });

  it('Hangbremse per Regler, Werte speicher- und exportierbar', () => {
    applyLabSnapshot(LAB_DEFAULTS);
    expect(slopeSpeed(2)).toBeCloseTo(0.65);
    applyLabSnapshot({ 'slope.max': 0.6, 'lab.uphill': 99 });
    expect(SLOPE.max).toBe(0.6);
    expect(slopeSpeed(2)).toBeCloseTo(0.4);
    expect(LAB_MOVE.uphill).toBe(1.5); // auf Reglerbereich begrenzt
    expect(labSnapshot()['slope.max']).toBe(0.6);
    expect(exportLabCode()).toContain('max: 0.6,');
    applyLabSnapshot(LAB_DEFAULTS);
  });
});
