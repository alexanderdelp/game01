/** Seuchenzeit: Jahrzehnte, in denen Seuchen um ein Vielfaches häufiger sind. */
import type { WorldEventDef } from './types';

export const plagueage: WorldEventDef = {
  id: 'plagueage',
  label: 'Seuchenzeit',
  summary: 'Über Jahrzehnte wüten Seuchen achtmal so oft; Orte schrumpfen, kleine werden verlassen.',
  details: [0, 1, 2],
  duration: [30, 90],
  repeat: true,
  mods: { plague: 8, growth: 0.7 },
  text(_h, e) {
    if (e.n === 1) return 'Die Seuchenzeit ging zu Ende. Die Überlebenden zählten ihre Toten.';
    return 'Die Seuchenzeit begann: Ein Fieber zog von Stadt zu Stadt, und kein Heiler wusste Rat.';
  },
};
