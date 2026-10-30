import { describe, expect, it } from 'vitest';
import { BASE_PALETTE, DEFAULT_APPEARANCE, layersFor, recolor, type Palettes } from '../../src/character/lpc';
import { DECOR_KINDS, DECOR_VARIANTS, generateDecor } from '../../src/render/procSprites';
import { B, BIOME_SPEED, BIOMES } from '../../src/world/biomes';
import { facingFrom, moveBox, overlaps, type Box } from '../../src/world/collision';

describe('Kollision (R3)', () => {
  const wall: Box = { x: 100, y: 0, w: 10, h: 200 };
  const blocked = (b: Box) => overlaps(b, wall);

  it('stoppt an einer Wand', () => {
    const r = moveBox({ x: 80, y: 50, w: 10, h: 6 }, 50, 0, blocked);
    expect(r.x + r.w).toBeLessThanOrEqual(100);
    expect(r.x).toBeGreaterThan(85);
  });

  it('gleitet diagonal an der Wand entlang', () => {
    const r = moveBox({ x: 88, y: 50, w: 10, h: 6 }, 20, 20, blocked);
    expect(r.x + r.w).toBeLessThanOrEqual(100);
    expect(r.y).toBeCloseTo(70);
  });

  it('tunnelt bei großen Schritten nicht durch', () => {
    const r = moveBox({ x: 80, y: 50, w: 10, h: 6 }, 500, 0, blocked);
    expect(r.x).toBeLessThan(100);
  });
});

describe('Bewegung (R2/R4)', () => {
  it('Blickrichtung folgt der dominanten Achse', () => {
    expect(facingFrom(1, 0, 'down')).toBe('right');
    expect(facingFrom(-1, 0.2, 'down')).toBe('left');
    expect(facingFrom(0.3, -1, 'down')).toBe('up');
    expect(facingFrom(0, 0, 'left')).toBe('left');
  });

  it('unbegehbare Biome haben Geschwindigkeit 0, Sumpf bremst', () => {
    for (const b of BIOMES) if (!b.walkable) expect(BIOME_SPEED[b.id]).toBe(0);
    expect(BIOME_SPEED[B.Swamp]).toBeLessThan(BIOME_SPEED[B.Grassland]);
  });
});

describe('LPC-Figur (R7)', () => {
  it('besteht aus Körper, Beinen, Füßen, Oberteil, Kopf und Haaren', () => {
    const all = layersFor(DEFAULT_APPEARANCE).map((l) => l.dir);
    expect(all[0]).toBe('weapon/dagger/bg');
    expect(all.at(-1)).toBe('weapon/dagger/fg');
    const dirs = layersFor({ ...DEFAULT_APPEARANCE, weapon: 'none' }).map((l) => l.dir);
    expect(dirs[0]).toMatch(/^body\/bodies\//);
    expect(dirs.some((d) => d.startsWith('head/'))).toBe(true);
    expect(dirs.at(-1)).toMatch(/^hair\//);
    expect(layersFor({ ...DEFAULT_APPEARANCE, hair: 'none' }).some((l) => l.dir.startsWith('hair/'))).toBe(false);
  });

  it('färbt Basisfarben auf die Zielpalette um und lässt andere Pixel stehen', () => {
    const palettes: Palettes = {
      body: { [BASE_PALETTE.body]: ['#102030', '#405060'], green: ['#00ff00', '#00aa00'] },
      hair: {},
      cloth: {},
    };
    const px = new Uint8ClampedArray([0x10, 0x20, 0x30, 255, 0x40, 0x50, 0x60, 255, 1, 2, 3, 255, 0x10, 0x20, 0x30, 0]);
    recolor(px, palettes, 'body', 'green');
    expect(Array.from(px.slice(0, 8))).toEqual([0, 255, 0, 255, 0, 0xaa, 0, 255]);
    expect(Array.from(px.slice(8, 12))).toEqual([1, 2, 3, 255]);
    expect(Array.from(px.slice(12, 16))).toEqual([0x10, 0x20, 0x30, 0]);
  });
});

describe('Prozedurale Sprites', () => {
  it('alle Arten und Varianten erzeugen sichtbare, deterministische Pixel', () => {
    for (const k of DECOR_KINDS) {
      for (let v = 0; v < DECOR_VARIANTS; v++) {
        const a = generateDecor(k, v);
        let opaque = 0;
        for (let i = 3; i < a.data.length; i += 4) if (a.data[i]) opaque++;
        expect(opaque, `${k}:${v}`).toBeGreaterThan(10);
        expect(Array.from(generateDecor(k, v).data)).toEqual(Array.from(a.data));
      }
    }
  });
});
