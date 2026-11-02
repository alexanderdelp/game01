/** Zeitalter in absoluten Jahren (0 = Beginn, `end` = Gegenwart) und Schritte variabler Länge. Rein. */
import type { EpochConfig, HistoryConfig } from './config';

export interface Epoch extends EpochConfig {
  index: number;
  /** erstes Jahr (einschließlich) */
  from: number;
  /** letztes Jahr (ausschließlich) */
  to: number;
}

export interface Timeline {
  epochs: Epoch[];
  /** Jahr der Gegenwart */
  end: number;
}

export function timelineOf(c: HistoryConfig): Timeline {
  let y = 0;
  const epochs = c.epochs.map((e, index) => {
    const ep: Epoch = { ...e, index, from: y, to: y + e.years };
    y += e.years;
    return ep;
  });
  return { epochs, end: y };
}

export function epochAt(t: Timeline, y: number): Epoch {
  for (const e of t.epochs) if (y < e.to) return e;
  return t.epochs[t.epochs.length - 1];
}

/** Alle Schritte: Jahr am Ende des Schritts und Schrittlänge. Der letzte Schritt endet genau in der Gegenwart. */
export function* steps(t: Timeline): Generator<{ y: number; dt: number; epoch: Epoch }> {
  for (const e of t.epochs) {
    for (let y = e.from; y < e.to; ) {
      const dt = Math.min(e.step, e.to - y);
      y += dt;
      yield { y, dt, epoch: e };
    }
  }
}

/** „vor 4.320 Jahren“ – Abstand zur Gegenwart. */
export function agoText(t: Timeline, y: number): string {
  const d = t.end - y;
  if (d <= 0) return 'heute';
  return d === 1 ? 'vor einem Jahr' : `vor ${d.toLocaleString('de-DE')} Jahren`;
}
