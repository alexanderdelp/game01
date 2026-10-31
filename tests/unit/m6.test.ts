import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, layersFor, recolor, type Palettes } from '../../src/character/lpc';
import { finalStats, newHero, xpForKill } from '../../src/rpg/progression';
import { RACES, RACE_ORDER } from '../../src/rpg/races';
import palettes from '../../public/assets/lpc/palettes.json';

describe('Völker (R1)', () => {
  it('Ork nutzt Ork-Kopf mit grüner Basis, Elf bekommt Ohren', () => {
    const orc = layersFor({ ...DEFAULT_APPEARANCE, race: 'orc', body: 'female' });
    const head = orc.find((l) => l.dir.startsWith('head/'))!;
    expect(head.dir).toBe('head/heads/orc/female');
    expect(head.base).toBe('green');
    const elf = layersFor({ ...DEFAULT_APPEARANCE, race: 'elf' });
    expect(elf.some((l) => l.dir === 'head/ears/long/adult' && l.material === 'body')).toBe(true);
    expect(layersFor(DEFAULT_APPEARANCE).some((l) => l.dir.includes('ears'))).toBe(false);
  });

  it('alle Hauttöne der Völker existieren in der LPC-Palette', () => {
    for (const r of RACE_ORDER) for (const s of RACES[r].skins) expect((palettes as Palettes).body[s], `${r}:${s}`).toBeDefined();
  });

  it('Umfärben von abweichender Basis (grün → braun)', () => {
    const p = palettes as Palettes;
    const g = p.body.green[2];
    const c = parseInt(g.slice(1), 16);
    const px = new Uint8ClampedArray([c >> 16, (c >> 8) & 255, c & 255, 255]);
    recolor(px, p, 'body', 'brown', 'green');
    const b = parseInt(p.body.brown[2].slice(1), 16);
    expect(Array.from(px.slice(0, 3))).toEqual([b >> 16, (b >> 8) & 255, b & 255]);
  });
});

describe('Volksboni (R2)', () => {
  it('wirken auf Endwerte und Erfahrung', () => {
    const base = finalStats(newHero());
    expect(finalStats({ ...newHero(), race: 'orc' }).maxHp).toBe(base.maxHp + 20);
    expect(finalStats({ ...newHero(), race: 'synth' }).defense).toBe(base.defense + 3);
    expect(finalStats({ ...newHero(), race: 'elf' }).speed).toBeCloseTo(base.speed + 0.08);
    expect(xpForKill('bandit', 1, 'human')).toBeGreaterThan(xpForKill('bandit', 1, 'orc'));
  });
});
