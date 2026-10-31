/** Fog of War (M20): welche Teile der Welt der Held schon gesehen hat. Rein, ohne Phaser. */
import { WORLD_TILES } from './WorldGen';

/** Kantenlänge einer Erkundungszelle in Kacheln (= 1 Pixel der Übersichtskarte). */
export const FOG_CELL = 16;
/** Sichtweite in Kacheln, in der beim Laufen aufgedeckt wird. */
export const REVEAL_RADIUS = 20;

export class ExploredMap {
  readonly size = WORLD_TILES / FOG_CELL;
  private readonly bits: Uint8Array;
  /** Zuletzt aufgedeckte Zellen (für schrittweises Nachzeichnen von Karte/Minimap). */
  readonly fresh: number[] = [];
  /** Seit dem letzten Speichern geändert? */
  dirty = false;

  constructor(bits?: Uint8Array) {
    this.bits = bits && bits.length === (this.size * this.size) / 8 ? bits : new Uint8Array((this.size * this.size) / 8);
  }

  isExplored(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.size || cy >= this.size) return false;
    const i = cy * this.size + cx;
    return (this.bits[i >> 3] & (1 << (i & 7))) !== 0;
  }

  /** Ist die Kachel erkundet? */
  knows(tx: number, ty: number): boolean {
    return this.isExplored(Math.floor(tx / FOG_CELL), Math.floor(ty / FOG_CELL));
  }

  /** Deckt alle Zellen im Umkreis `radius` Kacheln um (tx, ty) auf; gibt die Anzahl neuer Zellen zurück. */
  reveal(tx: number, ty: number, radius = REVEAL_RADIUS): number {
    let n = 0;
    const r = radius / FOG_CELL;
    const fx = tx / FOG_CELL;
    const fy = ty / FOG_CELL;
    for (let cy = Math.floor(fy - r); cy <= Math.floor(fy + r); cy++) {
      for (let cx = Math.floor(fx - r); cx <= Math.floor(fx + r); cx++) {
        if (cx < 0 || cy < 0 || cx >= this.size || cy >= this.size || this.isExplored(cx, cy)) continue;
        // nächster Punkt der Zelle zum Mittelpunkt innerhalb des Radius?
        const nx = Math.max(cx, Math.min(fx, cx + 1));
        const ny = Math.max(cy, Math.min(fy, cy + 1));
        if ((nx - fx) ** 2 + (ny - fy) ** 2 > r * r) continue;
        const i = cy * this.size + cx;
        this.bits[i >> 3] |= 1 << (i & 7);
        this.fresh.push(i);
        n++;
      }
    }
    if (n) this.dirty = true;
    return n;
  }

  /**
   * Deckt nur auf, was der Held sieht (M24): eine Zelle im Umkreis `radius`, wenn ihr nächster Punkt oder ihre
   * Mitte sichtbar ist. Die eigene Zelle und die direkte Umgebung (3 Kacheln) immer.
   */
  revealVisible(tx: number, ty: number, sees: (x: number, y: number) => boolean, radius: number): number {
    let n = this.reveal(tx, ty, 3);
    const r = radius / FOG_CELL;
    const fx = tx / FOG_CELL;
    const fy = ty / FOG_CELL;
    for (let cy = Math.floor(fy - r); cy <= Math.floor(fy + r); cy++) {
      for (let cx = Math.floor(fx - r); cx <= Math.floor(fx + r); cx++) {
        if (cx < 0 || cy < 0 || cx >= this.size || cy >= this.size || this.isExplored(cx, cy)) continue;
        const nx = Math.max(cx * FOG_CELL, Math.min(tx, cx * FOG_CELL + FOG_CELL - 1));
        const ny = Math.max(cy * FOG_CELL, Math.min(ty, cy * FOG_CELL + FOG_CELL - 1));
        if (Math.hypot(nx - tx, ny - ty) > radius) continue;
        const mx = cx * FOG_CELL + FOG_CELL / 2;
        const my = cy * FOG_CELL + FOG_CELL / 2;
        if (!sees(nx, ny) && !sees(mx, my)) continue;
        const i = cy * this.size + cx;
        this.bits[i >> 3] |= 1 << (i & 7);
        this.fresh.push(i);
        n++;
      }
    }
    if (n) this.dirty = true;
    return n;
  }

  /** Anteil der erkundeten Zellen (0–1). */
  get fraction(): number {
    let n = 0;
    for (const b of this.bits) for (let k = b; k; k &= k - 1) n++;
    return n / (this.size * this.size);
  }

  /** Kompakte Textform zum Speichern (Base64 der Bits). */
  encode(): string {
    let s = '';
    for (let i = 0; i < this.bits.length; i += 0x8000) s += String.fromCharCode(...this.bits.subarray(i, i + 0x8000));
    return btoa(s);
  }

  static decode(text: string | null | undefined): ExploredMap {
    if (!text) return new ExploredMap();
    try {
      const s = atob(text);
      const bits = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) bits[i] = s.charCodeAt(i);
      return new ExploredMap(bits);
    } catch {
      return new ExploredMap();
    }
  }
}
