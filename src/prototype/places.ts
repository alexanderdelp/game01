/** Startorte für den Perspektive-Prototyp: typische Landschaften in der Nähe des Spielstarts suchen. */
import { B } from '../world/biomes';
import { levelAt } from '../world/terrain';
import type { WorldGen } from '../world/WorldGen';

export type PlaceId = 'start' | 'wald' | 'gebirge' | 'stadt';
export const PLACES: { id: PlaceId; name: string }[] = [
  { id: 'start', name: 'Spielstart' },
  { id: 'wald', name: 'Wald' },
  { id: 'gebirge', name: 'Gebirge (Klippen)' },
  { id: 'stadt', name: 'Stadt' },
];

/** Sucht spiralförmig um (cx, cy) die nächste Kachel, die `good` erfüllt. */
function spiral(cx: number, cy: number, good: (tx: number, ty: number) => boolean, max = 2500, step = 6): { tx: number; ty: number } | undefined {
  if (good(cx, cy)) return { tx: cx, ty: cy };
  for (let r = step; r < max; r += step) {
    const n = Math.max(8, Math.floor((2 * Math.PI * r) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const tx = Math.round(cx + Math.cos(a) * r);
      const ty = Math.round(cy + Math.sin(a) * r);
      if (good(tx, ty)) return { tx, ty };
    }
  }
  return undefined;
}

const free = (w: WorldGen, tx: number, ty: number, r = 1) => {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!w.isWalkable(tx + dx, ty + dy)) return false;
  return true;
};

export function findPlace(w: WorldGen, id: PlaceId): { tx: number; ty: number } {
  const s = w.findSpawn();
  if (id === 'wald') {
    return spiral(s.tx, s.ty, (tx, ty) => w.biomeAt(tx, ty) === B.Forest && w.biomeAt(tx, ty - 8) === B.Forest && w.biomeAt(tx + 6, ty - 4) === B.Forest && free(w, tx, ty)) ?? s;
  }
  if (id === 'gebirge') {
    // Gebirge mit mehreren Stufenwechseln voraus (Norden), damit Felswände im Blick sind
    return spiral(s.tx, s.ty, (tx, ty) => {
      if (w.biomeAt(tx, ty) !== B.Mountain || !free(w, tx, ty)) return false;
      const own = levelAt(w, tx + 0.5, ty + 0.5);
      let steps = 0;
      for (let k = 3; k <= 18; k += 3) if (levelAt(w, tx + 0.5, ty - k + 0.5) !== own) steps++;
      return steps >= 3;
    }, 3000, 8) ?? s;
  }
  if (id === 'stadt') {
    const town = [...w.meta.settlements].sort((a, b) => Math.hypot(a.tx - s.tx, a.ty - s.ty) - Math.hypot(b.tx - s.tx, b.ty - s.ty))[0];
    if (town) return spiral(town.tx, town.ty + Math.round(town.radius * 0.8), (tx, ty) => free(w, tx, ty), 40, 1) ?? { tx: town.tx, ty: town.ty };
  }
  return s;
}
