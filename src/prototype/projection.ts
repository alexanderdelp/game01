/**
 * Perspektivische Projektion einer gekippten Bodenebene (Prototyp, ohne Phaser).
 *
 * Die Kamera schaut ohne Drehung nach Norden und ist um `tilt` aus der Senkrechten gekippt (0° = heutige Draufsicht).
 * Sie zielt auf den Zielpunkt (Fußpunkt des Helden) und steht so weit weg, dass dort `zoom` Bildpixel je Weltpixel
 * herauskommen. Die Brennweite folgt aus dem Blickwinkel `fov` (vertikal): kleiner Winkel = fast parallel, großer
 * Winkel = starke Perspektive. Boden-Shader und Billboards rechnen mit denselben Formeln.
 */
export interface ViewParams {
  /** Neigung in Grad (0 = Draufsicht). */
  tilt: number;
  /** Vertikaler Blickwinkel in Grad. */
  fov: number;
  /** Bildpixel je Weltpixel am Zielpunkt. */
  zoom: number;
  width: number;
  height: number;
  /** Zielpunkt in Weltpixeln */
  tx: number;
  ty: number;
}

export interface Projected {
  sx: number;
  sy: number;
  /** Bildpixel je Weltpixel an diesem Punkt (Größe eines Billboards) */
  scale: number;
}

export class Projection {
  readonly f: number;
  readonly d: number;
  readonly sin: number;
  readonly cos: number;
  /** Bildpunkt des Zielpunkts */
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
    this.cy = v.height * (0.5 + 0.18 * Math.min(1, v.tilt / 60));
  }

  /** Bodenpunkt (Weltpixel) → Bildpunkt; undefined hinter der Kamera. */
  project(x: number, y: number): Projected | undefined {
    const dy = y - this.v.ty;
    const z = this.d - dy * this.sin;
    if (z < 1) return undefined;
    const k = this.f / z;
    return { sx: this.cx + (x - this.v.tx) * k, sy: this.cy + dy * this.cos * k, scale: k };
  }

  /** Bildpunkt → Bodenpunkt (Weltpixel); undefined über dem Horizont. */
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
