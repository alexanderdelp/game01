import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '../../src/character/lpc';
import { STALE_MS, applyMsg, pruneStale, smoothStep, type LiveMsg, type Remote } from '../../src/net/live';

const state = (pid: string, x: number): LiveMsg => ({ type: 'state', pid, name: pid.toUpperCase(), x, y: 10, facing: 'down', moving: true, hp: 80, maxHp: 100, look: DEFAULT_APPEARANCE, t: 0 });

describe('Live-Nachrichten (R1)', () => {
  it('eigene Nachrichten werden ignoriert, fremde angelegt und aktualisiert', () => {
    const m = new Map<string, Remote>();
    expect(applyMsg(m, state('me', 5), 'me', 0)).toBeNull();
    const r = applyMsg(m, state('a', 5), 'me', 0)!;
    expect(r.x).toBe(5);
    applyMsg(m, state('a', 50), 'me', 100);
    expect(m.get('a')!.tx).toBe(50);
    expect(m.get('a')!.x).toBe(5);
  });

  it('Chat wird an den Mitspieler gehängt und gekürzt', () => {
    const m = new Map<string, Remote>();
    applyMsg(m, state('a', 0), 'me', 0);
    applyMsg(m, { type: 'chat', pid: 'a', name: 'A', text: 'x'.repeat(200) }, 'me', 0);
    expect(m.get('a')!.chat!.text).toHaveLength(60);
  });

  it('veraltete Mitspieler verschwinden, Bewegung wird geglättet', () => {
    const m = new Map<string, Remote>();
    applyMsg(m, state('a', 0), 'me', 0);
    applyMsg(m, state('b', 0), 'me', 4000);
    expect(pruneStale(m, STALE_MS + 1)).toEqual(['a']);
    const r = m.get('b')!;
    r.tx = 100;
    smoothStep(r, 0.05);
    expect(r.x).toBeGreaterThan(0);
    expect(r.x).toBeLessThan(100);
    r.tx = 10_000;
    smoothStep(r, 0.05);
    expect(r.x).toBe(10_000);
  });
});
