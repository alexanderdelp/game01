/**
 * Erzählte Texte zur Vorgeschichte (Deutsch, Satzvorlagen). Die Daten bleiben klein; Texte entstehen erst hier.
 * Ein `Linker` macht aus Bezügen Text (Spiel: nur Namen) oder Verweise (Legenden-Modus: Links).
 */
import { FACTIONS } from '../world/meta';
import { loreYear } from './knowledge';
import { ARTIFACT_KINDS, BEASTS } from './names';
import { worldEventDef } from './worldEvents';
import { RACE_NAMES, type Artifact, type Civ, type Figure, type HEvent, type History, type Site, type SiteKind } from './types';

export interface Linker {
  civ(id: number): string;
  fig(id: number): string;
  site(id: number): string;
  art(id: number): string;
}

/** Linker für reinen Text (Spiel). */
export function plainLinker(h: History): Linker {
  return {
    civ: (id) => h.civs[id]?.name ?? 'niemand',
    fig: (id) => h.figures[id]?.name ?? 'jemand',
    site: (id) => h.sites[id]?.name ?? 'irgendwo',
    art: (id) => (h.artifacts[id] ? `»${h.artifacts[id].name}«` : 'ein Artefakt'),
  };
}

export const SITE_KIND: Record<SiteKind, string> = {
  city: 'Stadt', village: 'Dorf', fortress: 'Festung', tower: 'Magierturm', lab: 'Labor', temple: 'Tempel', mine: 'Mine',
  tomb: 'Grabmal', battlefield: 'Schlachtfeld', lair: 'Hort', crater: 'Splitterkrater', relic: 'Relikt der Ersten Maschinen',
};
/** Gründe, aus denen ein Ort verlassen wurde (`abandon.cause`). Neue Gründe hier ergänzen. */
const ABANDON: Record<string, string> = {
  plague: 'wurde nach der Seuche verlassen', famine: 'wurde nach der Hungersnot verlassen', iceage: 'wurde vom Eis verschlungen und verlassen',
  starfall: 'wurde vom Splitterfall ausgelöscht', machinewar: 'wurde von den Kriegsmaschinen ausgelöscht', migration: 'wurde beim großen Auszug verlassen',
  decline: 'verfiel im Bürgerkrieg',
};
const SITE_ART: Record<SiteKind, string> = {
  city: 'die Stadt', village: 'das Dorf', fortress: 'die Festung', tower: 'den Turm', lab: 'das Labor', temple: 'den Tempel', mine: 'die Mine',
  tomb: 'das Grabmal', battlefield: 'das Schlachtfeld', lair: 'den Hort', crater: 'den Krater', relic: 'das Relikt',
};

export const ROLE: Record<Figure['role'], [string, string]> = {
  ruler: ['Herrscher', 'Herrscherin'], hero: ['Held', 'Heldin'], mage: ['Erzmagier', 'Erzmagierin'], engineer: ['Ingenieur', 'Ingenieurin'],
  traitor: ['Verräter', 'Verräterin'], beast: ['Bestie', 'Bestie'], priest: ['Hohepriester', 'Hohepriesterin'],
};

export function yearText(y: number): string {
  return y < 0 ? 'Vorzeit' : `Jahr ${y}`;
}

export function roleName(f: Figure): string {
  if (f.race === 'beast') return BEASTS[f.beastKind ?? 0].kind;
  if (f.offices.length && f.role !== 'hero') return ROLE.ruler[f.female ? 1 : 0];
  if (f.role === 'ruler') return f.female ? 'Adelige' : 'Adeliger';
  return ROLE[f.role][f.female ? 1 : 0];
}

export function raceName(f: Figure): string {
  return f.race === 'beast' ? 'Großbestie' : RACE_NAMES[f.race].one;
}

/** „der Aschewurm Vargrimm“ bzw. Name der Person. */
function beastLabel(h: History, id: number, L: Linker, cap = false): string {
  const f = h.figures[id];
  if (!f || f.race !== 'beast') return L.fig(id);
  const b = BEASTS[f.beastKind ?? 0];
  const art = cap ? b.art[0].toUpperCase() + b.art.slice(1) : b.art;
  return `${art} ${b.kind} ${L.fig(id)}`;
}

/** Ort mit passender Präposition: „im Grabmal bei X“, „auf dem Schlachtfeld von X“, „in Borzul“. */
function inSite(h: History, id: number, L: Linker): string {
  const s = h.sites[id];
  if (!s) return 'irgendwo';
  const prep: Partial<Record<SiteKind, string>> = { tomb: 'im', battlefield: 'auf dem', lair: 'im', crater: 'im', tower: 'im', temple: 'im', relic: 'im', fortress: 'in der', mine: 'in der' };
  const p = s.kind === 'lab' ? (s.name.startsWith('Labor') ? 'im' : 'in') : prep[s.kind] ?? 'in';
  return `${p} ${L.site(id)}`;
}

export const listText = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} und ${a[a.length - 1]}`);

/** Ein Ereignis als Satz. */
export function eventText(h: History, e: HEvent, L: Linker): string {
  const [c0, c1] = e.civs;
  const [f0, f1] = e.figs;
  const [s0, s1] = e.sites;
  const f = (id?: number) => (id === undefined ? 'jemand' : beastLabel(h, id, L));
  const F = (id?: number) => (id === undefined ? 'Jemand' : beastLabel(h, id, L, true));
  const at = (id: number) => inSite(h, id, L);
  const fem = (id?: number) => (id !== undefined && h.figures[id]?.female ? 'in' : '');
  switch (e.k) {
    case 'prehistory':
      return `In der Vorzeit gingen die Ersten Maschinen unter. Ihre Relikte – ${listText(e.sites.map(L.site))} – rosten seither in der Schrottödnis.`;
    case 'civ_found':
      return `Die ${RACE_NAMES[h.civs[c0].race].many} um ${L.fig(f0)} gründeten das Reich ${L.civ(c0)} (${FACTIONS[h.civs[c0].faction].name}) mit der Hauptstadt ${L.site(s0)}.`;
    case 'awaken':
      return `${s1 !== undefined ? `In den Relikten von ${L.site(s1)}` : 'In der Schrottödnis'} erwachten die Synths. ${L.fig(f0)} rief das Reich ${L.civ(c0)} aus, mit dem Knoten ${L.site(s0)}.`;
    case 'site_found': {
      const s = h.sites[s0];
      if (e.cause === 'great') return `${L.fig(f0)} und ${L.fig(f1)} errichteten ${L.site(s0)} über der reichsten Splitter-Ader von ${h.worldName}.`;
      if (f0 !== undefined) return `${L.fig(f0)} errichtete für ${L.civ(c0)} ${SITE_ART[s.kind]} ${L.site(s0)}.`;
      const on = e.cause === 'ruin' && e.sites[2] !== undefined ? ` auf den Ruinen von ${L.site(e.sites[2])}` : '';
      return `${L.civ(c0)} gründete ${SITE_ART[s.kind]} ${L.site(s0)}${on}${s1 !== undefined ? `, aufgebrochen von ${L.site(s1)}` : ''}.`;
    }
    case 'ruler':
      return `${L.fig(f0)} wurde Herrscher${fem(f0)} von ${L.civ(c0)}${f1 !== undefined ? ` und folgte ${L.fig(f1)}` : ''}.`;
    case 'birth':
      return `${L.fig(f0)} wurde geboren, Kind von ${L.fig(f1)}.`;
    case 'hero_rise':
      return `${L.fig(f0)} trat ${at(s0)} als Held${fem(f0)} von ${L.civ(c0)} hervor.`;
    case 'death': {
      const who = F(f0);
      const by = f1 !== undefined ? ` durch ${f(f1)}` : '';
      const where = s0 !== undefined ? ` ${at(s0)}` : '';
      switch (e.cause) {
        case 'age': return h.figures[f0].race === 'synth' ? `${who} schaltete sich nach langem Dienst ab.` : h.figures[f0].race === 'beast' ? `${who} verendete in hohem Alter.` : `${who} starb hochbetagt.`;
        case 'battle': return `${who} fiel in der Schlacht${where}${by}.`;
        case 'beast': return `${who} wurde von ${f(f1)} getötet.`;
        case 'slain': return `${who} wurde${where}${by} erschlagen.`;
        case 'plague': return `${who} erlag der Seuche.`;
        case 'shattering': return `${who} verging in der Zersplitterung${where}.`;
        case 'cataclysm': return `${who} kam in einer Katastrophe um${where}.`;
        default: return `${who} wurde ermordet${by}.`;
      }
    }
    case 'burial':
      return `${L.fig(f0)} wurde ${at(s0)} beigesetzt${e.arts.length ? `, als Grabbeigabe ${listText(e.arts.map(L.art))}` : ''}.`;
    case 'war':
      return `${L.civ(c0)} erklärte ${L.civ(c1)} den Krieg – ${e.cause === 'shard' ? 'es ging um die Splitter-Adern an der Grenze' : 'es ging um Land an der Grenze'}.`;
    case 'peace':
      return `${L.civ(c0)} und ${L.civ(c1)} schlossen nach ${e.n ?? 0} Jahren Krieg Frieden${e.win !== undefined && e.win >= 0 ? `; ${L.civ(e.win)} ging gestärkt daraus hervor` : ''}.`;
    case 'alliance':
      return `${L.civ(c0)} und ${L.civ(c1)} schlossen ein Bündnis.`;
    case 'battle': {
      const lead = e.figs.length ? ` Es führten ${listText(e.figs.map((x) => L.fig(x)))}.` : '';
      return `Schlacht ${at(s0)}: ${L.civ(c0)} gegen ${L.civ(c1)}, etwa ${e.n ?? 0} Tote.${lead} ${e.win !== undefined ? `${L.civ(e.win)} siegte.` : ''}`;
    }
    case 'conquest':
      return `${L.civ(c0)} eroberte ${L.site(s0)} von ${L.civ(c1)}.`;
    case 'raze':
      return `${L.civ(c0)} zerstörte ${L.site(s0)} (${L.civ(c1)}). Nur Ruinen blieben.`;
    case 'betrayal':
      return `${L.fig(f0)} verriet ${L.site(s0)} an ${L.civ(c1)} und öffnete die Tore.`;
    case 'split': {
      const why = e.cause === 'decline' ? 'Im Bürgerkrieg' : e.cause === 'darkage' ? 'Im Zerfall des Dunklen Zeitalters' : '';
      return `${why ? `${why} sagte sich ${L.civ(c0)}` : `${L.civ(c0)} sagte sich`} von ${L.civ(c1)} los: ${e.n ?? 0} Orte folgten ${L.fig(f0)} nach ${L.site(s0)}.`;
    }
    case 'civ_fall':
      return `Das Reich ${L.civ(c0)} ging unter.`;
    case 'plague':
      return `Eine Seuche suchte ${L.civ(c0)} heim (${listText(e.sites.map(L.site))}). Etwa ${e.n ?? 0} starben.`;
    case 'famine':
      return `Hungersnot in ${L.civ(c0)} (${listText(e.sites.map(L.site))}). Etwa ${e.n ?? 0} starben.`;
    case 'abandon':
      return `${L.site(s0)} ${ABANDON[e.cause ?? 'plague'] ?? 'wurde verlassen'}.`;
    case 'beast_arrive':
      return `${F(f0)} hauste fortan ${at(s0)}.`;
    case 'beast_raid':
      return `${F(f0)} überfiel ${L.site(s0)}${f1 !== undefined ? ` und tötete ${L.fig(f1)}` : ''}.`;
    case 'beast_slain':
      return `${L.fig(f0)} erschlug ${f(f1)} ${at(s0)}.`;
    case 'hero_falls':
      return `${L.fig(f0)} zog gegen ${f(f1)} und kehrte nie zurück.`;
    case 'artifact_made':
      if (h.artifacts[e.arts[0]]?.great) return `${L.fig(f0)} und ${L.fig(f1)} schufen ${at(s0)} ${L.art(e.arts[0])}: den größten Splitter, gebändigt in einem Kern aus Rune und Maschine.`;
      return `${L.fig(f0)} schuf ${L.art(e.arts[0])} (${ARTIFACT_KINDS[h.artifacts[e.arts[0]].kind]}).`;
    case 'artifact_lost': {
      const how = e.cause === 'hoard' ? `liegt seither ${at(s0)}` : e.cause === 'shattering' || e.cause === 'sunk' ? `versank ${at(s0)}` : e.cause === 'ruin' ? `wurde ${at(s0)} verschüttet` : `blieb ${at(s0)} liegen`;
      return `${L.art(e.arts[0])} ${how}${f0 !== undefined ? `, verloren mit ${L.fig(f0)}` : ''}.`;
    }
    case 'artifact_loot':
      return `${L.fig(f0)} erbeutete ${L.art(e.arts[0])}${f1 !== undefined ? ` von ${L.fig(f1)}` : ''}${s0 !== undefined ? ` ${at(s0)}` : ''}.`;
    case 'trade':
      return `Händler aus ${L.civ(c0)} eröffneten einen Handelsweg zwischen ${L.site(s0)} und ${L.site(s1)} (${L.civ(c1)}).`;
    case 'world': {
      const def = e.cause ? worldEventDef(e.cause) : undefined;
      return def ? def.text(h, e, L, h.worldRuns.find((r) => r.events.includes(e.id))) : 'Ein Weltereignis.';
    }
    case 'migrate':
      return `Die Völkerwanderung: ${L.civ(c0)} verließ ${L.site(s1)} und die alte Heimat. Etwa ${e.n ?? 0} zogen weit fort und gründeten ${L.site(s0)}.`;
    case 'sunk':
      return `${L.site(s0)} versank in der Großen Flut.`;
    case 'walls':
      return `${L.site(s0)} erhielt einen Mauerring.`;
    case 'shattering': {
      const great = h.artifacts.find((a) => a.great);
      return `Die Zersplitterung: ${L.fig(f0)} und ${L.fig(f1)} versuchten, ${great ? L.art(great.id) : 'den größten Splitter'} zu entfesseln. Der Splitter zerbarst und riss ${L.site(s0)} in die Erde. ${e.n ? `${e.n} Orte wurden zerstört.` : ''} Seither ist ${h.worldName} zersplittert – Magie und Maschine sind untrennbar verwoben.`;
    }
  }
}

/**
 * Linker für die Überlieferung: Verschollenes wird nicht beim Namen genannt.
 * (Was heute noch besteht, kennt jeder; Untergegangenes nur, wenn es überliefert ist.)
 */
export function loreLinker(h: History, L: Linker): Linker {
  const k = h.knowledge;
  return {
    civ: (id) => (k.civ[id] === 0 ? 'ein vergessenes Reich' : L.civ(id)),
    fig: (id) => (k.fig[id] === 0 ? 'jemand, dessen Name vergessen ist' : L.fig(id)),
    site: (id) => (k.site[id] === 0 ? 'ein Ort, dessen Name vergessen ist' : L.site(id)),
    art: (id) => (k.art[id] === 0 && h.artifacts[id]?.lost ? `${L.art(id)} (verschollen)` : L.art(id)),
  };
}

/** Ein Ereignis so, wie es überliefert ist (Sagen übertreiben Zahlen). Verschollene Ereignisse liefern null. */
export function loreText(h: History, e: HEvent, L: Linker): string | null {
  const lore = h.knowledge.ev[e.id] ?? 3;
  if (lore === 0) return null;
  const told = lore === 1 && e.n !== undefined ? { ...e, n: Math.round(e.n * (3 + (e.id % 4))) } : e;
  const t = eventText(h, told, loreLinker(h, L));
  return lore === 1 ? `Der Sage nach: ${t}` : t;
}

/** Jahr eines Ereignisses, genau oder überliefert. */
export function eventYear(h: History, e: HEvent, lore: boolean): string {
  return lore ? loreYear(h, e.y, h.knowledge.ev[e.id] ?? 3) : yearText(e.y);
}

/** Kurze Lebensbeschreibung. */
export function figureText(h: History, f: Figure, L: Linker): string {
  const life = `${f.born}–${f.died ?? 'heute'}`;
  const parts = [`${raceName(f)}, ${roleName(f)} (${life}).`];
  if (f.civ >= 0) parts.push(`Gehörte zu ${L.civ(f.civ)}.`);
  for (const o of f.offices) parts.push(`Herrschte über ${L.civ(o.civ)} von ${o.from} bis ${o.to ?? 'heute'}.`);
  if (f.parent !== undefined) parts.push(`Kind von ${L.fig(f.parent)}.`);
  if (f.kills) parts.push(`Tötete ${f.kills === 1 ? 'einen Gegner' : `${f.kills} Gegner`}.`);
  if (f.died !== undefined) {
    const e = h.events.find((x) => x.k === 'death' && x.figs[0] === f.id);
    if (e) parts.push(eventText(h, e, L));
  } else parts.push(f.race === 'beast' ? 'Haust noch heute in seinem Hort.' : 'Lebt noch.');
  return parts.join(' ');
}

export function siteText(h: History, s: Site, L: Linker): string {
  const parts: string[] = [];
  const founder = s.owners[0].civ;
  if (s.kind === 'relic') parts.push('Ein Relikt der Ersten Maschinen aus der Vorzeit.');
  else if (founder >= 0) parts.push(`${SITE_KIND[s.kind]}, gegründet im Jahr ${s.founded} von ${L.civ(founder)}.`);
  else parts.push(`${SITE_KIND[s.kind]} seit dem Jahr ${s.founded}.`);
  for (const o of s.owners.slice(1)) parts.push(`Ab ${o.y} im Besitz von ${L.civ(o.civ)}.`);
  if (s.destroyed !== undefined && s.fall !== undefined) parts.push(`Untergang: ${eventText(h, h.events[s.fall], L)}`);
  if (s.buried.length) parts.push(`Hier ruhen ${listText(s.buried.map(L.fig))}.`);
  if (s.beast !== undefined) parts.push(`Hort von ${beastLabel(h, s.beast, L)}${h.figures[s.beast].died === undefined ? ', die Bestie lebt noch' : ''}.`);
  if (s.arts.length) parts.push(`Hier liegt verloren: ${listText(s.arts.map(L.art))}.`);
  return parts.join(' ');
}

export function civText(_h: History, c: Civ, L: Linker): string {
  const parts = [`${FACTIONS[c.faction].name} der ${RACE_NAMES[c.race].many}, gegründet im Jahr ${c.founded}.`];
  if (c.parent !== undefined) parts.push(`Abgespalten von ${L.civ(c.parent)}.`);
  parts.push(`Hauptstadt: ${L.site(c.capital)}.`);
  if (c.fell !== undefined) parts.push(`Untergegangen im Jahr ${c.fell}.`);
  return parts.join(' ');
}

export function artifactText(_h: History, a: Artifact, L: Linker): string {
  const parts = [`${ARTIFACT_KINDS[a.kind]}, geschaffen im Jahr ${a.made} von ${L.fig(a.maker)}.`];
  const how = { made: 'geschaffen', gift: 'geschenkt', inherit: 'geerbt', loot: 'erbeutet', found: 'gefunden' } as const;
  if (a.holders.length > 1) parts.push(`Besitzer: ${a.holders.slice(1).map((x) => `${L.fig(x.fig)} (${x.y}, ${how[x.how]})`).join(', ')}.`);
  if (a.site !== undefined) {
    const lost = { buried: 'als Grabbeigabe in', battle: 'verloren auf', hoard: 'gehortet in', ruin: 'verschüttet in', shattering: 'versunken in', sunk: 'versunken in' } as const;
    parts.push(`Heute ${a.lost ? lost[a.lost.how] : 'in'} ${L.site(a.site)} – wartet darauf, gefunden zu werden.`);
  } else if (a.heldBy !== undefined) parts.push(`Heute im Besitz von ${L.fig(a.heldBy)}.`);
  return parts.join(' ');
}

/** Kurzfassung eines Ortes für das Spiel (Inschrift, Spielleiter-Karte). */
export function siteStory(h: History, s: Site): string {
  const L = plainLinker(h);
  const evs = siteEvents(h, s, 3).filter((e) => e.id !== s.fall).map((e) => `${yearText(e.y)}: ${eventText(h, e, L)}`);
  return [siteText(h, s, L), ...evs].join(' ');
}

/** Die wichtigsten Ereignisse eines Ortes (für Inschriften). */
export function siteEvents(h: History, s: Site, max = 3): HEvent[] {
  const rank: Partial<Record<HEvent['k'], number>> = { shattering: 9, raze: 8, battle: 6, burial: 7, beast_slain: 7, hero_falls: 6, conquest: 5, beast_arrive: 5, civ_found: 6, abandon: 5, betrayal: 6, artifact_lost: 7 };
  return [...s.events.map((i) => h.events[i])].sort((a, b) => (rank[b.k] ?? 1) - (rank[a.k] ?? 1) || a.y - b.y).slice(0, max).sort((a, b) => a.y - b.y);
}
