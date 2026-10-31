/** Mindestanzeigedauer eines Banners (Feedback: 2,5 s waren zu kurz). */
export const BANNER_MS = 5000;

export interface BannerItem {
  title: string;
  sub: string;
  small?: boolean;
  /** Einstiegshinweis: bleibt, bis man klickt oder losläuft. */
  sticky?: boolean;
}

/**
 * Warteschlange für eingeblendete Texte: ein Banner nach dem anderen, jedes mindestens BANNER_MS lang.
 * Rein (ohne Phaser), damit die Regeln per Unit-Test prüfbar sind.
 */
export class BannerQueue {
  private queue: BannerItem[] = [];
  current: BannerItem | null = null;
  private shownAt = 0;
  private moved = false;
  private clicked = false;

  push(item: BannerItem): void {
    if (this.current?.title === item.title || this.queue.some((q) => q.title === item.title)) return;
    this.queue.push(item);
  }

  /** Der Spieler ist gelaufen (beendet Hinweise nach der Mindestdauer). */
  noteMoved(): void {
    this.moved = true;
  }

  /** Der Spieler hat geklickt (beendet Hinweise sofort). */
  noteClicked(): void {
    this.clicked = true;
  }

  get pending(): number {
    return this.queue.length;
  }

  /**
   * Schritt zur Zeit `now` (ms). Liefert 'show' mit dem neuen Banner, 'hide', wenn das aktuelle endet
   * und nichts wartet, sonst null.
   */
  step(now: number): { show: BannerItem } | 'hide' | null {
    if (this.current && !this.done(now)) return null;
    const next = this.queue.shift();
    if (next) {
      this.current = next;
      this.shownAt = now;
      this.moved = this.clicked = false;
      return { show: next };
    }
    if (this.current) {
      this.current = null;
      return 'hide';
    }
    return null;
  }

  private done(now: number): boolean {
    const c = this.current!;
    const long = now - this.shownAt >= BANNER_MS;
    if (c.sticky) return this.clicked || (long && this.moved);
    return long;
  }
}
