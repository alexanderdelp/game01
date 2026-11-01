/**
 * Adapter Vorgeschichte → Spielwelt (`WorldMeta`): Der Endzustand der Geschichte bestimmt Reiche, Hauptstädte, Dörfer,
 * Ruinen, Grabmäler, Schlachtfelder, Horte, Obelisken und die Chronik. Rein.
 */
import type { Lore, MetaSource } from '../world/meta';
import { eventText, figureText, plainLinker } from './narrate';
import { territory } from './query';
import { HISTORY_CELL, HISTORY_GRID, INHABITED, type HEvent, type History, type Site } from './types';

/** So viele Reiche kennt das Spiel. */
export const GAME_REALMS = 6;

const living = (s: Site) => INHABITED.has(s.kind) && s.destroyed === undefined;
const ownerOf = (s: Site) => s.owners[s.owners.length - 1].civ;

export function metaSourceFrom(h: History): MetaSource {
  // Die sechs größten lebenden Reiche werden die Reiche des Spiels
  const size = new Map<number, number>();
  for (const s of h.sites) if (living(s)) size.set(ownerOf(s), (size.get(ownerOf(s)) ?? 0) + 1);
  const top = h.civs.filter((c) => c.fell === undefined && (size.get(c.id) ?? 0) > 0)
    .sort((a, b) => (size.get(b.id) ?? 0) - (size.get(a.id) ?? 0) || a.id - b.id)
    .slice(0, GAME_REALMS);
  const realmOf = new Map(top.map((c, i) => [c.id, i]));
  const realms = top.map((c, i) => {
    const cap = h.sites[c.capital];
    return { id: i, name: c.name, faction: c.faction, color: c.color, tx: cap.tx, ty: cap.ty };
  });

  // Grenzen: Gebiet am Ende; was zu keinem der sechs gehört, fällt an das nächste Reich
  const N = HISTORY_GRID;
  const own = territory(h, h.years);
  const anchors = h.sites.filter((s) => living(s) && realmOf.has(ownerOf(s)));
  const grid = new Int8Array(N * N);
  for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
    const o = own[cy * N + cx];
    let r = realmOf.get(o);
    if (r === undefined) {
      let bd = Infinity;
      const x = (cx + 0.5) * HISTORY_CELL;
      const y = (cy + 0.5) * HISTORY_CELL;
      for (const s of anchors) {
        const d = (s.tx - x) ** 2 + (s.ty - y) ** 2;
        if (d < bd) {
          bd = d;
          r = realmOf.get(ownerOf(s));
        }
      }
    }
    grid[cy * N + cx] = r ?? 0;
  }
  const realmAtTile = (tx: number, ty: number) => grid[Math.floor(ty / HISTORY_CELL) * N + Math.floor(tx / HISTORY_CELL)];

  // Rivalen: die verfeindetsten Paare
  const pairs: { a: number; b: number; o: number }[] = [];
  for (let a = 0; a < top.length; a++) for (let b = a + 1; b < top.length; b++) pairs.push({ a, b, o: top[a].opinion[top[b].id] ?? 0 });
  pairs.sort((x, y) => x.o - y.o);
  const rivals: number[] = [];
  for (const p of pairs) if (rivals[p.a] === undefined && rivals[p.b] === undefined) {
    rivals[p.a] = p.b;
    rivals[p.b] = p.a;
  }

  const settlements = h.sites.filter(living).map((s) => {
    const civ = ownerOf(s);
    const realm = realmOf.get(civ) ?? realmAtTile(s.tx, s.ty);
    return { name: s.name, realm, capital: realmOf.has(civ) && h.civs[civ].capital === s.id, tx: s.tx, ty: s.ty, site: s.id };
  });
  // Ruinen (mit Wächter und Schatz): zerstörte Orte, Relikte der Vorzeit, der Splitterkrater
  const ruins = h.sites.filter((s) => s.destroyed !== undefined || s.kind === 'crater').map((s) => ({ tx: s.tx, ty: s.ty, realm: realmAtTile(s.tx, s.ty), site: s.id }));
  const kinds = { tomb: 'tomb', battlefield: 'memorial', lair: 'lair' } as const;
  const pois = h.sites.filter((s) => s.kind in kinds).map((s) => ({ kind: kinds[s.kind as keyof typeof kinds], tx: s.tx, ty: s.ty, site: s.id }));
  const { lore, anchors: obelisks } = chronicle(h, top.map((c) => c.id), rivals.map((r) => top[r]?.id ?? -1));
  return { realms, rivals, settlements, ruins, obelisks, lore, rivers: h.rivers, pois, realmGrid: { grid, size: N, cell: HISTORY_CELL } };
}

/** Die Chronik der Obelisken aus echten Ereignissen – mit Ankern in der Nähe der Schauplätze. */
function chronicle(h: History, realms: number[], rivalOf: number[]): { lore: Lore; anchors: { tx: number; ty: number }[] } {
  const L = plainLinker(h);
  const t = (e?: HEvent) => (e ? eventText(h, e, L) : '');
  const pos = (id?: number) => (id !== undefined && h.sites[id] ? { tx: h.sites[id].tx, ty: h.sites[id].ty } : { tx: h.sites[0].tx, ty: h.sites[0].ty });
  const frags: { title: string; text: string; at: { tx: number; ty: number } }[] = [];
  const pre = h.events.find((e) => e.k === 'prehistory');
  const founds = h.events.filter((e) => e.k === 'civ_found');
  frags.push({ title: 'I. Die Zeit davor', text: `${t(pre)} Dann erwachten die Völker: ${founds.map((e) => h.civs[e.civs[0]].name).join(', ')}.`, at: pos(pre?.sites[0] ?? founds[0]?.sites[0]) });
  const oldest = founds.find((e) => h.civs[e.civs[0]].fell === undefined) ?? founds[0];
  frags.push({ title: 'II. Die Ersten Reiche', text: t(oldest), at: pos(oldest?.sites[0]) });
  // Der größte Krieg: das Paar mit den meisten Schlachten
  const count = new Map<string, HEvent[]>();
  for (const e of h.events) if (e.k === 'battle') {
    const key = [...e.civs].sort((a, b) => a - b).join(',');
    count.set(key, [...(count.get(key) ?? []), e]);
  }
  const war = [...count.values()].sort((a, b) => b.length - a.length)[0];
  if (war) {
    const big = [...war].sort((a, b) => (b.n ?? 0) - (a.n ?? 0))[0];
    frags.push({ title: 'III. Der Lange Krieg', text: `${h.civs[war[0].civs[0]].name} und ${h.civs[war[0].civs[1]].name} schlugen ${war.length} Schlachten zwischen den Jahren ${war[0].y} und ${war[war.length - 1].y}. Die blutigste: ${t(big)}`, at: pos(big.sites[0]) });
  } else frags.push({ title: 'III. Der Frieden', text: 'Lange Zeit herrschte Frieden zwischen den Reichen.', at: pos(founds[1]?.sites[0]) });
  const made = h.events.find((e) => e.k === 'artifact_made' && h.artifacts[e.arts[0]]?.great);
  frags.push({ title: `IV. ${h.artifacts.find((a) => a.great)?.name ?? 'Das Herz'}`, text: t(made) || 'Die Gelehrten suchten den größten Splitter.', at: pos(made?.sites[0]) });
  const sh = h.events.find((e) => e.k === 'shattering');
  frags.push({ title: `V. Die Zersplitterung (Jahr ${h.shattering})`, text: t(sh), at: pos(sh?.sites[0]) });
  const beast = h.figures.filter((f) => f.race === 'beast').sort((a, b) => b.kills - a.kills || b.events.length - a.events.length)[0];
  frags.push({ title: `VI. ${beast?.name ?? 'Die Bestien'}`, text: beast ? `${t(h.events[beast.events[0]])} ${figureText(h, beast, L)}` : 'Ungeheuer erwachten in der Wildnis.', at: pos(beast?.lair) });
  const hero = h.figures.filter((f) => f.role === 'hero').sort((a, b) => b.kills - a.kills || b.events.length - a.events.length)[0];
  frags.push({ title: `VII. ${hero?.name ?? 'Die Helden'}`, text: hero ? figureText(h, hero, L) : 'Helden standen auf.', at: pos(hero?.deathSite ?? h.civs[hero?.civ ?? 0]?.capital) });
  const great = h.artifacts.find((a) => a.great);
  const r1 = realms[0];
  const r2 = rivalOf[0];
  frags.push({
    title: 'VIII. Heute',
    text: `Heute herrschen ${realms.map((r) => h.civs[r].name).join(', ')}.${r2 >= 0 ? ` ${h.civs[r1].name} und ${h.civs[r2].name} bleiben erbitterte Rivalen.` : ''} ${great?.site !== undefined ? `Es heißt, ${great.name} liege noch im ${h.sites[great.site].name}.` : ''}`,
    at: pos(h.civs[r1].capital),
  });
  return { lore: { worldName: h.worldName, fragments: frags.map(({ title, text }) => ({ title, text })) }, anchors: frags.map((f) => f.at) };
}
