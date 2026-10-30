/** Quests: seed-basierte Erzeugung pro NPC, Fortschritt, Annehmen/Abgeben. Rein, ohne Phaser. */
import { ENEMIES, type EnemyKind } from '../combat/enemies';
import { B, BIOMES } from '../world/biomes';
import { npcsForChunk, ROLES, type NpcSpawn } from '../world/npcs';
import { hash2, mulberry32 } from '../world/rng';
import { CHUNK_TILES, WORLD_TILES, type WorldGen } from '../world/WorldGen';

export type Objective =
  | { type: 'kill'; kind: EnemyKind; count: number; done: number }
  | { type: 'collect'; kind: EnemyKind; item: string; count: number; done: number }
  | { type: 'deliver'; npcId: string; npcName: string; tx: number; ty: number; count: 1; done: number }
  | { type: 'visit'; biome: B; tx: number; ty: number; count: 1; done: number };

export interface Quest {
  id: string;
  giverId: string;
  giverName: string;
  giverTx: number;
  giverTy: number;
  title: string;
  text: string;
  objective: Objective;
  reward: { xp: number; shards: number; item: boolean };
}

export interface QuestLog {
  active: Quest[];
  /** Nächster Quest-Index je Auftraggeber */
  next: Record<string, number>;
  /** Frühester Zeitpunkt (ms) für das nächste Angebot je Auftraggeber */
  cooldown: Record<string, number>;
}

export const MAX_ACTIVE = 5;
export const VISIT_RADIUS = 6;

export function newQuestLog(): QuestLog {
  return { active: [], next: {}, cooldown: {} };
}

const ITEM_NAMES: Record<EnemyKind, string> = { slime: 'Schleimprobe', wisp: 'Irrlicht-Funke', drone: 'Altteil', bandit: 'Diebesgut' };
const KIND_PLURAL: Record<EnemyKind, string> = { slime: 'Schleime', wisp: 'Irrlichter', drone: 'Drohnen', bandit: 'Räuber' };

const ROLE_TYPES: Record<string, Objective['type'][]> = {
  wanderer: ['deliver', 'visit', 'kill'],
  hunter: ['kill', 'kill', 'collect'],
  herder: ['kill', 'deliver'],
  fisher: ['deliver', 'collect'],
  nomad: ['visit', 'kill'],
  hermit: ['visit', 'visit', 'collect'],
  crystalseeker: ['collect', 'visit', 'kill'],
  scavenger: ['collect', 'kill', 'deliver'],
};

const ROLE_KINDS: Record<string, EnemyKind[]> = {
  wanderer: ['slime', 'bandit'],
  hunter: ['slime', 'wisp', 'bandit'],
  herder: ['slime', 'bandit'],
  fisher: ['slime'],
  nomad: ['bandit', 'slime'],
  hermit: ['wisp'],
  crystalseeker: ['wisp', 'slime'],
  scavenger: ['drone', 'bandit'],
};

const VISIT_BIOMES = [B.CrystalGrove, B.ScrapWastes, B.Desert, B.Snow, B.Jungle, B.Swamp, B.Beach, B.Mountain, B.Savanna];

export function compass(dx: number, dy: number): string {
  const a = (Math.atan2(dy, dx) * 180) / Math.PI;
  const dirs = ['Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten', 'Norden', 'Nordosten'];
  return dirs[(Math.round(a / 45) + 8) % 8];
}

function findDeliverTarget(world: WorldGen, giver: NpcSpawn, rnd: () => number): NpcSpawn | null {
  const gcx = Math.floor(giver.tx / CHUNK_TILES);
  const gcy = Math.floor(giver.ty / CHUNK_TILES);
  for (let i = 0; i < 24; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 3 + rnd() * 7;
    const cx = Math.round(gcx + Math.cos(a) * d);
    const cy = Math.round(gcy + Math.sin(a) * d);
    const n = npcsForChunk(world, cx, cy).find((s) => s.id !== giver.id);
    if (n) return n;
  }
  return null;
}

function findVisitTarget(world: WorldGen, giver: NpcSpawn, rnd: () => number): { biome: B; tx: number; ty: number } | null {
  const home = world.biomeAt(giver.tx, giver.ty);
  const start = Math.floor(rnd() * 8);
  for (let r = 0; r < 8; r++) {
    const a = ((start + r) / 8) * Math.PI * 2 + rnd() * 0.3;
    for (let d = 50; d <= 220; d += 6) {
      const tx = Math.round(giver.tx + Math.cos(a) * d);
      const ty = Math.round(giver.ty + Math.sin(a) * d);
      if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) break;
      const b = world.biomeAt(tx, ty);
      if (b !== home && VISIT_BIOMES.includes(b) && BIOMES[b].walkable) return { biome: b, tx, ty };
    }
  }
  return null;
}

/** Erzeugt die `index`-te Quest eines NPC (deterministisch). */
export function generateQuest(world: WorldGen, giver: NpcSpawn, index: number, heroLevel: number): Quest | null {
  const rnd = mulberry32(hash2(world.seed, giver.tx, giver.ty, 9000 + index));
  const types = ROLE_TYPES[giver.role] ?? ['kill'];
  const kinds = ROLE_KINDS[giver.role] ?? ['slime'];
  const reward = { xp: Math.round((15 + heroLevel * 8) * (0.9 + rnd() * 0.3)), shards: 5 + Math.floor(rnd() * (5 + heroLevel * 3)), item: rnd() < 0.35 };
  const base = { id: `q:${giver.id}:${index}`, giverId: giver.id, giverName: giver.name, giverTx: giver.tx, giverTy: giver.ty, reward };
  // Mehrere Versuche, falls eine Art kein erreichbares Ziel findet
  for (let attempt = 0; attempt < 3; attempt++) {
    const type = types[Math.floor(rnd() * types.length)];
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    if (type === 'kill') {
      const count = 3 + Math.floor(rnd() * 4);
      return {
        ...base,
        title: `Jagd: ${KIND_PLURAL[kind]}`,
        text: pick(rnd, [
          `${KIND_PLURAL[kind]} machen die Gegend unsicher. Erledige ${count} von ihnen!`,
          `Ich zahle gut, wenn du ${count} ${KIND_PLURAL[kind]} vertreibst.`,
          `Seit Tagen schleichen ${KIND_PLURAL[kind]} um mein Lager. ${count} weniger wären ein Anfang.`,
        ]),
        objective: { type, kind, count, done: 0 },
      };
    }
    if (type === 'collect') {
      const count = 2 + Math.floor(rnd() * 3);
      const item = ITEM_NAMES[kind];
      return {
        ...base,
        title: `Sammeln: ${item}`,
        text: `Bring mir ${count}× ${item}. ${ENEMIES[kind].name}-Gegner tragen so etwas bei sich.`,
        objective: { type, kind, item, count, done: 0 },
      };
    }
    if (type === 'deliver') {
      const t = findDeliverTarget(world, giver, rnd);
      if (!t) continue;
      const dir = compass(t.tx - giver.tx, t.ty - giver.ty);
      return {
        ...base,
        title: `Botengang zu ${t.name}`,
        text: pick(rnd, [
          `Bring diesen Brief zu ${t.name}, ${ROLES[t.role].name.toLowerCase()} im ${dir}.`,
          `${t.name} wartet im ${dir} auf dieses Päckchen. Ich kann hier nicht weg.`,
        ]),
        objective: { type, npcId: t.id, npcName: t.name, tx: t.tx, ty: t.ty, count: 1, done: 0 },
      };
    }
    const v = findVisitTarget(world, giver, rnd);
    if (!v) continue;
    const dir = compass(v.tx - giver.tx, v.ty - giver.ty);
    const name = BIOMES[v.biome].name;
    return {
      ...base,
      title: `Erkundung: ${name}`,
      text: pick(rnd, [
        `Im ${dir} soll es ein Gebiet geben – ${name}. Sieh nach und berichte mir!`,
        `Reisende sprechen von ${name} im ${dir}. Ich wüsste gern, ob das stimmt.`,
      ]),
      objective: { type: 'visit', biome: v.biome, tx: v.tx, ty: v.ty, count: 1, done: 0 },
    };
  }
  return null;
}

function pick<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

export const isReady = (q: Quest) => q.objective.done >= q.objective.count;

/** Aktuelles Angebot eines NPC oder null. */
export function offerFor(world: WorldGen, log: QuestLog, npc: NpcSpawn, heroLevel: number, now: number): Quest | null {
  if (log.active.some((q) => q.giverId === npc.id)) return null;
  if ((log.cooldown[npc.id] ?? 0) > now) return null;
  return generateQuest(world, npc, log.next[npc.id] ?? 0, heroLevel);
}

export function accept(log: QuestLog, q: Quest): boolean {
  if (log.active.length >= MAX_ACTIVE || log.active.some((a) => a.id === q.id)) return false;
  log.active.push(q);
  return true;
}

export function abandon(log: QuestLog, id: string): void {
  log.active = log.active.filter((q) => q.id !== id);
}

/** Schließt eine Quest ab und gibt die Belohnung zurück. */
export function turnIn(log: QuestLog, id: string, now: number): Quest['reward'] | null {
  const q = log.active.find((a) => a.id === id);
  if (!q || !isReady(q)) return null;
  abandon(log, id);
  log.next[q.giverId] = (log.next[q.giverId] ?? 0) + 1;
  log.cooldown[q.giverId] = now + 60_000;
  return q.reward;
}

/** Fortschritt durch einen besiegten Gegner. Gibt geänderte Quests zurück. */
export function onKill(log: QuestLog, kind: EnemyKind): Quest[] {
  const changed: Quest[] = [];
  for (const q of log.active) {
    if (q.objective.type === 'kill' && q.objective.kind === kind && !isReady(q)) {
      q.objective.done++;
      changed.push(q);
    }
  }
  return changed;
}

/** Soll ein besiegter Gegner einen Questgegenstand fallen lassen? Gibt die Quest zurück. */
export function questDropFor(log: QuestLog, kind: EnemyKind, roll: number): Quest | null {
  if (roll > 0.6) return null;
  return log.active.find((q) => q.objective.type === 'collect' && q.objective.kind === kind && !isReady(q)) ?? null;
}

export function onCollect(log: QuestLog, questId: string): Quest | null {
  const q = log.active.find((a) => a.id === questId);
  if (!q || q.objective.type !== 'collect' || isReady(q)) return null;
  q.objective.done++;
  return q;
}

/** Ansprechen eines NPC: erfüllt Botengänge. */
export function onTalk(log: QuestLog, npcId: string): Quest | null {
  const q = log.active.find((a) => a.objective.type === 'deliver' && a.objective.npcId === npcId && !isReady(a));
  if (!q) return null;
  q.objective.done = 1;
  return q;
}

/** Position des Helden: erfüllt Erkundungen. */
export function onPosition(log: QuestLog, tx: number, ty: number): Quest | null {
  const q = log.active.find((a) => a.objective.type === 'visit' && !isReady(a) && Math.hypot(a.objective.tx - tx, a.objective.ty - ty) <= VISIT_RADIUS);
  if (!q) return null;
  q.objective.done = 1;
  return q;
}

/** Wohin muss der Held als Nächstes (Kachel), oder null, wenn kein Ort nötig ist. */
export function questTarget(q: Quest): { tx: number; ty: number; label: string } | null {
  if (isReady(q)) return q.objective.type === 'deliver' ? null : { tx: q.giverTx, ty: q.giverTy, label: q.giverName };
  if (q.objective.type === 'deliver') return { tx: q.objective.tx, ty: q.objective.ty, label: q.objective.npcName };
  if (q.objective.type === 'visit') return { tx: q.objective.tx, ty: q.objective.ty, label: BIOMES[q.objective.biome].name };
  return null;
}

export function progressText(q: Quest): string {
  const o = q.objective;
  if (isReady(q)) return o.type === 'deliver' ? 'Erledigt' : `Zurück zu ${q.giverName}`;
  switch (o.type) {
    case 'kill':
      return `${KIND_PLURAL[o.kind]}: ${o.done}/${o.count}`;
    case 'collect':
      return `${o.item}: ${o.done}/${o.count}`;
    case 'deliver':
      return `Brief an ${o.npcName}`;
    case 'visit':
      return `Finde: ${BIOMES[o.biome].name}`;
  }
}
