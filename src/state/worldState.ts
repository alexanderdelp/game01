/**
 * Weltzustand als Ereignisprotokoll: alles, was vom Seed abweicht. Der aktuelle Zustand wird rein aus den
 * Ereignissen abgeleitet. Getrennt vom Helden, damit die Welt später (M11) geteilt werden kann.
 */

export const STATE_VERSION = 1;
export const RESPAWN_MS = 20 * 60_000;

type Base = { t: number; by: string; /** Spieler-ID (fehlt bei sehr alten Ereignissen) */ pid?: string };

export type WorldEvent =
  | (Base & { type: 'chest'; id: string })
  | (Base & { type: 'kill'; id: string; realm: number })
  | (Base & { type: 'discover'; id: string })
  | (Base & { type: 'quest'; town: number | null; realm: number })
  | (Base & { type: 'sign'; tx: number; ty: number; text: string })
  | (Base & { type: 'death'; tx: number; ty: number });

export const SIGN_MAX = 80;
export const DEATH_MS = 24 * 60 * 60_000;

/** Eindeutiger Schlüssel eines Ereignisses (für konfliktfreies Zusammenführen). */
export function eventKey(e: WorldEvent): string {
  const target = 'id' in e ? e.id : 'tx' in e ? `${e.tx},${e.ty}` : `${e.town},${e.realm}`;
  return `${e.pid ?? e.by}|${e.t}|${e.type}|${target}`;
}

/** Vereinigt zwei Protokolle (kommutativ, idempotent), zeitlich sortiert. */
export function merge(a: WorldEvent[], b: WorldEvent[]): WorldEvent[] {
  const map = new Map<string, WorldEvent>();
  for (const e of a) map.set(eventKey(e), e);
  for (const e of b) map.set(eventKey(e), e);
  return [...map.values()].sort((x, y) => x.t - y.t || eventKey(x).localeCompare(eventKey(y)));
}

export interface Sign {
  tx: number;
  ty: number;
  text: string;
  by: string;
  t: number;
}

export interface WorldSave {
  version: number;
  seed: string;
  events: WorldEvent[];
}

/** Abgeleiteter Zustand. */
export interface Derived {
  chests: Set<string>;
  /** Gegner-ID → Zeitpunkt des Besiegens */
  kills: Map<string, number>;
  /** Entdeckt: ID → wer zuerst */
  discovered: Map<string, string>;
  /** Wohlstand je Siedlung (Anzahl erledigter Quests) */
  prosperity: Map<number, number>;
  /** Ansehen je Reich */
  reputation: Map<number, number>;
  /** Wer welche Truhe geöffnet hat */
  chestsBy: Map<string, string>;
  /** Quests je Ort und Spielername (für die Statue) */
  questsBy: Map<number, Map<string, number>>;
  /** Botschaften nach Kachel */
  signs: Map<string, Sign>;
  /** Gefallen-Marker */
  deaths: { tx: number; ty: number; by: string; t: number }[];
}

export function emptyDerived(): Derived {
  return {
    chests: new Set(), kills: new Map(), discovered: new Map(), prosperity: new Map(), reputation: new Map(),
    chestsBy: new Map(), questsBy: new Map(), signs: new Map(), deaths: [],
  };
}

export function apply(d: Derived, e: WorldEvent): void {
  switch (e.type) {
    case 'chest':
      d.chests.add(e.id);
      if (!d.chestsBy.has(e.id)) d.chestsBy.set(e.id, e.by);
      break;
    case 'sign':
      d.signs.set(`${e.tx},${e.ty}`, { tx: e.tx, ty: e.ty, text: e.text.slice(0, SIGN_MAX), by: e.by, t: e.t });
      break;
    case 'death':
      d.deaths.push({ tx: e.tx, ty: e.ty, by: e.by, t: e.t });
      break;
    case 'kill':
      d.kills.set(e.id, e.t);
      d.reputation.set(e.realm, (d.reputation.get(e.realm) ?? 0) + 1);
      break;
    case 'discover':
      if (!d.discovered.has(e.id)) d.discovered.set(e.id, e.by);
      break;
    case 'quest':
      if (e.town !== null) {
        d.prosperity.set(e.town, (d.prosperity.get(e.town) ?? 0) + 1);
        const by = d.questsBy.get(e.town) ?? new Map<string, number>();
        by.set(e.by, (by.get(e.by) ?? 0) + 1);
        d.questsBy.set(e.town, by);
      }
      d.reputation.set(e.realm, (d.reputation.get(e.realm) ?? 0) + 10);
      break;
  }
}

export function derive(events: WorldEvent[]): Derived {
  const d = emptyDerived();
  for (const e of events) apply(d, e);
  return d;
}

export function isDefeated(d: Derived, id: string, now: number): boolean {
  const t = d.kills.get(id);
  return t !== undefined && now - t < RESPAWN_MS;
}

/** Wohlstandsstufe eines Orts: 0 (normal), 1 Laternen, 2 Ausbau, 3 Statue. */
export function prosperityLevel(n: number): 0 | 1 | 2 | 3 {
  return n >= 10 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0;
}

/** Ansehensstufe und Titel. */
export function reputationRank(rep: number): { rank: 0 | 1 | 2 | 3; title: string; discount: number } {
  if (rep >= 150) return { rank: 3, title: 'Held', discount: 0.3 };
  if (rep >= 60) return { rank: 2, title: 'Freund', discount: 0.2 };
  if (rep >= 20) return { rank: 1, title: 'Bekannter', discount: 0.1 };
  return { rank: 0, title: 'Fremder', discount: 0 };
}

/**
 * Verdichtet das Protokoll: abgelaufene Kills fallen weg, Kill-Ereignisse älter als die Wiederkehr werden zu
 * Ansehenspunkten zusammengefasst (damit das Ansehen erhalten bleibt). Ergebnis bleibt ableitungsgleich
 * bis auf abgelaufene Kills.
 */
export function compact(events: WorldEvent[], now: number): WorldEvent[] {
  const out: WorldEvent[] = [];
  // Alte Kills je Spieler und Reich zählen (Ansehen bleibt erhalten)
  const oldKills = new Map<string, { by: string; pid?: string; realm: number; n: number }>();
  for (const e of events) {
    if (e.type === 'death' && now - e.t >= DEATH_MS) continue;
    if (e.type === 'kill' && now - e.t >= RESPAWN_MS) {
      const k = `${e.pid ?? e.by}|${e.realm}`;
      const o = oldKills.get(k) ?? { by: e.by, pid: e.pid, realm: e.realm, n: 0 };
      o.n++;
      oldKills.set(k, o);
      continue;
    }
    out.push(e);
  }
  // Als Ereignisse mit Zeit 0 und eindeutiger ID je Spieler/Reich/Nummer → beim Zusammenführen keine falschen Duplikate
  const summary: WorldEvent[] = [];
  for (const o of oldKills.values()) {
    for (let i = 0; i < o.n; i++) summary.push({ t: 0, by: o.by, ...(o.pid ? { pid: o.pid } : {}), type: 'kill', id: `_old:${o.realm}:${i}`, realm: o.realm });
  }
  return [...summary, ...out];
}

/** Schnittstelle für die Speicherung (lokal; in M11 austauschbar gegen einen Server). */
export interface WorldStore {
  load(seed: string): WorldSave | null;
  save(data: WorldSave): void;
}

export class LocalWorldStore implements WorldStore {
  load(seed: string): WorldSave | null {
    try {
      const raw = localStorage.getItem(`game01:world:${seed}`);
      if (!raw) return null;
      const data = JSON.parse(raw) as WorldSave;
      return data.version === STATE_VERSION ? data : null;
    } catch {
      return null;
    }
  }

  save(data: WorldSave): void {
    try {
      localStorage.setItem(`game01:world:${data.seed}`, JSON.stringify(data));
    } catch {
      // voller Speicher: Komfortfunktion, kein Absturz
    }
  }
}

/** Held mit den meisten Quests in einem Ort (für die Statue). */
export function topContributor(d: Derived, town: number): string | null {
  const by = d.questsBy.get(town);
  if (!by) return null;
  return [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/** Laufzeit-Weltzustand: Protokoll + abgeleiteter Zustand, speichert verzögert. */
export class WorldState {
  events: WorldEvent[];
  d: Derived;
  private dirty = false;
  private readonly keys = new Set<string>();

  constructor(
    readonly seed: string,
    private readonly store: WorldStore,
    now = Date.now(),
    /** Spieler-ID für neue Ereignisse */
    readonly pid = '',
  ) {
    const saved = store.load(seed);
    this.events = compact(saved?.events ?? [], now);
    this.d = derive(this.events);
    for (const e of this.events) this.keys.add(eventKey(e));
  }

  record(e: WorldEvent): void {
    if (this.pid && !e.pid) e.pid = this.pid;
    const k = eventKey(e);
    if (this.keys.has(k)) return;
    this.keys.add(k);
    this.events.push(e);
    apply(this.d, e);
    this.dirty = true;
  }

  /** Übernimmt fremde Ereignisse; gibt die tatsächlich neuen zurück. */
  mergeIn(incoming: WorldEvent[]): WorldEvent[] {
    const fresh = incoming.filter((e) => !this.keys.has(eventKey(e)));
    if (!fresh.length) return [];
    this.events = merge(this.events, fresh);
    for (const e of fresh) this.keys.add(eventKey(e));
    this.d = derive(this.events);
    this.dirty = true;
    return fresh;
  }

  flush(): void {
    if (!this.dirty) return;
    this.store.save({ version: STATE_VERSION, seed: this.seed, events: this.events });
    this.dirty = false;
  }
}
