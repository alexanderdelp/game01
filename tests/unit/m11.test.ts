import { describe, expect, it } from 'vitest';
import { derive, eventKey, merge, topContributor, WorldState, type WorldEvent, type WorldSave, type WorldStore } from '../../src/state/worldState';
import { decodeShare, encodeShare } from '../../src/state/share';

const A: WorldEvent[] = [
  { t: 1, by: 'Ada', pid: 'a', type: 'chest', id: 'c1' },
  { t: 2, by: 'Ada', pid: 'a', type: 'quest', town: 3, realm: 1 },
  { t: 3, by: 'Ada', pid: 'a', type: 'sign', tx: 5, ty: 6, text: 'Vorsicht, Drohnen!' },
];
const B: WorldEvent[] = [
  { t: 2, by: 'Bo', pid: 'b', type: 'quest', town: 3, realm: 1 },
  { t: 4, by: 'Bo', pid: 'b', type: 'quest', town: 3, realm: 1 },
  { t: 5, by: 'Bo', pid: 'b', type: 'death', tx: 9, ty: 9 },
  { t: 1, by: 'Ada', pid: 'a', type: 'chest', id: 'c1' },
];

describe('Zusammenführen (R1)', () => {
  it('kommutativ, idempotent, ohne Duplikate', () => {
    const ab = merge(A, B);
    const ba = merge(B, A);
    expect(ab.map(eventKey)).toEqual(ba.map(eventKey));
    expect(merge(ab, ab).map(eventKey)).toEqual(ab.map(eventKey));
    expect(ab).toHaveLength(6);
  });

  it('abgeleiteter Zustand kennt fremde Taten', () => {
    const d = derive(merge(A, B));
    expect(d.chestsBy.get('c1')).toBe('Ada');
    expect(d.prosperity.get(3)).toBe(3);
    expect(topContributor(d, 3)).toBe('Bo');
    expect(d.signs.get('5,6')?.text).toBe('Vorsicht, Drohnen!');
    expect(d.deaths).toHaveLength(1);
  });

  it('WorldState.mergeIn liefert nur neue Ereignisse', () => {
    const store: WorldStore = { load: () => null, save: (_: WorldSave) => {} };
    const s = new WorldState('x', store, 0, 'a');
    s.record({ t: 1, by: 'Ada', type: 'chest', id: 'c1' });
    expect(s.events[0].pid).toBe('a');
    const fresh = s.mergeIn(B);
    expect(fresh).toHaveLength(3);
    expect(s.mergeIn(B)).toHaveLength(0);
    expect(s.d.prosperity.get(3)).toBe(2);
  });
});

describe('Teilen-Code', () => {
  it('kodiert und dekodiert verlustfrei, kompakt', async () => {
    const events = Array.from({ length: 300 }, (_, i) => ({ t: 1000 + i, by: 'Ada', pid: 'a', type: 'kill', id: `e${i}`, realm: i % 6 }) as WorldEvent);
    const code = await encodeShare({ seed: 'test', events });
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(JSON.stringify(events).length / 3);
    expect(await decodeShare(code)).toEqual({ seed: 'test', events });
    expect(await decodeShare('kaputt!!')).toBeNull();
  });
});
