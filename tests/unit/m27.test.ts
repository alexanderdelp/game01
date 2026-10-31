import { describe, expect, it } from 'vitest';
import { VIEW_LONG, VIEW_SHORT, effectiveZoom, minZoom } from '../../src/game/view';

const T = 32;
/** Sichtbare Kacheln (lange, kurze Seite) bei einer Fenstergröße und gewählter Zoomstufe. */
const tiles = (w: number, h: number, chosen = 1) => {
  const z = effectiveZoom(chosen, w, h, T);
  return [Math.max(w, h) / z / T, Math.min(w, h) / z / T];
};

describe('M27: fester Sichtausschnitt', () => {
  it('kein Fenster zeigt mehr als 32 × 18 Kacheln (auch nicht herausgezoomt im Browser)', () => {
    for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160], [5120, 1440], [7680, 4320], [2560, 1600], [390, 844], [1440, 3120]]) {
      const [long, short] = tiles(w, h);
      expect(long).toBeLessThanOrEqual(VIEW_LONG);
      expect(short).toBeLessThanOrEqual(VIEW_SHORT);
    }
  });

  it('Zoom ist ganzzahlig, kleine Fenster behalten Zoom 1', () => {
    expect(minZoom(1280, 720, T)).toBe(2);
    expect(minZoom(1024, 576, T)).toBe(1);
    expect(minZoom(390, 844, T)).toBe(1);
    expect(minZoom(3840, 2160, T)).toBe(4);
    expect(Number.isInteger(minZoom(2000, 1000, T))).toBe(true);
  });

  it('hineinzoomen bleibt möglich', () => {
    expect(effectiveZoom(4, 1280, 720, T)).toBe(4);
  });
});
