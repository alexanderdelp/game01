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

import { PAD_BUTTONS, padDirection } from '../../src/game/gamepad';

describe('Gamepad', () => {
  it('Belegung und Richtung mit Totzone', () => {
    expect(PAD_BUTTONS[0]).toBe('attack');
    expect(PAD_BUTTONS[2]).toBe('interact');
    const none = { left: false, right: false, up: false, down: false };
    expect(padDirection(0.1, -0.1, none)).toEqual({ x: 0, y: 0 });
    expect(padDirection(0.8, 0, none)).toEqual({ x: 0.8, y: 0 });
    const d = padDirection(0, 0, { ...none, right: true, up: true });
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
  });
});
