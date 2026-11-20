/**
 * Oberweite (M30): prozedurale Verformung des Brustbereichs auf den LPC-Ebenen (ohne Phaser, testbar).
 *
 * Jedes Animationsbild wird mit derselben Verschiebung verformt („Schiebe-Verformung“: Pixel um einen Mittelpunkt
 * werden nach außen geschoben, nach außen weich auslaufend) – auf dem Körper und allen Oberteilen gleich, damit die
 * Kleidung ohne Lücken oder Versatz passt. Wo die Brust im Bild sitzt, ergibt sich aus der Lage des Kopfes gegenüber
 * dem Stand-Bild der jeweiligen Richtung (Geh-Bild 0): Der Kopf ist in allen LPC-Animationen starr und unverdeckt
 * (eigene Ebene), die Arme dagegen überdecken den Rumpf.
 */
import { FRAME } from './lpc';

/** Ebenen, die mit verformt werden: Körper und alles, was den Oberkörper bedeckt. */
export function bustWarps(dir: string): boolean {
  return dir.startsWith('body/bodies/') || dir.startsWith('torso/') || dir.startsWith('arms/');
}

interface Push {
  /** Mittelpunkt im Stand-Bild der Richtung (Pixel im 64er-Bild) */
  x: number;
  y: number;
  /** Verschiebung je Stufe (Pixel) */
  dx: number;
  dy: number;
  /** Halbachsen des Einflussbereichs (nach oben länger: die Brust steigt flach an und endet unten rund) */
  rx: number;
  up: number;
  down: number;
}

/** Verschiebungen je Richtung (Reihen: oben, links, unten, rechts), gemessen an Geh-Bild 0 des weiblichen Körpers. */
const PUSHES: Push[][] = [
  // hinten: kaum sichtbar, nur die Seiten etwas voller
  [
    { x: 24.5, y: 40, dx: -0.4, dy: 0.15, rx: 4, up: 5, down: 4 },
    { x: 39.5, y: 40, dx: 0.4, dy: 0.15, rx: 4, up: 5, down: 4 },
  ],
  // links
  [{ x: 23, y: 40.5, dx: -1.3, dy: 0.4, rx: 7, up: 7, down: 4.5 }],
  // vorn: beide Seiten nach außen und unten
  [
    { x: 28.5, y: 41.5, dx: -0.5, dy: 0.7, rx: 5, up: 5, down: 4 },
    { x: 35.5, y: 41.5, dx: 0.5, dy: 0.7, rx: 5, up: 5, down: 4 },
  ],
  // rechts
  [{ x: 41, y: 40.5, dx: 1.3, dy: 0.4, rx: 7, up: 7, down: 4.5 }],
];

/** Verschiebungsfeld eines Bildes: für jedes Zielpixel das Quellpixel (−1 = unverändert). */
export type WarpMap = Int16Array;

/**
 * Baut die Abbildung für ein 64er-Bild: Zielpixel → Quellpixel (Index im Bild). `off` ist die Lage des Kopfes
 * gegenüber dem Stand-Bild der Richtung.
 */
export function bustMap(row: number, level: number, off: { x: number; y: number }): WarpMap {
  const map = new Int16Array(FRAME * FRAME).fill(-1);
  const pushes = PUSHES[row] ?? [];
  for (let y = 0; y < FRAME; y++) {
    for (let x = 0; x < FRAME; x++) {
      let sx = x + 0.5;
      let sy = y + 0.5;
      for (const p of pushes) {
        const ry = y + 0.5 < p.y + off.y ? p.up : p.down;
        const u = ((x + 0.5 - p.x - off.x) / p.rx) ** 2 + ((y + 0.5 - p.y - off.y) / ry) ** 2;
        if (u >= 1) continue;
        const w = (1 - u) ** 2;
        sx -= p.dx * level * w;
        sy -= p.dy * level * w;
      }
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      if (ix === x && iy === y) continue;
      map[y * FRAME + x] = ix >= 0 && iy >= 0 && ix < FRAME && iy < FRAME ? iy * FRAME + ix : -2;
    }
  }
  return map;
}

/**
 * Wendet die Abbildung auf ein Bild (Spalte `fx`, Zeile `fy`) eines Spritesheets (Breite `w`) an. Neu entstandene
 * Ränder der Ebene bekommen ihre Umrissfarbe (dunkelste Randfarbe), damit die Silhouette geschlossen bleibt.
 */
export function applyWarp(px: Uint8ClampedArray, w: number, fx: number, fy: number, map: WarpMap): void {
  const x0 = fx * FRAME;
  const y0 = fy * FRAME;
  const at = (i: number) => ((y0 + Math.floor(i / FRAME)) * w + x0 + (i % FRAME)) * 4;
  const src = new Uint8ClampedArray(FRAME * FRAME * 4);
  for (let y = 0; y < FRAME; y++) src.set(px.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + FRAME) * 4), y * FRAME * 4);
  const edge = (a: (i: number) => number, i: number) => {
    if (!a(i)) return false;
    const x = i % FRAME;
    const y = Math.floor(i / FRAME);
    return (x > 0 && !a(i - 1)) || (x < FRAME - 1 && !a(i + 1)) || (y > 0 && !a(i - FRAME)) || (y < FRAME - 1 && !a(i + FRAME));
  };
  const srcA = (i: number) => src[i * 4 + 3];
  // Umrissfarbe: dunkelster deckender Randpixel der Ebene in diesem Bild
  let outline = -1;
  let dark = Infinity;
  for (let i = 0; i < FRAME * FRAME; i++) {
    if (srcA(i) < 255 || !edge(srcA, i)) continue;
    const l = src[i * 4] * 3 + src[i * 4 + 1] * 6 + src[i * 4 + 2];
    if (l < dark) {
      dark = l;
      outline = i;
    }
  }
  for (let i = 0; i < map.length; i++) {
    const s = map[i];
    if (s === -1) continue;
    const d = at(i);
    if (s < 0) px.fill(0, d, d + 4);
    else px.set(src.subarray(s * 4, s * 4 + 4), d);
  }
  if (outline < 0) return;
  const dstA = (i: number) => px[at(i) + 3];
  const fix: number[] = [];
  for (let i = 0; i < map.length; i++) {
    // nur im verformten Bereich (und direkt daneben)
    if (map[i] === -1 && map[i - 1] === -1 && map[i + 1] === -1 && map[i - FRAME] === -1 && map[i + FRAME] === -1) continue;
    if (edge(dstA, i) && !edge(srcA, i)) fix.push(i);
  }
  for (const i of fix) px.set(src.subarray(outline * 4, outline * 4 + 4), at(i));
}

const SEARCH = 6;

/**
 * Lage des Kopfes in einem Bild gegenüber dem Stand-Bild derselben Richtung (beide 64×64-RGBA der Kopf-Ebene): die
 * Verschiebung, bei der beide am besten deckungsgleich sind. `null`, wenn kein Kopf passt oder die Figur sich weit
 * aus der Haltung bewegt (Sterben) – dann bleibt das Bild unverformt.
 */
export function headOffset(ref: Uint8ClampedArray, frame: Uint8ClampedArray): { x: number; y: number } | null {
  const opaque: number[] = [];
  for (let i = 0; i < FRAME * FRAME; i++) if (ref[i * 4 + 3]) opaque.push(i);
  let frameCount = 0;
  for (let i = 3; i < frame.length; i += 4) if (frame[i]) frameCount++;
  if (!opaque.length || !frameCount) return null;
  let best = Infinity;
  let bx = 0;
  let by = 0;
  for (let oy = -SEARCH; oy <= SEARCH; oy++) {
    for (let ox = -SEARCH; ox <= SEARCH; ox++) {
      // Fehler: Kopfpixel ohne Gegenstück, Farbunterschied, übrige Pixel des Bildes
      let err = 0;
      let matched = 0;
      for (const i of opaque) {
        const fx = (i % FRAME) + ox;
        const fy = Math.floor(i / FRAME) + oy;
        const f = (fy * FRAME + fx) * 4;
        if (fx < 0 || fy < 0 || fx >= FRAME || fy >= FRAME || !frame[f + 3]) {
          err += 3;
          continue;
        }
        matched++;
        const r = i * 4;
        err += (Math.abs(ref[r] - frame[f]) + Math.abs(ref[r + 1] - frame[f + 1]) + Math.abs(ref[r + 2] - frame[f + 2])) / 255;
      }
      err += 3 * (frameCount - matched);
      // Bei Gleichstand die kleinere Verschiebung
      if (err < best || (err === best && Math.abs(ox) + Math.abs(oy) < Math.abs(bx) + Math.abs(by))) {
        best = err;
        bx = ox;
        by = oy;
      }
    }
  }
  return best / opaque.length < 0.5 && Math.abs(by) <= 3 && Math.abs(bx) <= 5 ? { x: bx, y: by } : null;
}

/** Schneidet ein 64er-Bild aus einem Spritesheet. */
export function frameAt(px: Uint8ClampedArray, w: number, fx: number, fy: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(FRAME * FRAME * 4);
  for (let y = 0; y < FRAME; y++) out.set(px.subarray(((fy * FRAME + y) * w + fx * FRAME) * 4, ((fy * FRAME + y) * w + fx * FRAME + FRAME) * 4), y * FRAME * 4);
  return out;
}

/**
 * Abbildungen für alle Bilder einer Animation, aus der Kopf-Ebene dieser Animation (`head`) und dem Geh-Bogen der
 * Kopf-Ebene (`walk`, Stand-Bild je Richtung). Bei Animationen mit nur einer Zeile (Treffer) gilt die Richtung unten.
 */
export function bustMaps(level: number, head: Uint8ClampedArray, w: number, frames: number, rows: number, walk: Uint8ClampedArray, walkW: number): (WarpMap | null)[][] {
  const out: (WarpMap | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    const dirRow = rows === 1 ? 2 : r;
    const ref = frameAt(walk, walkW, 0, dirRow);
    out.push(
      Array.from({ length: frames }, (_, f) => {
        const off = headOffset(ref, frameAt(head, w, f, r));
        return off ? bustMap(dirRow, level, off) : null;
      }),
    );
  }
  return out;
}
