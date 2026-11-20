/**
 * Orte des Bewegungslabors (M33): feste Testszenen in der echten Welt. Rein, ohne Phaser.
 * Gefunden per Suche nach erreichbaren Schneegipfeln (Breitensuche über begehbare Kacheln, Stufenwechsel nur auf Pfaden).
 */
export interface LabPlace {
  id: string;
  name: string;
  seed: string;
  tx: number;
  ty: number;
  /** Gipfel mit Altar und Schmugglerhöhle in der Nähe */
  summit?: { tx: number; ty: number };
}

const BERG = { tx: 4713, ty: 1051 };

export const PLACES: LabPlace[] = [
  { id: 'berg', name: 'Der Berg – Fuß', seed: 'gipfel', tx: 4825, ty: 1017, summit: BERG },
  { id: 'berg-mitte', name: 'Der Berg – halbe Höhe', seed: 'gipfel', tx: 4770, ty: 1030, summit: BERG },
  { id: 'berg-gipfel', name: 'Der Berg – Gipfel', seed: 'gipfel', tx: 4713, ty: 1054, summit: BERG },
  { id: 'klippen', name: 'Klippen (Gebirge)', seed: 'test', tx: 4092, ty: 4014 },
  { id: 'start', name: 'Startgebiet (Wald, Hügel)', seed: 'test', tx: 4048, ty: 4090 },
];

/** Ort aus `?ort=`: bekannte ID oder `seed,x,y`. */
export function parsePlace(v: string | null | undefined): LabPlace {
  if (v) {
    const known = PLACES.find((p) => p.id === v);
    if (known) return known;
    const m = /^([^,]+),(\d+),(\d+)$/.exec(v.trim());
    if (m) return { id: 'eigen', name: `Eigener Ort ${m[1]} (${m[2]}, ${m[3]})`, seed: m[1], tx: Number(m[2]), ty: Number(m[3]) };
  }
  return PLACES[0];
}
