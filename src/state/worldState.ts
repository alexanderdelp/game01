/**
 * Weltzustand als Ereignisprotokoll: alles, was vom Seed abweicht. Der aktuelle Zustand wird rein aus den
 * Ereignissen abgeleitet. Getrennt vom Helden, damit die Welt später (M11) geteilt werden kann.
 */

export const STATE_VERSION = 1;
export const RESPAWN_MS = 20 * 60_000;

export type WorldEvent =
  | { t: number; by: string; type: 'chest'; id: string }
  | { t: number; by: string; type: 'kill'; id: string; realm: number }
  | { t: number; by: string; type: 'discover'; id: string }
  | { t: number; by: string; type: 'quest'; town: number | null; realm: number };

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
}

export function emptyDerived(): Derived {
  return { chests: new Set(), kills: new Map(), discovered: new Map(), prosperity: new Map(), reputation: new Map() };
}

export function apply(d: Derived, e: WorldEvent): void {
  switch (e.type) {
    case 'chest':
      d.chests.add(e.id);
      break;
    case 'kill':
      d.kills.set(e.id, e.t);
      d.reputation.set(e.realm, (d.reputation.get(e.realm) ?? 0) + 1);
      break;
    case 'discover':
      if (!d.discovered.has(e.id)) d.discovered.set(e.id, e.by);
      break;
    case 'quest':
      if (e.town !== null) d.prosperity.set(e.town, (d.prosperity.get(e.town) ?? 0) + 1);
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
  const oldKills = new Map<number, number>();
  for (const e of events) {
    if (e.type === 'kill' && now - e.t >= RESPAWN_MS) {
      oldKills.set(e.realm, (oldKills.get(e.realm) ?? 0) + 1);
      continue;
    }
    out.push(e);
  }
  // Ansehen alter Kills als Sammel-Ereignisse (Kill mit abgelaufener ID) erhalten
  for (const [realm, n] of oldKills) for (let i = 0; i < n; i++) out.unshift({ t: 0, by: '', type: 'kill', id: `_old`, realm });
  // Sammel-IDs nicht als „besiegt“ werten: Zeit 0 ist längst abgelaufen.
  return out;
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

/** Laufzeit-Weltzustand: Protokoll + abgeleiteter Zustand, speichert verzögert. */
export class WorldState {
  readonly events: WorldEvent[];
  readonly d: Derived;
  private dirty = false;

  constructor(
    readonly seed: string,
    private readonly store: WorldStore,
    now = Date.now(),
  ) {
    const saved = store.load(seed);
    this.events = compact(saved?.events ?? [], now);
    this.d = derive(this.events);
  }

  record(e: WorldEvent): void {
    this.events.push(e);
    apply(this.d, e);
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    this.store.save({ version: STATE_VERSION, seed: this.seed, events: this.events });
    this.dirty = false;
  }
}
