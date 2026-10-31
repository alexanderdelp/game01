import { describe, expect, it } from 'vitest';
import { midiToFreq, progression, scaleFor } from '../../src/audio/audio';

describe('Musik (R3)', () => {
  it('Noten und Tonleitern', () => {
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(81)).toBe(880);
    const day = scaleFor('day');
    expect(day).toHaveLength(10);
    expect(day[0]).toBe(60);
    expect(scaleFor('night')).not.toEqual(day);
    expect(progression('day')).toHaveLength(4);
  });
});
