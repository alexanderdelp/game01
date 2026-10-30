import { describe, expect, it } from 'vitest';
import {
  RESPAWN_MS, WorldState, compact, derive, isDefeated, prosperityLevel, reputationRank, type WorldEvent, type WorldSave, type WorldStore,
} from '../../src/state/worldState';

class MemStore implements WorldStore {
  data: WorldSave | null = null;
  load() {
    return this.data ? JSON.parse(JSON.stringify(this.data)) : null;
  }
  save(d: WorldSave) {
    this.data = JSON.parse(JSON.stringify(d));
  }
}

const ev = (e: Partial<WorldEvent> & { type: WorldEvent['type'] }): WorldEvent => ({ t: 1000, by: 'A', ...e }) as WorldEvent;

describe('Weltzustand (R1)', () => {
  it('leitet Truhen, Entdeckungen, Wohlstand und Ansehen ab', () => {
    const d = derive([
      ev({ type: 'chest', id: 'c1' }),
      ev({ type: 'discover', id: 'town:1', by: 'A' }),
      ev({ type: 'discover', id: 'town:1', by: 'B' }),
      ev({ type: 'quest', town: 1, realm: 2 }),
      ev({ type: 'quest', town: 1, realm: 2 }),
      ev({ type: 'kill', id: 'e1', realm: 2 }),
    ]);
    expect(d.chests.has('c1')).toBe(true);
    expect(d.discovered.get('town:1')).toBe('A');
    expect(d.prosperity.get(1)).toBe(2);
    expect(d.reputation.get(2)).toBe(21);
  });

  it('Kills laufen ab', () => {
    const d = derive([ev({ type: 'kill', id: 'e1', realm: 0, t: 0 })]);
    expect(isDefeated(d, 'e1', RESPAWN_MS - 1)).toBe(true);
    expect(isDefeated(d, 'e1', RESPAWN_MS)).toBe(false);
  });

  it('Stufen und Ränge', () => {
    expect([0, 2, 5, 10].map(prosperityLevel)).toEqual([0, 1, 2, 3]);
    expect(reputationRank(0).discount).toBe(0);
    expect(reputationRank(25).title).toBe('Bekannter');
    expect(reputationRank(200).discount).toBe(0.3);
  });
});

describe('Speichern & Verdichten (R2)', () => {
  it('Verdichten entfernt abgelaufene Kills, erhält aber das Ansehen', () => {
    const events = [ev({ type: 'kill', id: 'e1', realm: 3, t: 0 }), ev({ type: 'kill', id: 'e2', realm: 3, t: RESPAWN_MS * 2 }), ev({ type: 'chest', id: 'c' })];
    const c = compact(events, RESPAWN_MS * 2 + 10);
    const d = derive(c);
    expect(d.reputation.get(3)).toBe(2);
    expect(isDefeated(d, 'e1', RESPAWN_MS * 2 + 10)).toBe(false);
    expect(isDefeated(d, 'e2', RESPAWN_MS * 2 + 10)).toBe(true);
    expect(d.chests.has('c')).toBe(true);
  });

  it('WorldState speichert und lädt', () => {
    const store = new MemStore();
    const a = new WorldState('s', store, 0);
    a.record(ev({ type: 'chest', id: 'x' }));
    a.record(ev({ type: 'quest', town: 4, realm: 1 }));
    a.flush();
    const b = new WorldState('s', store, 5000);
    expect(b.d.chests.has('x')).toBe(true);
    expect(b.d.prosperity.get(4)).toBe(1);
  });
});
