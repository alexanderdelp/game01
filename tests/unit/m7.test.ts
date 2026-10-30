import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../src/world/biomes';
import { npcsForChunk, type NpcSpawn } from '../../src/world/npcs';
import { WorldGen } from '../../src/world/WorldGen';
import {
  MAX_ACTIVE, abandon, accept, compass, generateQuest, isReady, newQuestLog, offerFor, onCollect, onKill, onPosition, onTalk,
  questDropFor, questTarget, turnIn,
} from '../../src/quests/quests';

const w = new WorldGen('test');
const npcs: NpcSpawn[] = [];
for (let cy = 110; cy < 150; cy += 3) for (let cx = 110; cx < 150; cx += 3) npcs.push(...npcsForChunk(w, cx, cy));

describe('Quest-Erzeugung (R1)', () => {
  it('deterministisch, alle Arten kommen vor, Ziele sind gültig', () => {
    const quests = npcs.slice(0, 60).map((n) => generateQuest(w, n, 0, 1)).filter((q) => q !== null);
    expect(quests.length).toBeGreaterThan(40);
    expect(generateQuest(w, npcs[0], 0, 1)).toEqual(generateQuest(new WorldGen('test'), npcs[0], 0, 1));
    expect(new Set(quests.map((q) => q.objective.type))).toEqual(new Set(['kill', 'collect', 'deliver', 'visit']));
    for (const q of quests) {
      if (q.objective.type === 'visit') expect(BIOMES[w.biomeAt(q.objective.tx, q.objective.ty)].walkable).toBe(true);
      if (q.objective.type === 'deliver') {
        const o = q.objective;
        const chunk = npcsForChunk(w, Math.floor(o.tx / 16), Math.floor(o.ty / 16));
        expect(chunk.some((n) => n.id === o.npcId)).toBe(true);
      }
      expect(q.reward.xp).toBeGreaterThan(0);
      expect(q.text.length).toBeGreaterThan(10);
    }
  });

  it('Folgequests unterscheiden sich', () => {
    const a = generateQuest(w, npcs[3], 0, 1)!;
    const b = generateQuest(w, npcs[3], 1, 1)!;
    expect(a.id).not.toBe(b.id);
  });

  it('Himmelsrichtungen', () => {
    expect(compass(1, 0)).toBe('Osten');
    expect(compass(0, -1)).toBe('Norden');
    expect(compass(-1, 1)).toBe('Südwesten');
  });
});

describe('Fortschritt & Ablauf (R2, R3)', () => {
  const find = (type: string) => {
    for (const n of npcs) for (let i = 0; i < 4; i++) {
      const q = generateQuest(w, n, i, 1);
      if (q?.objective.type === type) return q;
    }
    throw new Error(type);
  };

  it('Jagd, Sammeln, Botengang, Erkundung', () => {
    const log = newQuestLog();
    const kill = find('kill');
    const collect = find('collect');
    const deliver = find('deliver');
    const visit = find('visit');
    for (const q of [kill, collect, deliver, visit]) expect(accept(log, q)).toBe(true);
    if (kill.objective.type !== 'kill') throw new Error();
    for (let i = 0; i < kill.objective.count; i++) onKill(log, kill.objective.kind);
    expect(isReady(kill)).toBe(true);
    expect(onKill(log, kill.objective.kind)).toEqual([]);

    if (collect.objective.type !== 'collect') throw new Error();
    expect(questDropFor(log, collect.objective.kind, 0.9)).toBeNull();
    expect(questDropFor(log, collect.objective.kind, 0.1)?.id).toBe(collect.id);
    for (let i = 0; i < collect.objective.count; i++) onCollect(log, collect.id);
    expect(isReady(collect)).toBe(true);

    if (deliver.objective.type !== 'deliver') throw new Error();
    expect(questTarget(deliver)?.label).toBe(deliver.objective.npcName);
    expect(onTalk(log, 'jemand-anders')).toBeNull();
    expect(onTalk(log, deliver.objective.npcId)?.id).toBe(deliver.id);
    expect(isReady(deliver)).toBe(true);

    if (visit.objective.type !== 'visit') throw new Error();
    expect(onPosition(log, visit.objective.tx + 20, visit.objective.ty)).toBeNull();
    expect(onPosition(log, visit.objective.tx + 3, visit.objective.ty)?.id).toBe(visit.id);
    expect(questTarget(visit)?.tx).toBe(visit.giverTx);

    const r = turnIn(log, kill.id, 1000);
    expect(r?.xp).toBe(kill.reward.xp);
    expect(log.active.find((q) => q.id === kill.id)).toBeUndefined();
    expect(log.next[kill.giverId]).toBe(1);
  });

  it('Angebote: nicht doppelt, Abklingzeit, max. aktive, Abbrechen', () => {
    const log = newQuestLog();
    const n = npcs[5];
    const q = offerFor(w, log, n, 1, 0)!;
    expect(q).not.toBeNull();
    accept(log, q);
    expect(offerFor(w, log, n, 1, 0)).toBeNull();
    abandon(log, q.id);
    expect(log.active).toHaveLength(0);
    log.cooldown[n.id] = 5000;
    expect(offerFor(w, log, n, 1, 1000)).toBeNull();
    expect(offerFor(w, log, n, 1, 6000)).not.toBeNull();
    for (let i = 0; i < 10; i++) {
      const o = generateQuest(w, npcs[10 + i], 0, 1);
      if (o) accept(log, o);
    }
    expect(log.active.length).toBe(MAX_ACTIVE);
  });
});
