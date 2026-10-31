/**
 * World Building: Reiche, Fraktionen, Siedlungen mit Gebäuden, Geheimnisse (Truhen, Schreine, Obelisken)
 * und die Chronik der Welt. Alles deterministisch aus dem Seed. Rein, ohne Phaser.
 */
import { B, BIOMES } from './biomes';
import { Simplex2 } from './noise';
import { hash2, mulberry32 } from './rng';
import { CHUNK_TILES, WORLD_TILES } from './WorldGen';

/** Was die Metadaten von der Landschaft brauchen (vermeidet zirkuläre Abhängigkeit zu WorldGen). */
export interface Terrain {
  readonly seed: number;
  biomeAt(tx: number, ty: number): B;
}

export type Faction = 'mages' | 'techno' | 'clan' | 'traders' | 'order';

export const FACTIONS: Record<Faction, { name: string; the: string; style: 'fantasy' | 'cyber' | 'mixed'; motto: string }> = {
  mages: { name: 'Magierzirkel', the: 'der Magierzirkel', style: 'fantasy', motto: 'Wissen ist die älteste Macht.' },
  techno: { name: 'Technokratie', the: 'die Technokratie', style: 'cyber', motto: 'Der Fortschritt kennt kein Zurück.' },
  clan: { name: 'Klan', the: 'der Klan', style: 'fantasy', motto: 'Blut, Erde und Ehre.' },
  traders: { name: 'Freie Händler', the: 'die Freien Händler', style: 'mixed', motto: 'Alles hat seinen Preis.' },
  order: { name: 'Orden des Lichts', the: 'der Orden des Lichts', style: 'fantasy', motto: 'Das Licht wacht über alle.' },
};

export interface Realm {
  id: number;
  name: string;
  faction: Faction;
  color: number;
  tx: number;
  ty: number;
  capital: number;
}

export type BuildingKind = 'house' | 'tower' | 'neonhouse' | 'stall' | 'well';

export interface Building {
  kind: BuildingKind;
  tx: number;
  ty: number;
  variant: number;
}

export interface Settlement {
  id: number;
  name: string;
  realm: number;
  capital: boolean;
  tx: number;
  ty: number;
  radius: number;
  buildings: Building[];
}

export type PoiKind = 'chest' | 'shrine' | 'obelisk' | 'ruinchest';

export interface Ruin {
  id: number;
  tx: number;
  ty: number;
  realm: number;
}

export interface Poi {
  id: string;
  kind: PoiKind;
  tx: number;
  ty: number;
  /** Für Obelisken: Index des Chronik-Fragments */
  fragment?: number;
}

export const OBELISKS = 8;

const REALM_COLORS = [0xe0b030, 0x2fe0d8, 0xe04a5a, 0x9b6af0, 0x4cb53e, 0xf08a3a];
const SYL_A = ['Esch', 'Raben', 'Mond', 'Silber', 'Eisen', 'Neon', 'Kristall', 'Sturm', 'Dorn', 'Glut', 'Nebel', 'Stern', 'Chrom', 'Weiden', 'Falken'];
const SYL_B = ['wald', 'furt', 'hafen', 'brück', 'heim', 'stein', 'tal', 'hall', 'burg', 'grund', 'feld', 'wacht', 'tor', 'quell'];
const REALM_A = ['Var', 'El', 'Thar', 'Ny', 'Kor', 'Ae', 'Zan', 'Mor', 'Ili', 'Dra', 'Sev', 'Ost'];
const REALM_B = ['ion', 'dor', 'heim', 'ra', 'vik', 'thal', 'kor', 'esse', 'mark', 'yr', 'ane', 'gard'];

const pick = <T>(rnd: () => number, a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const GOOD = new Set<B>([B.Grassland, B.Forest, B.Savanna, B.Beach, B.Tundra, B.Desert, B.CrystalGrove, B.ScrapWastes, B.Jungle, B.Snow]);

export class WorldMeta {
  readonly realms: Realm[] = [];
  /** Erzrivale je Reich (symmetrische Paare, M15) */
  readonly rivals: number[] = [];
  readonly settlements: Settlement[] = [];
  readonly obelisks: Poi[] = [];
  readonly ruins: Ruin[] = [];
  private readonly ruinIndex = new Map<string, Ruin>();
  readonly lore: Lore;
  private readonly warp: Simplex2;
  private readonly buildingIndex = new Map<string, Building>();
  private readonly obeliskIndex = new Map<string, Poi>();

  constructor(private readonly t: Terrain) {
    const rnd = mulberry32(t.seed ^ 0x3e7a);
    this.warp = new Simplex2(t.seed ^ 0x51a7);
    this.placeRealms(rnd);
    this.pairRivals();
    this.placeSettlements(rnd);
    this.placeObelisks(rnd);
    this.placeRuins(rnd);
    this.lore = generateLore(t.seed, this);
  }

  private isGood(tx: number, ty: number, r = 1): boolean {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!GOOD.has(this.t.biomeAt(tx + dx * 2, ty + dy * 2))) return false;
    return true;
  }

  private landPoint(rnd: () => number, cx = WORLD_TILES / 2, cy = WORLD_TILES / 2, spread = WORLD_TILES * 0.36): { tx: number; ty: number } | null {
    for (let i = 0; i < 400; i++) {
      const tx = Math.round(cx + (rnd() * 2 - 1) * spread);
      const ty = Math.round(cy + (rnd() * 2 - 1) * spread);
      if (tx < 40 || ty < 40 || tx >= WORLD_TILES - 40 || ty >= WORLD_TILES - 40) continue;
      if (this.isGood(tx, ty, 1)) return { tx, ty };
    }
    return null;
  }

  private placeRealms(rnd: () => number): void {
    const factions: Faction[] = ['mages', 'techno', 'clan', 'traders', 'order', rnd() < 0.5 ? 'techno' : 'mages'];
    for (let i = 0; i < 6; i++) {
      let best: { tx: number; ty: number } | null = null;
      let bestD = -1;
      // Best-Candidate-Sampling für gut verteilte Reichszentren
      for (let k = 0; k < 12; k++) {
        const p = this.landPoint(rnd);
        if (!p) continue;
        const d = Math.min(1e9, ...this.realms.map((r) => Math.hypot(r.tx - p.tx, r.ty - p.ty)));
        if (d > bestD) {
          bestD = d;
          best = p;
        }
      }
      const p = best ?? { tx: WORLD_TILES / 2, ty: WORLD_TILES / 2 };
      const faction = factions[i];
      let base = `${pick(rnd, REALM_A)}${pick(rnd, REALM_B)}`;
      for (let k = 0; k < 10 && this.realms.some((r) => r.name.startsWith(base)); k++) base = `${pick(rnd, REALM_A)}${pick(rnd, REALM_B)}`;
      const name = faction === 'techno' ? `${base}-${pick(rnd, ['Kor', 'Prime', 'Null', 'IX'])}` : base;
      this.realms.push({ id: i, name, faction, color: REALM_COLORS[i], tx: p.tx, ty: p.ty, capital: -1 });
    }
  }

  /** Aktuelle Macht je Reich (aus der Simulation, M10); gewichtet die Grenzen. */
  powers: number[] | null = null;

  /** Reiche paarweise verfeinden (eigener Zufallsstrom, damit die übrige Welt gleich bleibt). */
  private pairRivals(): void {
    const rnd = mulberry32(this.t.seed ^ 0x77ab);
    const ids = this.realms.map((r) => r.id).sort(() => rnd() - 0.5);
    for (let i = 0; i + 1 < ids.length; i += 2) {
      this.rivals[ids[i]] = ids[i + 1];
      this.rivals[ids[i + 1]] = ids[i];
    }
  }

  /** Reich einer Kachel (nächstes Zentrum, nach Macht gewichtet, Grenzen verwirbelt). */
  realmAt(tx: number, ty: number): Realm {
    const wx = tx + this.warp.noise(tx / 180, ty / 180) * 70;
    const wy = ty + this.warp.noise(tx / 180 + 40, ty / 180 - 40) * 70;
    let best = this.realms[0];
    let bd = Infinity;
    for (const r of this.realms) {
      const p = this.powers?.[r.id] ?? 1;
      const d = ((r.tx - wx) ** 2 + (r.ty - wy) ** 2) / (p * p);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  private placeSettlements(rnd: () => number): void {
    const add = (realm: Realm, tx: number, ty: number, capital: boolean) => {
      if (this.settlements.some((s) => Math.hypot(s.tx - tx, s.ty - ty) < 40)) return;
      let name = `${pick(rnd, SYL_A)}${pick(rnd, SYL_B)}`;
      for (let k = 0; k < 10 && this.settlements.some((o) => o.name === name); k++) name = `${pick(rnd, SYL_A)}${pick(rnd, SYL_B)}`;
      const s: Settlement = {
        id: this.settlements.length,
        name,
        realm: realm.id,
        capital,
        tx,
        ty,
        radius: capital ? 10 : 7,
        buildings: [],
      };
      this.layout(s, realm, rnd);
      this.settlements.push(s);
      if (capital) realm.capital = s.id;
    };
    for (const r of this.realms) {
      add(r, r.tx, r.ty, true);
      const villages = 2 + Math.floor(rnd() * 3);
      for (let v = 0; v < villages; v++) {
        const p = this.landPoint(rnd, r.tx, r.ty, 260);
        if (p && this.realmAt(p.tx, p.ty).id === r.id) add(r, p.tx, p.ty, false);
      }
    }
  }

  /** Gebäude um den Platz verteilen (Ring-Raster), nur auf begehbarem Land. */
  private layout(s: Settlement, realm: Realm, rnd: () => number): void {
    const style = FACTIONS[realm.faction].style;
    const kinds: BuildingKind[] = style === 'cyber' ? ['neonhouse', 'neonhouse', 'tower', 'house'] : style === 'mixed' ? ['house', 'neonhouse', 'house', 'tower'] : ['house', 'house', 'tower', 'house'];
    s.buildings.push({ kind: 'well', tx: s.tx, ty: s.ty, variant: style === 'cyber' ? 1 : 0 });
    s.buildings.push({ kind: 'stall', tx: s.tx + 3, ty: s.ty + 2, variant: Math.floor(rnd() * 4) });
    // Zweiter Durchgang mit lockereren Regeln, falls das Gelände eng ist
    for (let pass = 0; pass < 2 && s.buildings.length < 7; pass++) {
      for (let gy = -s.radius; gy <= s.radius; gy += 4) {
        for (let gx = -s.radius; gx <= s.radius; gx += 4) {
          const d = Math.hypot(gx, gy);
          if (d < 4.5 || d > s.radius) continue;
          if (pass === 0 && rnd() < 0.25) continue;
          const tx = s.tx + gx + (pass === 0 ? Math.floor(rnd() * 2) : 0);
          const ty = s.ty + gy;
          if (s.buildings.some((b) => Math.abs(b.tx - tx) < 3 && Math.abs(b.ty - ty) < 3)) continue;
          if (!this.isGood(tx, ty, pass === 0 ? 1 : 0)) continue;
          s.buildings.push({ kind: pick(rnd, kinds), tx, ty, variant: Math.floor(rnd() * 4) });
        }
      }
    }
    for (const b of s.buildings) this.buildingIndex.set(`${b.tx},${b.ty}`, b);
  }

  private placeObelisks(rnd: () => number): void {
    for (let i = 0; i < OBELISKS; i++) {
      const r = this.realms[i % this.realms.length];
      for (let k = 0; k < 40; k++) {
        const p = this.landPoint(rnd, r.tx, r.ty, 320);
        if (!p) continue;
        if (this.settlementNear(p.tx, p.ty, 25)) continue;
        if (this.obelisks.some((o) => Math.hypot(o.tx - p.tx, o.ty - p.ty) < 60)) continue;
        const o: Poi = { id: `ob${i}`, kind: 'obelisk', tx: p.tx, ty: p.ty, fragment: i };
        this.obelisks.push(o);
        this.obeliskIndex.set(`${p.tx},${p.ty}`, o);
        break;
      }
    }
  }

  /** Drei Ruinen je Reich, abseits von Orten und Obelisken (M14). */
  private placeRuins(rnd: () => number): void {
    for (const r of this.realms) {
      for (let n = 0; n < 3; n++) {
        for (let k = 0; k < 40; k++) {
          const p = this.landPoint(rnd, r.tx, r.ty, 340);
          if (!p || this.settlementNear(p.tx, p.ty, 30)) continue;
          if (this.obelisks.some((o) => Math.hypot(o.tx - p.tx, o.ty - p.ty) < 25)) continue;
          if (this.ruins.some((o) => Math.hypot(o.tx - p.tx, o.ty - p.ty) < 80)) continue;
          if (!this.isGood(p.tx + 2, p.ty + 1, 0)) continue;
          const ruin: Ruin = { id: this.ruins.length, tx: p.tx, ty: p.ty, realm: r.id };
          this.ruins.push(ruin);
          this.ruinIndex.set(`${p.tx},${p.ty}`, ruin);
          break;
        }
      }
    }
  }

  ruinAt(tx: number, ty: number): Ruin | undefined {
    return this.ruinIndex.get(`${tx},${ty}`);
  }

  ruinNear(tx: number, ty: number, radius: number): Ruin | null {
    for (const r of this.ruins) if (Math.abs(r.tx - tx) <= radius && Math.abs(r.ty - ty) <= radius) return r;
    return null;
  }

  /** Siedlung, in deren Umkreis (+ Rand) die Kachel liegt. */
  settlementNear(tx: number, ty: number, margin = 0): Settlement | null {
    for (const s of this.settlements) if (Math.hypot(s.tx - tx, s.ty - ty) <= s.radius + margin) return s;
    return null;
  }

  /** Gepflasterter Platz (Ortsmitte und Wege). */
  isPlaza(tx: number, ty: number): boolean {
    for (const s of this.settlements) {
      const dx = tx - s.tx;
      const dy = ty - s.ty;
      if (dx * dx + dy * dy <= 9) return true;
      // Kreuzweg durch den Ort
      if ((Math.abs(dx) <= 0 && Math.abs(dy) <= s.radius) || (Math.abs(dy) <= 0 && Math.abs(dx) <= s.radius)) return true;
    }
    return false;
  }

  buildingAt(tx: number, ty: number): Building | undefined {
    return this.buildingIndex.get(`${tx},${ty}`);
  }

  /** Truhe, Schrein oder Obelisk auf einer Kachel. */
  poiAt(tx: number, ty: number): Poi | null {
    const o = this.obeliskIndex.get(`${tx},${ty}`);
    if (o) return o;
    const r = this.ruinIndex.get(`${tx - 2},${ty - 1}`);
    if (r) return { id: `ruinchest:${tx},${ty}`, kind: 'ruinchest', tx, ty };
    const cx = Math.floor(tx / CHUNK_TILES);
    const cy = Math.floor(ty / CHUNK_TILES);
    const p = this.chunkPoi(cx, cy);
    return p && p.tx === tx && p.ty === ty ? p : null;
  }

  /** Höchstens ein zufälliges Geheimnis pro Chunk (Truhe 5 %, Schrein 2 %). */
  chunkPoi(cx: number, cy: number): Poi | null {
    const rnd = mulberry32(hash2(this.t.seed, cx, cy, 1313));
    const roll = rnd();
    const kind: PoiKind | null = roll < 0.05 ? 'chest' : roll < 0.07 ? 'shrine' : null;
    if (!kind) return null;
    const tx = cx * CHUNK_TILES + 2 + Math.floor(rnd() * (CHUNK_TILES - 4));
    const ty = cy * CHUNK_TILES + 2 + Math.floor(rnd() * (CHUNK_TILES - 4));
    if (!BIOMES[this.t.biomeAt(tx, ty)].walkable || this.settlementNear(tx, ty, 3)) return null;
    return { id: `${kind}:${tx},${ty}`, kind, tx, ty };
  }
}

// ---------------------------------------------------------------- Chronik

export interface Lore {
  worldName: string;
  fragments: { title: string; text: string }[];
}

const EVENTS = [
  { nom: 'der Sternfall', dat: 'dem Sternfall', text: 'Ein Stern stürzte vom Himmel und zerbrach in tausend leuchtende Kristalle.' },
  { nom: 'die Große Stille', dat: 'der Großen Stille', text: 'Eines Morgens verstummten alle Winde, und aus der Stille wuchsen Kristalle aus dem Boden.' },
  { nom: 'die Spaltung', dat: 'der Spaltung', text: 'Ein Riss ging durch den Himmel, und aus ihm fiel Metall, das niemand geschmiedet hatte.' },
  { nom: 'die Lichterflut', dat: 'der Lichterflut', text: 'Eine Welle aus Licht rollte über das Land und weckte die Kristalle in der Erde.' },
];
const cap1 = (s: string) => s[0].toUpperCase() + s.slice(1);
const ARTIFACTS = [
  { nom: 'das Herz von {world}', acc: 'das Herz von {world}' },
  { nom: 'die Krone aus Glas', acc: 'die Krone aus Glas' },
  { nom: 'der Erste Kern', acc: 'den Ersten Kern' },
  { nom: 'das Sternenauge', acc: 'das Sternenauge' },
  { nom: 'die Runenmaschine', acc: 'die Runenmaschine' },
];
const THREATS = ['der Schatten unter den Gipfeln', 'der Hungernde Schwarm', 'die Rostkönigin', 'das Echo des Sterns', 'der Leere Wanderer'];

/** Seed-basierte Weltgeschichte in acht Fragmenten. */
export function generateLore(seed: number, meta: { realms: Realm[]; settlements: Settlement[]; rivals?: number[] }): Lore {
  const rnd = mulberry32(seed ^ 0x10de);
  const worldName = `${pick(rnd, ['Ael', 'Myr', 'Cal', 'Ther', 'Vey', 'Or'])}${pick(rnd, ['theron', 'dris', 'avon', 'ensia', 'galoth', 'umbra'])}`;
  const ev = pick(rnd, EVENTS);
  const art = pick(rnd, ARTIFACTS);
  const artifact = art.nom.replace('{world}', worldName);
  const artAcc = art.acc.replace('{world}', worldName);
  const threat = pick(rnd, THREATS);
  const age = 200 + Math.floor(rnd() * 800);
  const shuffled = [...meta.realms].sort(() => rnd() - 0.5);
  // Der Krieg der Chronik ist der Streit eines Rivalenpaares (M15)
  const r1 = shuffled[0];
  const r2 = meta.rivals?.[r1.id] !== undefined ? meta.realms[meta.rivals[r1.id]] : shuffled[1];
  const cap = (r: Realm) => meta.settlements[r.capital]?.name ?? r.name;
  const f = (r: Realm) => FACTIONS[r.faction].the;
  return {
    worldName,
    fragments: [
      { title: 'I. Die Zeit davor', text: `Vor ${age} Jahren war ${worldName} ein stilles Land aus Wäldern und Wind. Niemand kannte Magie, niemand kannte Maschinen.` },
      { title: `II. ${cap1(ev.nom)}`, text: `${ev.text} Die Alten nennen es ${ev.nom}.` },
      { title: 'III. Die Splitter', text: 'Die Kristalle trugen Kraft in sich. Die einen sangen Zauber in sie hinein, die anderen bauten Maschinen um sie herum.' },
      { title: `IV. ${cap1(artifact)}`, text: `Aus dem größten Splitter schufen die ersten Gelehrten ${artAcc}. Wer es hielt, konnte Zauber und Maschine zugleich beherrschen.` },
      { title: 'V. Der Bruch', text: `Um ${artAcc} entbrannte Streit. ${cap1(f(r1))} von ${r1.name} und ${f(r2)} von ${r2.name} führten Krieg, bis ${artifact} verloren ging.` },
      { title: 'VI. Die Reiche', text: `Aus der Asche erhoben sich sechs Reiche. ${cap(r1)} und ${cap(r2)} wurden ihre stolzesten Städte – und blieben Rivalen.` },
      { title: `VII. ${cap1(threat)}`, text: `Doch mit ${ev.dat} war noch etwas gekommen, das nur geschlafen hatte: ${threat}. Die Irrlichter und Drohnen sind seine Vorboten.` },
      { title: 'VIII. Die Hoffnung', text: `Es heißt, wer alle Obelisken liest, findet ${artAcc} – und kann ${threat} ein zweites Mal bannen.` },
    ],
  };
}
