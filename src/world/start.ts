import type { WorldGen } from './WorldGen';

/**
 * Startpunkt im Kernmodus (Feedback M32: „man startet in der Pampa“): am Rand des Orts, der dem Weltstart am
 * nächsten liegt, möglichst auf einem Trampelpfad. Pfade verbinden jeden Ort mit seinen zwei nächsten Nachbarn –
 * wer ihnen folgt, kommt zum nächsten Ort, statt vor einem Gebirge zu stehen.
 */
export function townStart(w: WorldGen, spawn: { tx: number; ty: number }): { tx: number; ty: number; town: number } | null {
  const towns = [...w.meta.settlements].sort((a, b) => Math.hypot(a.tx - spawn.tx, a.ty - spawn.ty) - Math.hypot(b.tx - spawn.tx, b.ty - spawn.ty));
  const free = (tx: number, ty: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!w.isWalkable(tx + dx, ty + dy)) return false;
    return true;
  };
  for (const s of towns.slice(0, 3)) {
    let fallback: { tx: number; ty: number } | null = null;
    for (let r = s.radius + 2; r <= s.radius + 14; r++) {
      const steps = Math.max(8, Math.round(2 * Math.PI * r));
      for (let i = 0; i < steps; i++) {
        // Süden zuerst: dann liegt der Ort im Bild über dem Helden
        const a = Math.PI / 2 + (i / steps) * Math.PI * 2;
        const tx = Math.round(s.tx + Math.cos(a) * r);
        const ty = Math.round(s.ty + Math.sin(a) * r);
        if (!free(tx, ty)) continue;
        if (w.meta.isRoad(tx, ty)) return { tx, ty, town: s.id };
        fallback ??= { tx, ty };
      }
    }
    if (fallback) return { ...fallback, town: s.id };
  }
  return null;
}
