/**
 * Fester Sichtausschnitt (M27): Wie weit man sieht, hängt nicht von Fenstergröße, Auflösung oder Browser-Zoom ab.
 * Der Weltausschnitt ist höchstens VIEW_LONG × VIEW_SHORT Kacheln groß (lange × kurze Bildschirmseite); größere
 * Fenster werden hochskaliert statt mehr zu zeigen. Rein, ohne Phaser.
 */
export const VIEW_LONG = 32;
export const VIEW_SHORT = 18;

/** Kleinster erlaubter Kamera-Zoom für eine Bildschirmgröße (ganzzahlig, damit Pixel-Art scharf bleibt). */
export function minZoom(width: number, height: number, tilePx: number): number {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const need = Math.max(long / (VIEW_LONG * tilePx), short / (VIEW_SHORT * tilePx));
  return Math.max(1, Math.ceil(need - 1e-9));
}

/** Tatsächlicher Zoom: die gewählte Stufe, aber nie weiter draußen als der feste Ausschnitt erlaubt. */
export function effectiveZoom(chosen: number, width: number, height: number, tilePx: number): number {
  return Math.max(chosen, minZoom(width, height, tilePx));
}
