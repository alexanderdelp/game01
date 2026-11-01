import { describe, expect, it } from 'vitest';
import { Projection } from '../../src/prototype/projection';

const view = { fov: 50, zoom: 2, width: 1280, height: 720, tx: 1000, ty: 2000 };

describe('Perspektive-Prototyp: Projektion', () => {
  it('0° entspricht der heutigen Draufsicht (überall gleicher Maßstab)', () => {
    const p = new Projection({ ...view, tilt: 0 });
    const a = p.project(1000, 2000)!;
    const b = p.project(1100, 1900)!;
    expect(a.scale).toBeCloseTo(2);
    expect(b.scale).toBeCloseTo(2);
    expect(b.sx - a.sx).toBeCloseTo(200);
    expect(b.sy - a.sy).toBeCloseTo(-200);
  });

  it('gekippt: Ferne kleiner und höher im Bild, unter dem Horizont', () => {
    const p = new Projection({ ...view, tilt: 50 });
    const near = p.project(1000, 2000)!;
    const far = p.project(1000, 1000)!;
    expect(far.scale).toBeLessThan(near.scale);
    expect(far.sy).toBeLessThan(near.sy);
    expect(far.sy).toBeGreaterThan(p.horizon);
  });

  it('unproject kehrt project um', () => {
    const p = new Projection({ ...view, tilt: 35 });
    for (const [x, y] of [[1000, 2000], [700, 1500], [1300, 2100]]) {
      const s = p.project(x, y)!;
      const g = p.unproject(s.sx, s.sy)!;
      expect(g.x).toBeCloseTo(x, 3);
      expect(g.y).toBeCloseTo(y, 3);
    }
    expect(p.unproject(640, p.horizon - 10)).toBeUndefined();
  });
});
