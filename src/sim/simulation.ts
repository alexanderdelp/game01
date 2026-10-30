/**
 * Lebendige Welt als reine Funktion von Seed und Weltzeit (echte Uhrzeit). Kein Nachrechnen nötig, und alle
 * Spieler sehen zur selben Zeit dieselbe Welt (wichtig für M11). Spielereinfluss kommt aus dem Weltzustand.
 */
import { ENEMIES, type EnemyKind } from '../combat/enemies';
import { BIOMES, B } from '../world/biomes';
import type { Realm, Settlement, WorldMeta } from '../world/meta';
import { hash2, mulberry32 } from '../world/rng';

/** Bezugspunkt der Weltzeit. */
export const EPOCH = Date.UTC(2026, 0, 1);
export const DAY_MS = 24 * 60_000;
export const TICK_MS = 60 * 60_000;

export const tickAt = (now: number) => Math.floor((now - EPOCH) / TICK_MS);

/** Tageszeit 0..1 (0 = Mitternacht, 0.5 = Mittag). */
export function timeOfDay(now: number): number {
  return (((now - EPOCH) % DAY_MS) + DAY_MS) % DAY_MS / DAY_MS;
}

/** Helligkeit 0 (Nacht) .. 1 (Tag) mit weichen Übergängen. */
export function daylight(now: number): number {
  const t = timeOfDay(now);
  const sun = Math.sin((t - 0.25) * Math.PI * 2); // -1 Mitternacht, +1 Mittag
  return Math.min(1, Math.max(0, (sun + 0.25) / 0.6));
}

export function clockText(now: number): string {
  const m = Math.floor(timeOfDay(now) * 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Glatte 1D-Werte-Rauschfunktion aus einem Hash (für langsame Schwankungen über Ticks). */
function smooth(seed: number, key: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash2(seed, key, i, 61) / 4294967296;
  const b = hash2(seed, key, i + 1, 61) / 4294967296;
  const u = f * f * (3 - 2 * f);
  return a * (1 - u) + b * u; // 0..1
}

// ---------------------------------------------------------------- Wetter

export type Weather = 'klar' | 'regen' | 'schnee' | 'nebel' | 'sturm';

export function weatherAt(seed: number, realm: number, now: number, biome: B): Weather {
  const r = hash2(seed, realm, tickAt(now), 71) / 4294967296;
  const cold = biome === B.Snow || biome === B.Tundra || biome === B.Mountain;
  const dry = biome === B.Desert || biome === B.Savanna;
  if (r < 0.5) return 'klar';
  if (r < 0.75) return dry ? 'klar' : cold ? 'schnee' : 'regen';
  if (r < 0.92) return 'nebel';
  return dry ? 'sturm' : cold ? 'schnee' : 'sturm';
}

// ---------------------------------------------------------------- Reichsmacht und Wohlstand

/** Macht eines Reichs (≈ 0.75 .. 1.45): langsames Auf und Ab über Tage + Ansehen des Spielers. */
export function realmPower(seed: number, realm: number, now: number, reputation = 0): number {
  const days = (now - EPOCH) / (24 * TICK_MS);
  return 0.75 + 0.5 * smooth(seed, realm, days / 2) + Math.min(0.2, reputation * 0.001);
}

/** Selbstständige Schwankung des Wohlstands eines Orts (−2 .. +3), über Tage. */
export function townDrift(seed: number, town: number, now: number): number {
  const days = (now - EPOCH) / (24 * TICK_MS);
  return Math.round(smooth(seed, 1000 + town, days / 3) * 5 - 2);
}

// ---------------------------------------------------------------- Karawanen

export interface Caravan {
  id: number;
  name: string;
  from: Settlement;
  to: Settlement;
  /** Dauer einer Strecke in ms */
  legMs: number;
  offset: number;
}

const CARAVAN_NAMES = ['Sternenzug', 'Kupferkarawane', 'Neonfracht', 'Salzweg', 'Splitterhändler', 'Graue Wagen', 'Funkenkonvoi', 'Mondsegler'];
const SPEED_TILES_PER_MIN = 4;

/** Karawanen zwischen nahen Orten mit Landweg (Luftlinie überwiegend begehbar). */
export function caravans(meta: WorldMeta, biomeAt: (tx: number, ty: number) => B, seed: number): Caravan[] {
  const rnd = mulberry32(seed ^ 0xca7a);
  const out: Caravan[] = [];
  const used = new Set<number>();
  for (const a of meta.settlements) {
    if (used.has(a.id) || out.length >= 8) continue;
    const candidates = meta.settlements
      .filter((b) => b.id !== a.id && !used.has(b.id))
      .map((b) => ({ b, d: Math.hypot(b.tx - a.tx, b.ty - a.ty) }))
      .filter((x) => x.d > 60 && x.d < 600)
      .sort((x, y) => x.d - y.d);
    for (const { b, d } of candidates) {
      let land = 0;
      const n = Math.ceil(d / 4);
      for (let i = 0; i <= n; i++) if (BIOMES[biomeAt(Math.round(a.tx + ((b.tx - a.tx) * i) / n), Math.round(a.ty + ((b.ty - a.ty) * i) / n))].walkable) land++;
      if (land / (n + 1) < 0.97) continue;
      used.add(a.id);
      used.add(b.id);
      out.push({ id: out.length, name: CARAVAN_NAMES[out.length % CARAVAN_NAMES.length], from: a, to: b, legMs: (d / SPEED_TILES_PER_MIN) * 60_000, offset: rnd() });
      break;
    }
  }
  return out;
}

/** Position einer Karawane (Kachel, gebrochen) und Richtung; pendelt mit kurzer Rast am Ziel. */
export function caravanPos(c: Caravan, now: number): { tx: number; ty: number; dir: 1 | -1; resting: boolean; at: Settlement | null } {
  const rest = 0.08;
  const cycle = 2 * c.legMs * (1 + rest);
  const p = (((now - EPOCH) / cycle + c.offset) % 1 + 1) % 1;
  const half = 0.5;
  let f: number;
  let dir: 1 | -1;
  if (p < half) {
    const q = p / half;
    f = Math.min(1, q * (1 + rest));
    dir = 1;
  } else {
    const q = (p - half) / half;
    f = 1 - Math.min(1, q * (1 + rest));
    dir = -1;
  }
  const resting = f === 1 || f === 0;
  return {
    tx: c.from.tx + (c.to.tx - c.from.tx) * f,
    ty: c.from.ty + (c.to.ty - c.from.ty) * f + 3,
    dir,
    resting,
    at: f >= 1 ? c.to : f <= 0 ? c.from : null,
  };
}

// ---------------------------------------------------------------- Invasionen

export interface Invasion {
  realm: number;
  kind: EnemyKind;
}

/** In jedem Tick wird mit 50 % Chance ein Reich von einer Gegnerart heimgesucht. */
export function invasionAt(seed: number, realms: Realm[], now: number): Invasion | null {
  const rnd = mulberry32(hash2(seed, tickAt(now), 0, 83));
  if (rnd() > 0.5) return null;
  const realm = realms[Math.floor(rnd() * realms.length)].id;
  const kinds = Object.keys(ENEMIES) as EnemyKind[];
  return { realm, kind: kinds[Math.floor(rnd() * kinds.length)] };
}

// ---------------------------------------------------------------- Neuigkeiten

export interface News {
  tick: number;
  text: string;
}

const KIND_PLURAL: Record<EnemyKind, string> = { slime: 'Schleime', wisp: 'Irrlichter', drone: 'Drohnen', bandit: 'Räuberbanden' };

/** Ereignisse eines Ticks (für „Während du weg warst …“). */
export function newsForTick(meta: WorldMeta, seed: number, tick: number, cars: Caravan[]): News[] {
  const now = EPOCH + tick * TICK_MS + 1;
  const prev = now - TICK_MS;
  const out: News[] = [];
  const inv = invasionAt(seed, meta.realms, now);
  if (inv) out.push({ tick, text: `${KIND_PLURAL[inv.kind]} fallen in ${meta.realms[inv.realm].name} ein!` });
  for (const r of meta.realms) {
    const d = realmPower(seed, r.id, now) - realmPower(seed, r.id, prev);
    if (d > 0.02) out.push({ tick, text: `${r.name} gewinnt an Einfluss und verschiebt seine Grenzen.` });
    if (d < -0.02) out.push({ tick, text: `${r.name} verliert Gebiete an seine Nachbarn.` });
  }
  for (const c of cars) {
    const a = caravanPos(c, prev).at;
    const b = caravanPos(c, now).at;
    if (b && b !== a) out.push({ tick, text: `Die Karawane „${c.name}“ ist in ${b.name} eingetroffen.` });
  }
  for (const s of meta.settlements) {
    const d = townDrift(seed, s.id, now) - townDrift(seed, s.id, prev);
    if (d > 0) out.push({ tick, text: `In ${s.name} wird gefeiert – der Ort wächst.` });
    if (d < 0) out.push({ tick, text: `Schwere Zeiten in ${s.name}: Bewohner ziehen fort.` });
  }
  return out;
}

/** Neuigkeiten zwischen zwei Zeitpunkten (höchstens die letzten `maxTicks` Ticks). */
export function newsBetween(meta: WorldMeta, seed: number, from: number, to: number, cars: Caravan[], maxTicks = 24): News[] {
  const t1 = tickAt(to);
  const t0 = Math.max(tickAt(from) + 1, t1 - maxTicks + 1);
  const out: News[] = [];
  for (let t = t0; t <= t1; t++) out.push(...newsForTick(meta, seed, t, cars));
  return out;
}
