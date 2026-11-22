/**
 * Perspektivische Projektion mit Geländehöhe (M33 Laborphase 2), rein und ohne Phaser.
 *
 * Die Kamera blickt ohne Drehung nach Norden, um `tilt` aus der Senkrechten gekippt (0° = Draufsicht). Sie zielt
 * auf den Zielpunkt (Fußpunkt des Helden, auf seiner Höhe) und steht so weit weg, dass dort `zoom` Bildpixel je
 * Weltpixel herauskommen. Die Brennweite folgt aus dem vertikalen Blickwinkel `fov`. Koordinaten: x nach Osten,
 * y nach Süden (Weltpixel), h nach oben (Pixel). Der Boden-Shader rechnet mit denselben Formeln.
 */
export interface ViewParams {
  tilt: number;
  fov: number;
  zoom: number;
  width: number;
  height: number;
  /** Zielpunkt (Weltpixel) und seine Höhe (Pixel) */
  tx: number;
  ty: number;
  th: number;
}

export interface Projected {
  sx: number;
  sy: number;
  /** Bildpixel je Weltpixel an diesem Punkt */
  scale: number;
}

export class Projection {
  readonly f: number;
  readonly d: number;
  readonly sin: number;
  readonly cos: number;
  readonly cx: number;
  readonly cy: number;

  constructor(readonly v: ViewParams) {
    const t = (v.tilt * Math.PI) / 180;
    this.sin = Math.sin(t);
    this.cos = Math.cos(t);
    this.f = v.height / 2 / Math.tan((v.fov * Math.PI) / 360);
    this.d = this.f / v.zoom;
    this.cx = v.width / 2;
    // Je stärker gekippt, desto tiefer steht der Held im Bild (mehr Blick nach vorn)
    this.cy = v.height * (0.5 + 0.15 * Math.min(1, v.tilt / 60));
  }

  /** Kameraposition (Weltpixel, Höhe in Pixeln). */
  get camera(): { x: number; y: number; h: number } {
    return { x: this.v.tx, y: this.v.ty + this.d * this.sin, h: this.v.th + this.d * this.cos };
  }

  /** Weltpunkt → Bildpunkt; undefined hinter der Kamera. */
  project(x: number, y: number, h = this.v.th): Projected | undefined {
    const dy = y - this.v.ty;
    const dh = h - this.v.th;
    const z = this.d - dy * this.sin - dh * this.cos;
    if (z < 1) return undefined;
    const k = this.f / z;
    return { sx: this.cx + (x - this.v.tx) * k, sy: this.cy + (dy * this.cos - dh * this.sin) * k, scale: k };
  }

  /** Bildpunkt → Punkt auf der Ebene in Zielhöhe; undefined über dem Horizont. */
  unproject(sx: number, sy: number): { x: number; y: number } | undefined {
    const px = sx - this.cx;
    const py = sy - this.cy;
    const den = this.f * this.cos + py * this.sin;
    if (den <= 1e-6) return undefined;
    const dy = (py * this.d) / den;
    const z = this.d - dy * this.sin;
    return { x: this.v.tx + (px * z) / this.f, y: this.v.ty + dy };
  }

  /** Bildzeile des Horizonts (kann über dem Bild liegen). */
  get horizon(): number {
    return this.sin < 1e-6 ? -Infinity : this.cy - (this.f * this.cos) / this.sin;
  }
}

/**
 * Verdeckt das Gelände den Punkt (x, y, h) von der Kamera aus? Tastet den Sehstrahl in Bodennähe ab
 * (`heightPx` liefert die Geländehöhe in Pixeln). `margin` Pixel Spielraum, damit Figuren am Hang sichtbar bleiben.
 */
export function occluded(p: Projection, x: number, y: number, h: number, heightPx: (x: number, y: number) => number, margin = 6): boolean {
  const c = p.camera;
  const dx = c.x - x;
  const dy = c.y - y;
  const dh = c.h - h;
  const dist = Math.hypot(dx, dy);
  if (dist < 8) return false;
  const n = Math.min(40, Math.max(4, Math.ceil(dist / 24)));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const rh = h + dh * t;
    const gh = heightPx(x + dx * t, y + dy * t);
    if (gh > rh + margin) return true;
    // Weit über allem Gelände: nichts mehr im Weg
    if (rh > h + 2000) break;
  }
  return false;
}
