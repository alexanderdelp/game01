import { describe, expect, it } from 'vitest';
import { aimFrom, attackBox, attackZone, facingForAim, nextAim, zoneBounds, zoneHits } from '../../src/combat/combat';
import { overlaps, type Box } from '../../src/world/collision';

/** Körper eines Gegners (wie `Enemy.body` für Kreaturen) mit Mitte bei (cx, cy). */
const body = (cx: number, cy: number): Box => ({ x: cx - 12, y: cy - 11, w: 24, h: 22 });
const S = Math.SQRT1_2;

describe('M28 – Zielen und Schlagen in 8 Richtungen', () => {
  it('Eingabe rastet auf 8 Richtungen ein (auch Gamepad-Schrägen)', () => {
    expect(aimFrom(1, 1)).toEqual({ x: S, y: S });
    expect(aimFrom(1, 0.3)).toEqual({ x: 1, y: 0 });
    expect(aimFrom(-0.7, -0.6)).toEqual({ x: -S, y: -S });
    expect(aimFrom(0, 0)).toBeNull();
  });

  it('Diagonale bleibt beim Loslassen zweier Tasten, echter Richtungswechsel gilt nach kurzer Zeit', () => {
    const dr = { x: S, y: S };
    // „d“ kommt einen Frame vor „s“ frei → Ziel bleibt diagonal
    let r = nextAim(dr, { x: 0, y: 1 }, 0, 1 / 60, 0.08);
    expect(r.aim).toEqual(dr);
    r = nextAim(r.aim, null, r.held, 1 / 60, 0.08);
    expect(r.aim).toEqual(dr);
    // bleibt man bei „s“, zielt man nach 80 ms nach unten
    r = { aim: dr, held: 0 };
    for (let i = 0; i < 5; i++) r = nextAim(r.aim, { x: 0, y: 1 }, r.held, 1 / 60, 0.08);
    expect(r.aim).toEqual({ x: 0, y: 1 });
    // andere Richtungen sofort
    expect(nextAim(dr, { x: -1, y: 0 }, 0, 1 / 60, 0.08).aim).toEqual({ x: -1, y: 0 });
    expect(nextAim({ x: 1, y: 0 }, dr, 0, 1 / 60, 0.08).aim).toEqual(dr);
  });

  it('Sprite zeigt diagonal die Seitenansicht', () => {
    expect(facingForAim({ x: S, y: S })).toBe('right');
    expect(facingForAim({ x: -S, y: -S })).toBe('left');
    expect(facingForAim({ x: 0, y: -1 })).toBe('up');
    expect(facingForAim({ x: S, y: S }, 'vertical')).toBe('down');
  });

  it('R1: diagonaler Hieb trifft den diagonalen Gegner, nicht den seitlich daneben', () => {
    const x = 500;
    const y = 500;
    const cy = y - 18;
    const zone = attackZone(x, y, { x: S, y: S });
    expect(zoneHits(zone, body(x + 26, cy + 26))).toBe(true);
    // quer zur Zielrichtung (unten links, oben rechts) und hinten: kein Treffer
    expect(zoneHits(zone, body(x - 28, cy + 28))).toBe(false);
    expect(zoneHits(zone, body(x + 28, cy - 28))).toBe(false);
    expect(zoneHits(zone, body(x - 26, cy - 26))).toBe(false);
    // Vorher (4 Richtungen) hätte der Hieb nach unten den diagonalen Gegner verfehlt
    expect(overlaps(attackBox(x, y, 'down'), body(x + 34, cy + 34))).toBe(false);
    expect(zoneHits(zone, body(x + 34, cy + 34))).toBe(true);
  });

  it('diagonal gleiche Reichweite wie gerade', () => {
    const x = 0;
    const y = 18;
    // gerade: Gegnerkante bis 40 px vor der Mitte wird getroffen
    const right = attackZone(x, y, { x: 1, y: 0 });
    const diag = attackZone(x, y, { x: S, y: S });
    const reachRight = Math.max(...right.map((p) => p.x));
    const reachDiag = Math.max(...diag.map((p) => p.x * S + p.y * S));
    expect(Math.abs(reachRight - reachDiag)).toBeLessThanOrEqual(2);
  });

  it('R4: gerade Richtungen treffen genau wie bisher', () => {
    const x = 300;
    const y = 300;
    for (const [f, v] of [['up', { x: 0, y: -1 }], ['down', { x: 0, y: 1 }], ['left', { x: -1, y: 0 }], ['right', { x: 1, y: 0 }]] as const) {
      const zone = attackZone(x, y, v);
      expect(zoneBounds(zone)).toEqual(attackBox(x, y, f));
      for (let dx = -80; dx <= 80; dx += 7) {
        for (let dy = -80; dy <= 80; dy += 7) {
          const b = body(x + dx, y - 18 + dy);
          expect(zoneHits(zone, b)).toBe(overlaps(attackBox(x, y, f), b));
        }
      }
    }
  });
});
