import Phaser from 'phaser';
import type { ChunkManager } from '../../render/ChunkManager';
import { CHUNK_PX, TILE_PX } from '../../render/chunkPixels';
import { LEVEL_UNITS } from '../../world/terrain';
import type { WorldGen } from '../../world/WorldGen';
import { LAB_MOOD, LAB_VIEW } from '../labTuning';
import { HF_CELLS, chunkHeights, sampleChunk } from './heightfield';
import { Projection, occluded } from './projection';
import { TerrainRenderer, type TerrainLook } from './terrainRenderer';

type Obj = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Visible & Phaser.GameObjects.Components.Alpha & { scrollFactorX: number };

interface Saved {
  o: Obj;
  x: number;
  y: number;
  sx: number;
  sy: number;
  vis: boolean;
  alpha: number;
}

const FOG: [number, number, number] = [0.66, 0.74, 0.84];
const SKY: [number, number, number] = [0.24, 0.4, 0.68];

/**
 * Perspektive fürs Bewegungslabor (M33 Laborphase 2). Die Spiellogik bleibt in Weltkoordinaten: Nach jedem
 * Update werden alle Weltobjekte der Szene auf den Bildschirm projiziert (auf ihre Geländehöhe gestellt, nach
 * Tiefe skaliert, hinter Bergrücken ausgeblendet), vor dem nächsten Update wieder zurückgesetzt. Der Boden kommt
 * aus `TerrainRenderer` unter dem durchsichtigen Phaser-Canvas; die Phaser-Kamera steht fest (Zoom 1, kein Scroll).
 *
 * Objekte mit `setData('foot', {x, y})` stehen auf diesem Fußpunkt. Grafiken in Weltkoordinaten (Position 0,0, z. B. Lebensbalken, Schnee) werden um den Zielpunkt herum
 * mitskaliert (Näherung). Objekte mit `setData('upright', true)` stehen aufrecht, sonstige Grafiken, Ellipsen
 * (Schatten) und der Schwung-Bogen liegen flach.
 */
export class PerspectiveView {
  readonly renderer: TerrainRenderer;
  proj!: Projection;
  private readonly heights = new Map<string, Float32Array>();
  private readonly maxOf = new Map<string, number>();
  private saved: Saved[] = [];
  private target = { x: 0, y: 0, h: 0 };
  private bounds = { x0: 0, y0: 0, x1: 0, y1: 0 };
  /** Zahl sichtbarer bzw. verdeckter Objekte im letzten Bild (Tests, Anzeige) */
  visible = 0;
  hidden = 0;
  private readonly onPre = () => this.restore();
  private readonly onPost = () => this.project();

  static create(scene: Phaser.Scene, world: WorldGen, chunks: ChunkManager): PerspectiveView | undefined {
    const parent = scene.game.canvas.parentElement!;
    const r = TerrainRenderer.create(parent, CHUNK_PX, HF_CELLS);
    return r && new PerspectiveView(scene, world, chunks, r);
  }

  private constructor(private readonly scene: Phaser.Scene, private readonly world: WorldGen, private readonly chunks: ChunkManager, renderer: TerrainRenderer) {
    this.renderer = renderer;
    const canvas = scene.game.canvas;
    canvas.parentElement!.style.position = 'relative';
    Object.assign(canvas.style, { position: 'relative', zIndex: '1' });
    chunks.onLoad.push((cx, cy) => this.load(cx, cy));
    chunks.onUnload.push((cx, cy) => {
      const k = `${cx},${cy}`;
      this.heights.delete(k);
      this.maxOf.delete(k);
      this.renderer.release(cx, cy);
    });
    const cam = scene.cameras.main;
    cam.stopFollow();
    cam.removeBounds();
    cam.setZoom(1).setScroll(0, 0);
    cam.setBackgroundColor('rgba(0,0,0,0)');
    scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.onPre);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.onPost);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private load(cx: number, cy: number): void {
    const c = this.chunks.chunkData(cx, cy);
    if (!c) return;
    c.ground.setVisible(false);
    const hs = chunkHeights(this.world, cx, cy, c.levels);
    let max = -Infinity;
    for (let i = 0; i < hs.length; i++) if (hs[i] > max) max = hs[i];
    this.heights.set(`${cx},${cy}`, hs);
    this.maxOf.set(`${cx},${cy}`, max);
    this.renderer.upload(cx, cy, this.scene.textures.get(c.key).getSourceImage() as HTMLCanvasElement, hs);
  }

  /** Geländehöhe in Höheneinheiten an einem Weltpixel (aus den geladenen Chunks, sonst 0). */
  unitsAt(x: number, y: number): number {
    const cx = Math.floor(x / CHUNK_PX);
    const cy = Math.floor(y / CHUNK_PX);
    const hs = this.heights.get(`${cx},${cy}`);
    return hs ? sampleChunk(hs, x - cx * CHUNK_PX, y - cy * CHUNK_PX) : 0;
  }

  /** Geländehöhe in Bildpixeln. */
  readonly heightPx = (x: number, y: number): number => this.unitsAt(x, y) * LEVEL_VIEW();

  /** Sichtweite (Weltpixel nach vorn), begrenzt auf das, was die Ringtextur fasst. */
  private get fogEnd(): number {
    return Math.min(LAB_VIEW.sight * TILE_PX, (this.renderer.ringH - 4.2) * CHUNK_PX);
  }

  /**
   * Kamera auf den Zielpunkt (Fuß des Helden) setzen, Chunks laden, Boden zeichnen. Aufruf in jedem Update,
   * bevor die Spiellogik Objekte bewegt hat oder danach – projiziert wird erst nach dem Update.
   */
  frame(x: number, y: number, dt: number): void {
    const h = this.heightPx(x, y - 1);
    const a = 1 - Math.exp(-dt * 10);
    // Kamera folgt weich (auch in der Höhe, sonst ruckelt sie an Stufen)
    if (!this.proj) this.target = { x, y, h };
    else this.target = { x: this.target.x + (x - this.target.x) * a, y: this.target.y + (y - this.target.y) * a, h: this.target.h + (h - this.target.h) * a };
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    this.proj = new Projection({ tilt: LAB_VIEW.tilt, fov: LAB_VIEW.fov, zoom: LAB_MOOD.zoom, width: W, height: H, tx: this.target.x, ty: this.target.y, th: this.target.h });
    const r = this.viewRect();
    this.chunks.update(r);
    this.bounds = { x0: r.x - CHUNK_PX, y0: r.y - CHUNK_PX, x1: r.right + CHUNK_PX, y1: r.bottom + CHUNK_PX };
    let maxUnits = 0;
    for (const m of this.maxOf.values()) maxUnits = Math.max(maxUnits, m);
    this.renderer.pixel = LAB_VIEW.pixel;
    const end = this.fogEnd;
    const look: TerrainLook = { fogStart: end * 0.5, fogEnd: end, fog: FOG, sky: SKY, hScale: LAB_VIEW.hscale, maxUnits, shade: LAB_VIEW.shade, contour: LAB_VIEW.contour, level: LEVEL_UNITS, bounds: this.bounds };
    this.renderer.render(this.proj, look);
  }

  /** Sichtbarer Ausschnitt in Weltkoordinaten (für Schnee u. Ä., Näherung um den Zielpunkt). */
  worldView(): { x: number; y: number; w: number; h: number } {
    const k = this.proj?.project(this.target.x, this.target.y)?.scale ?? LAB_MOOD.zoom;
    const w = this.scene.scale.width / k;
    const h = this.scene.scale.height / k;
    const cx = this.proj?.cx ?? this.scene.scale.width / 2;
    const cy = this.proj?.cy ?? this.scene.scale.height / 2;
    return { x: this.target.x - cx / k, y: this.target.y - cy / k, w, h };
  }

  /**
   * Weltausschnitt zum Laden: Bodenfläche bis zur Sichtweite, begrenzt auf die Ringtextur (ChunkManager lädt
   * 0,5 Chunks Rand und entlädt erst 1 Chunk weiter draußen).
   */
  private viewRect(): Phaser.Geom.Rectangle {
    const p = this.proj;
    const W = p.v.width;
    const H = p.v.height;
    const farY = p.v.ty - this.fogEnd;
    const pts = [p.unproject(0, H), p.unproject(W, H)].filter((q) => !!q) as { x: number; y: number }[];
    const top = Math.max(p.horizon + 2, 0);
    for (const q of [p.unproject(0, top), p.unproject(W, top)]) if (q) pts.push({ x: q.x, y: Math.max(q.y, farY) });
    const zFar = p.d + this.fogEnd * p.sin;
    const half = (W / 2) * (zFar / p.f);
    pts.push({ x: p.v.tx - half, y: farY }, { x: p.v.tx + half, y: farY });
    let x0 = Math.min(...pts.map((q) => q.x));
    let x1 = Math.max(...pts.map((q) => q.x));
    let y0 = Math.min(...pts.map((q) => q.y));
    // Nach Süden etwas Rand: Berge vor der Kamera ragen ins Bild
    const y1 = Math.max(...pts.map((q) => q.y)) + 3 * TILE_PX;
    const maxW = (this.renderer.ringW - 4) * CHUNK_PX;
    const maxH = (this.renderer.ringH - 4) * CHUNK_PX;
    if (x1 - x0 > maxW) {
      x0 = p.v.tx - maxW / 2;
      x1 = p.v.tx + maxW / 2;
    }
    if (y1 - y0 > maxH) y0 = y1 - maxH;
    return new Phaser.Geom.Rectangle(x0, y0, x1 - x0, y1 - y0);
  }

  /** Alle Weltobjekte auf den Bildschirm projizieren (nach dem Update, vor dem Zeichnen). */
  private project(): void {
    if (!this.proj) return;
    const p = this.proj;
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    const end = this.fogEnd;
    const squash = 0.3 + 0.7 * p.cos;
    let visible = 0;
    let hidden = 0;
    for (const go of this.scene.children.list) {
      const o = go as Obj;
      if (o.scrollFactorX === 0 || !o.visible || o.x === undefined) continue;
      this.saved.push({ o, x: o.x, y: o.y, sx: o.scaleX, sy: o.scaleY, vis: o.visible, alpha: o.alpha });
      // Grafiken in Weltkoordinaten (an 0,0) um den Zielpunkt herum
      const atOrigin = o.x === 0 && o.y === 0;
      // Teile eines Objekts (z. B. Schrift auf einem Schild) stehen auf dessen Fußpunkt
      const foot = o.getData?.('foot') as { x: number; y: number } | undefined;
      const ax = foot ? foot.x : atOrigin ? this.target.x : o.x;
      const ay = foot ? foot.y : atOrigin ? this.target.y : o.y;
      const flat = !o.getData?.('upright') && (o.type === 'Ellipse' || (o.type === 'Graphics' && !atOrigin) || (o.type === 'Image' && (o as Phaser.GameObjects.Image).texture.key.startsWith('swing-arc')));
      const h = atOrigin ? this.target.h : this.heightPx(ax, ay - 1);
      const q = p.project(ax, ay, h);
      const fog = smooth(end * 0.5, end, p.v.ty - ay);
      if (!q || fog >= 1 || q.sx < -200 || q.sx > W + 200 || q.sy < -100 || q.sy > H + 300 || (!atOrigin && occluded(p, ax, ay, h + 12, this.heightPx))) {
        o.setVisible(false);
        hidden++;
        continue;
      }
      const k = q.scale;
      o.x = q.sx + (o.x - ax) * k;
      // Weltgrafiken: Bodenebene um den Zielpunkt (Tiefe gestaucht wie der Boden)
      const sy = atOrigin ? p.cos : flat ? squash : 1;
      o.y = q.sy + (o.y - ay) * k * sy;
      o.scaleX *= k;
      o.scaleY *= k * sy;
      if (fog > 0) o.alpha *= 1 - fog * fog;
      visible++;
    }
    this.visible = visible;
    this.hidden = hidden;
  }

  /** Weltkoordinaten wiederherstellen (vor dem nächsten Update). */
  private restore(): void {
    for (const s of this.saved) {
      if (!s.o.scene) continue;
      s.o.x = s.x;
      s.o.y = s.y;
      s.o.scaleX = s.sx;
      s.o.scaleY = s.sy;
      s.o.visible = s.vis;
      s.o.alpha = s.alpha;
    }
    this.saved = [];
  }

  /** Bildpunkt → Weltpunkt auf Höhe des Helden (für Tests). */
  screenOf(x: number, y: number): { sx: number; sy: number } | undefined {
    const q = this.proj?.project(x, y, this.heightPx(x, y - 1));
    return q && { sx: q.sx, sy: q.sy };
  }

  destroy(): void {
    this.restore();
    this.scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.onPre);
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.onPost);
    this.renderer.destroy();
  }
}

/** Höhenmaßstab (Pixel je Einheit) */
const LEVEL_VIEW = () => LAB_VIEW.hscale;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
