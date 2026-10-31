import { describe, expect, it } from 'vitest';
import { PLAYER_SWING, swingCycle } from '../../src/combat/combat';
import { ANIMS } from '../../src/character/lpc';

describe('M17 – Kampfgefühl', () => {
  it('Hieb-Animation und Kampfwerte passen zusammen', () => {
    expect(ANIMS.slash.frameRate).toBe(PLAYER_SWING.frameRate);
    expect(ANIMS.slash.frames).toBe(PLAYER_SWING.frames);
  });

  it('kurze Reaktionszeiten: Treffer früh im Hieb, Hieb-Zyklus unter 0,35 s', () => {
    expect(PLAYER_SWING.hitDelay).toBeLessThan(PLAYER_SWING.frames / PLAYER_SWING.frameRate / 2);
    expect(swingCycle()).toBeLessThan(0.35);
    expect(PLAYER_SWING.knockLock).toBeLessThanOrEqual(0.1);
    expect(PLAYER_SWING.moveFactor).toBeGreaterThan(0.5);
  });
});
