import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANIMS, DEFAULT_APPEARANCE, HAIR_STYLES, METALS, layersFor, normalizeAppearance, recolor, topsFor, type Appearance, type Palettes } from '../../src/character/lpc';
import { RACE_ORDER } from '../../src/rpg/races';
import { npcsForChunk } from '../../src/world/npcs';
import { CHUNK_TILES, WorldGen } from '../../src/world/WorldGen';
import palettes from '../../public/assets/lpc/palettes.json';

const P = palettes as Palettes;
const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const dirs = (a: Partial<Appearance>) => layersFor({ ...DEFAULT_APPEARANCE, ...a }).map((l) => l.dir);

describe('M18 – Umfärben (R1)', () => {
  it('erkennt leicht verschobene Palettenfarben (Farbmanagement), lässt fremde Farben stehen', () => {
    const [r, g, b] = rgb(P.cloth.white[3]);
    const px = new Uint8ClampedArray([r + 3, g - 2, b + 4, 255, 0, 200, 0, 255]);
    recolor(px, P, 'cloth', 'red');
    expect(Array.from(px.slice(0, 3))).toEqual(rgb(P.cloth.red[3]));
    expect(Array.from(px.slice(4, 7))).toEqual([0, 200, 0]);
  });
});

describe('M18 – Völker und Kleidung (R2–R4)', () => {
  it('jede wählbare Kombination nutzt nur vorhandene Bilder', () => {
    for (const race of RACE_ORDER) {
      for (const body of ['male', 'female'] as const) {
        const tops = topsFor({ race, body });
        for (const hair of [...HAIR_STYLES, 'none'] as const) {
          for (const top of tops.length ? tops : [undefined]) {
            for (const shoes of ['shoes', 'boots'] as const) {
              for (const torso of ['longsleeve', 'leather', 'plate'] as const) {
                for (const l of layersFor(normalizeAppearance({ ...DEFAULT_APPEARANCE, race, body, hair, top, shoes, torso }))) {
                  for (const anim of l.anims ?? Object.keys(ANIMS)) {
                    expect(existsSync(`public/assets/lpc/${l.dir}/${anim}.png`), `${l.dir}/${anim}`).toBe(true);
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  it('Völker unterscheiden sich im Körperbau', () => {
    expect(dirs({ race: 'orc', body: 'male' })).toContain('body/bodies/muscular');
    expect(dirs({ race: 'elf' })).toContain('head/ears/long/adult');
    const synth = layersFor({ ...DEFAULT_APPEARANCE, race: 'synth', torsoColor: 'brass' });
    expect(synth.filter((l) => l.material === 'metal').map((l) => l.color)).toEqual(['brass', 'brass', 'brass']);
    expect(synth.some((l) => l.dir.startsWith('torso/clothes') || l.dir.startsWith('legs/pants'))).toBe(false);
  });

  it('weibliche Schnitte und Frisuren mit Teil hinter dem Kopf', () => {
    const d = dirs({ body: 'female', hair: 'ponytail', top: 'corset' });
    expect(d.indexOf('hair/ponytail/adult/bg')).toBeLessThan(d.indexOf('body/bodies/female'));
    expect(d.indexOf('hair/ponytail/adult/fg')).toBeGreaterThan(d.indexOf('head/heads/human/female'));
    expect(d).toContain('torso/clothes/corset/female');
    expect(topsFor({ body: 'female' })).toContain('blouse');
    expect(topsFor({ body: 'male' })).not.toContain('blouse');
  });

  it('Schuhe statt hoher Stiefel als Standard (Hose sichtbar), Stiefel wählbar', () => {
    expect(dirs({})).toContain('feet/shoes/basic/male');
    expect(dirs({ shoes: 'boots' })).toContain('feet/boots/basic/male');
  });

  it('normalisiert ungültige oder alte Aussehen', () => {
    expect(normalizeAppearance({ ...DEFAULT_APPEARANCE, body: 'male', top: 'blouse' }).top).toBe('shirt');
    expect(METALS).toContain(normalizeAppearance({ ...DEFAULT_APPEARANCE, race: 'synth' }).torsoColor);
    expect(normalizeAppearance({ ...DEFAULT_APPEARANCE, race: 'human', torsoColor: 'steel' }).torsoColor).toBe(DEFAULT_APPEARANCE.torsoColor);
    for (const m of METALS) expect(P.metal[m], m).toBeDefined();
  });
});

describe('M18 – Barbier (R5)', () => {
  it('jede Siedlung hat einen Barbier', () => {
    const w = new WorldGen('test');
    for (const s of w.meta.settlements.slice(0, 5)) {
      const npcs = npcsForChunk(w, Math.floor(s.tx / CHUNK_TILES), Math.floor(s.ty / CHUNK_TILES));
      expect(npcs.some((n) => n.role === 'barber' && n.id === `b${s.id}`)).toBe(true);
    }
  });
});
