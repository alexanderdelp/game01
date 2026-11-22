import { describe, expect, it } from 'vitest';
import { HF_CELLS, chunkHeights, sampleChunk } from '../../src/lab/view3d/heightfield';
import { Projection, occluded } from '../../src/lab/view3d/projection';
import { exportLabCode } from '../../src/lab/labTuning';
import { CELL, tileHeight } from '../../src/world/terrain';
import { CHUNK_TILES, WorldGen } from '../../src/world/WorldGen';

const view = (tilt = 50) => new Projection({ tilt, fov: 35, zoom: 2, width: 960, height: 540, tx: 1000, ty: 1000, th: 100 });

describe('M33 Laborphase 2: Perspektive', () => {
  it('Projektion: Ziel in der Bildmitte, Zoom am Ziel, Hin und Rück passen', () => {
    const p = view();
    const q = p.project(1000, 1000)!;
    expect(q.sx).toBeCloseTo(480);
    expect(q.scale).toBeCloseTo(2);
    const back = p.unproject(600, 200)!;
    const again = p.project(back.x, back.y)!;
    expect(again.sx).toBeCloseTo(600);
    expect(again.sy).toBeCloseTo(200);
    // Weiter nördlich = kleiner und höher im Bild
    const far = p.project(1000, 600)!;
    expect(far.scale).toBeLessThan(2);
    expect(far.sy).toBeLessThan(q.sy);
  });

  it('Höhe hebt einen Punkt im Bild an; Draufsicht zeigt Höhe nur über die Größe', () => {
    const p = view();
    expect(p.project(1000, 1000, 164)!.sy).toBeLessThan(p.project(1000, 1000, 100)!.sy - 30);
    const top = view(0);
    expect(top.project(1000, 1000, 164)!.sy).toBeCloseTo(top.project(1000, 1000, 100)!.sy);
    expect(top.project(1000, 1000, 164)!.scale).toBeGreaterThan(2);
  });

  it('Verdeckung: ein Bergrücken zwischen Punkt und Kamera verdeckt, freies Feld nicht', () => {
    const p = view();
    const flat = () => 100;
    expect(occluded(p, 1000, 700, 100, flat)).toBe(false);
    // Wall 2 Kacheln südlich des Punkts (zur Kamera hin), 120 px hoch
    const ridge = (_x: number, y: number) => (y > 720 && y < 760 ? 220 : 100);
    expect(occluded(p, 1000, 700, 100, ridge)).toBe(true);
  });

  it('Höhenfeld: im Flachland wie die Kachelhöhe, Felswände werden zu Rampen statt Sprüngen', () => {
    const w = new WorldGen('test');
    // Startgebiet (Wald, Hügel): ohne Stufen
    const cx = Math.floor(4048 / CHUNK_TILES);
    const cy = Math.floor(4090 / CHUNK_TILES);
    const hs = chunkHeights(w, cx, cy);
    expect(hs.length).toBe(HF_CELLS * HF_CELLS);
    const tx = cx * CHUNK_TILES + 5;
    const ty = cy * CHUNK_TILES + 7;
    expect(sampleChunk(hs, 5 * 32 + 16, 7 * 32 + 16)).toBeCloseTo(tileHeight(w, tx, ty), 1);
    // Klippen im Gebirge: große Höhenunterschiede, aber steigt es nach Norden an, dann in kleinen Schritten
    const kx = Math.floor(4092 / CHUNK_TILES);
    const ky = Math.floor(4014 / CHUNK_TILES);
    const ks = chunkHeights(w, kx, ky);
    let lo = Infinity;
    let hi = -Infinity;
    let worstUp = 0;
    for (let y = 1; y < HF_CELLS; y++)
      for (let x = 0; x < HF_CELLS; x++) {
        const h = ks[y * HF_CELLS + x];
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
        worstUp = Math.max(worstUp, ks[(y - 1) * HF_CELLS + x] - h);
      }
    expect(hi - lo).toBeGreaterThan(3);
    expect(worstUp).toBeLessThan(1);
    expect(CELL * HF_CELLS).toBe(CHUNK_TILES * 32);
  });

  it('Werte kopieren enthält die Perspektive', () => {
    expect(exportLabCode()).toContain('LAB_VIEW');
    expect(exportLabCode()).toContain('tilt');
  });
});
