import { describe, expect, it } from 'vitest';
import { FEATURES, parseFeatures } from '../../src/game/features';

describe('M32 – Kernmodus: Schalter (R1)', () => {
  it('ohne Angabe ist alles aus (Kernmodus)', () => {
    expect([...parseFeatures('')]).toEqual([]);
    expect([...parseFeatures('?seed=x&test=1')]).toEqual([]);
  });
  it('?systeme=alle schaltet alle Systeme ein', () => {
    expect([...parseFeatures('?systeme=alle')].sort()).toEqual([...FEATURES].sort());
  });
  it('Liste schaltet nur die genannten ein, Unbekanntes wird ignoriert', () => {
    expect([...parseFeatures('?systeme=quests,%20news,unsinn')].sort()).toEqual(['news', 'quests']);
  });
});
