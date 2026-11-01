/** Gerüchte der NPCs über nahe historische Orte, Figuren und verlorene Artefakte. Rein. */
import { BEASTS } from './names';
import { eventText, plainLinker, siteEvents } from './narrate';
import type { History, Site } from './types';

const DIRS = ['im Osten', 'im Südosten', 'im Süden', 'im Südwesten', 'im Westen', 'im Nordwesten', 'im Norden', 'im Nordosten'];

/** Himmelsrichtung und grobe Entfernung, z. B. „einige Wegstunden im Nordosten“. */
export function whereFrom(fromX: number, fromY: number, s: { tx: number; ty: number }): string {
  const dx = s.tx - fromX;
  const dy = s.ty - fromY;
  const d = Math.hypot(dx, dy);
  const dir = DIRS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
  return `${d < 150 ? 'ganz in der Nähe' : d < 450 ? 'nicht weit' : d < 900 ? 'einige Wegstunden' : 'weit'} ${dir}`;
}

/** Orte, über die man reden kann: Fundorte, Ruinen mit Schatz, Horte lebender Bestien. */
function interesting(h: History, s: Site): boolean {
  return s.arts.length > 0 || s.kind === 'tomb' || s.kind === 'battlefield' || s.kind === 'crater' || (s.kind === 'lair' && h.figures[s.beast ?? -1]?.died === undefined) || s.destroyed !== undefined;
}

/** Ein Gerücht für eine Position (deterministisch über `salt`), oder null, wenn nichts in Reichweite liegt. */
export function rumorAt(h: History, tx: number, ty: number, salt: number, range = 1400): string | null {
  const near = h.sites.filter((s) => interesting(h, s) && Math.hypot(s.tx - tx, s.ty - ty) < range && Math.hypot(s.tx - tx, s.ty - ty) > 30)
    .sort((a, b) => b.arts.length - a.arts.length || Math.hypot(a.tx - tx, a.ty - ty) - Math.hypot(b.tx - tx, b.ty - ty))
    .slice(0, 6);
  if (!near.length) return null;
  const s = near[Math.abs(salt) % near.length];
  const where = whereFrom(tx, ty, s);
  const L = plainLinker(h);
  if (s.arts.length) {
    const a = h.artifacts[s.arts[0]];
    return `Man erzählt sich, dass »${a.name}« noch in ${s.name} liegt – ${where}. Wer es findet, dem gehört es.`;
  }
  if (s.kind === 'lair' && s.beast !== undefined) {
    const b = h.figures[s.beast];
    const k = BEASTS[b.beastKind ?? 0];
    return `Hütet euch vor ${b.name}! ${k.art === 'die' ? 'Die' : 'Der'} ${k.kind} haust ${where}, beim ${s.name}.`;
  }
  const ev = siteEvents(h, s, 1)[0];
  const story = ev ? eventText(h, ev, L) : '';
  if (s.kind === 'tomb') return `${where[0].toUpperCase()}${where.slice(1)} steht ${s.name}. ${s.buried.length ? `Dort ruht ${h.figures[s.buried[0]].name}.` : ''}`;
  if (s.destroyed !== undefined) return `${where[0].toUpperCase()}${where.slice(1)} liegen die Ruinen von ${s.name}. ${story}`;
  return `${where[0].toUpperCase()}${where.slice(1)} liegt ${s.name}. ${story}`;
}
