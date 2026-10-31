import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, layersFor, normalizeAppearance, paintGlow, type Palettes } from '../../src/character/lpc';
import { dress } from '../../src/character/outfit';
import { SLOTS, generateItem, starterKit, type Item, type Slot } from '../../src/rpg/items';
import { RACE_ORDER } from '../../src/rpg/races';
import palettes from '../../public/assets/lpc/palettes.json';

const P = palettes as Palettes;
const kit = (race: string, body: 'male' | 'female' = 'male') => Object.fromEntries(starterKit(race, body).map((i) => [i.slot, i])) as Partial<Record<Slot, Item>>;
const dirs = (a: ReturnType<typeof dress>) => layersFor(a).map((l) => l.dir);

describe('M23 – Aussehen aus Ausrüstung', () => {
  it('Kleidungsteile bestimmen Oberteil, Hose und Schuhe samt Farbe', () => {
    const body = { ...DEFAULT_APPEARANCE, race: 'human' as const };
    const shirt: Item = { id: 'a', slot: 'armor', base: 'tunic', name: 'Hemd', rarity: 'common', level: 1, bonus: {}, style: 'vneck', color: 'red' };
    const pants: Item = { id: 'b', slot: 'legs', base: 'pants', name: 'Hose', rarity: 'common', level: 1, bonus: {}, color: 'navy' };
    const boots: Item = { id: 'c', slot: 'feet', base: 'boots', name: 'Stiefel', rarity: 'common', level: 1, bonus: {}, color: 'black' };
    const a = dress(body, { armor: shirt, legs: pants, feet: boots });
    expect(a).toMatchObject({ top: 'vneck', torsoColor: 'red', legsColor: 'navy', shoes: 'boots', feetColor: 'black' });
    expect(dirs(a)).toContain('feet/boots/basic/male');
    // Ohne Ausrüstung: Leinen-Unterkleidung, barfuß
    const bare = dress(body, {});
    expect(bare).toMatchObject({ torsoColor: 'white', legsColor: 'white', shoes: 'none' });
    expect(dirs(bare).some((d) => d.startsWith('feet/'))).toBe(false);
  });

  it('Plattenpanzer: Metallfarbe aus dem Gegenstand, auch für Synth', () => {
    const plate: Item = { id: 'p', slot: 'armor', base: 'plate', name: 'Platte', rarity: 'rare', level: 1, bonus: {}, color: 'brass' };
    const human = dress({ ...DEFAULT_APPEARANCE }, { armor: plate });
    expect(layersFor(human).filter((l) => l.material === 'metal').map((l) => l.color)).toEqual(['brass', 'brass']);
    const synth = dress({ ...DEFAULT_APPEARANCE, race: 'synth', body: 'female' }, { armor: plate });
    expect(synth.body).toBe('male'); // Synth haben kein Geschlecht
    expect(layersFor(synth).filter((l) => l.material === 'metal').every((l) => l.color === 'brass' && l.glow)).toBe(true);
  });

  it('Startkleidung je Volk ist sichtbar, Gegenstände haben Farben', () => {
    for (const r of RACE_ORDER) expect(starterKit(r, 'male').length).toBeGreaterThan(0);
    expect(dress({ ...DEFAULT_APPEARANCE, race: 'orc' }, kit('orc')).torso).toBe('leather');
    for (const slot of SLOTS) {
      const it = generateItem(3, Math.random, slot);
      expect(it.slot).toBe(slot);
      if (slot === 'legs' || slot === 'feet') expect(P.cloth[it.color!], `${slot}:${it.color}`).toBeDefined();
      if (it.base === 'plate') expect(P.metal[it.color!]).toBeDefined();
    }
  });

  it('Volksmerkmale: Elf Augenfarbe, Synth Leuchtfarbe; Mensch und Ork keine', () => {
    const elf = normalizeAppearance({ ...DEFAULT_APPEARANCE, race: 'elf', eyes: 'green' });
    expect(layersFor(elf).find((l) => l.dir.startsWith('head/'))!.eyes).toBe('green');
    expect(normalizeAppearance({ ...DEFAULT_APPEARANCE, race: 'human', eyes: 'green', glow: 'red' })).not.toHaveProperty('eyes');
    expect(normalizeAppearance({ ...DEFAULT_APPEARANCE, race: 'synth' }).glow).toBeDefined();
    // Leuchtlinien färben die Fugenfarbe des Metalls
    const seam = P.metal.silver[1];
    const c = parseInt(seam.slice(1), 16);
    const px = new Uint8ClampedArray([c >> 16, (c >> 8) & 255, c & 255, 255]);
    paintGlow(px, P, 'silver', 'red');
    const g = parseInt(P.eye.red[2].slice(1), 16);
    expect(Array.from(px.slice(0, 3))).toEqual([g >> 16, (g >> 8) & 255, g & 255]);
  });
});
