import Phaser from 'phaser';
import { debugState } from '../debug';
import { TILE_PX } from '../render/chunkPixels';
import type { ChunkRequest, OverviewResult, RegionResult } from '../render/chunkProtocol';
import { AREA_RADIUS, questTarget } from '../quests/quests';
import { worldNow } from '../sim/LiveWorld';
import { caravanPos } from '../sim/simulation';
import { B, BIOMES } from '../world/biomes';
import { WORLD_TILES } from '../world/WorldGen';
import type { WorldScene } from '../scenes/WorldScene';

/** Tiles je Pixel der Übersichtskarte. */
const MAP_STEP = 16;
/** Minimap: Bildschirmpixel je Pixel der Übersichtskarte (1 Pixel = MAP_STEP Kacheln). */
const MINI_ZOOM = 6;
/** Fog of War: unerkundet bzw. Rand zum Erkundeten. */
const FOG_COLOR = '#17131f';
const FOG_EDGE = 'rgba(23, 19, 31, 0.55)';
const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#f4f0e8' };
/** Zoomstufen der Weltkarte. */
const MAP_ZOOMS = [1, 2, 4, 8, 16];

/**
 * Weltkarte (M8, M22) und Minimap (M16) mit Fog of War (M20) in der UI-Szene: Übersicht und feine Ausschnitte
 * aus einem eigenen Worker, Zoomen/Verschieben, Orte, Ruinen, Questziele, Karawanen, Schnellreise.
 */
export class WorldMap {
  private map?: Phaser.GameObjects.Container;
  private marker?: Phaser.GameObjects.Rectangle;
  private mapWorker?: Worker;
  private mapTex = '';
  private mapSize = 0;
  private mini?: Phaser.GameObjects.Image;
  private miniG?: Phaser.GameObjects.Graphics;
  private miniFg?: Phaser.GameObjects.Graphics;
  private miniFog?: Phaser.GameObjects.Image;
  /** Nebel-Textur (1 Pixel = 1 Erkundungszelle = 1 Pixel der Übersichtskarte). */
  private fogTex?: Phaser.Textures.CanvasTexture;
  private fogRefreshAt = 0;
  private fogChanged = false;
  /** Aktuelles Questziel für die Minimap (area = nur ungefähres Gebiet); setzt die UI-Szene. */
  miniTarget: { tx: number; ty: number; area: boolean } | null = null;
  private view = { x: 0, y: 0, side: 1 };
  private mapCenter = { tx: 0, ty: 0 };
  private mapZoomIndex = 0;
  private mapLayer?: Phaser.GameObjects.Container;
  private mapInfo?: Phaser.GameObjects.Text;
  private mapDrag: { x: number; y: number; cx: number; cy: number } | null = null;
  private detail: { x0: number; y0: number; step: number; size: number } | null = null;
  private regionId = 0;
  private regionTimer?: Phaser.Time.TimerEvent;

  /** `topOffset`: Oberkante der Minimap (unter den Handy-Knöpfen). */
  constructor(private readonly ui: Phaser.Scene, private readonly seed: string, private readonly topOffset: () => number) {
    debugState.mapOpen = false;
    debugState.mapReady = false;
    // Übersichtskarte im Hintergrund erzeugen.
    this.ensureMapWorker().postMessage({ type: 'overview', step: MAP_STEP } satisfies ChunkRequest);
    debugState.mapZoomBy = (dir: number) => this.zoomMap(dir);
    // Karte: Ziehen und Mausrad
    this.ui.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.map || !this.mapDrag || !p.isDown) return;
      const k = this.mapK;
      this.mapCenter = { tx: this.mapDrag.cx - (p.x - this.mapDrag.x) / k, ty: this.mapDrag.cy - (p.y - this.mapDrag.y) / k };
      this.layoutMap();
    });
    this.ui.input.on('pointerup', () => (this.mapDrag = null));
    this.ui.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.map && this.zoomMap(dy < 0 ? 1 : -1, { x: p.x, y: p.y }));
    this.ui.input.keyboard!.on('keydown-PLUS', () => this.zoomMap(1));
    this.ui.input.keyboard!.on('keydown-NUMPAD_ADD', () => this.zoomMap(1));
    this.ui.input.keyboard!.on('keydown-MINUS', () => this.zoomMap(-1));
    this.ui.input.keyboard!.on('keydown-NUMPAD_SUBTRACT', () => this.zoomMap(-1));
    this.ui.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.mapWorker?.terminate());
  }

  /** Ist die große Karte offen? */
  get isOpen(): boolean {
    return !!this.map;
  }

  /** Für Tests: benanntes Element der Karte. */
  find(name: string): Phaser.GameObjects.GameObject | null {
    return (this.map?.getByName(name) ?? this.mapLayer?.getByName(name) ?? null) as Phaser.GameObjects.GameObject | null;
  }

  /** Größe der Minimap (Seitenlänge in Pixeln). */
  private miniSide(): number {
    return this.ui.scale.width < 500 ? 104 : 150;
  }

  /** Oberkante der Minimap: unter den Handy-Knöpfen oben rechts. */
  miniTop(): number {
    return this.topOffset();
  }

  miniBottom(): number {
    return this.mini?.visible ? this.miniTop() + this.miniSide() + 4 : this.miniTop() - 6;
  }

  /** Minimap oben rechts: Ausschnitt der Übersichtskarte um den Helden mit Orten, Questziel, Mitspielern. */
  drawMinimap(ws: WorldScene, allowed: boolean): void {
    if (!this.mapSize) return;
    const S = this.miniSide();
    const x0 = this.ui.scale.width - 8 - S;
    const y0 = this.miniTop();
    this.mini ??= this.ui.add.image(0, 0, this.mapTex).setOrigin(0).setDepth(4.1).setScale(MINI_ZOOM);
    this.miniG ??= this.ui.add.graphics().setDepth(4);
    const show = !this.map && allowed;
    this.updateFog(ws);
    this.miniFog ??= this.ui.add.image(0, 0, this.fogKey).setOrigin(0).setDepth(4.15).setScale(MINI_ZOOM);
    this.mini.setVisible(show);
    this.miniFog.setVisible(show);
    this.miniG.clear().setVisible(show);
    debugState.minimap = show;
    this.miniFg?.clear();
    if (!show) return;
    const { tx, ty } = ws.player.tile;
    // linke obere Ecke des Ausschnitts in Pixeln der Übersichtskarte
    const half = S / 2 / MINI_ZOOM;
    const ox = tx / MAP_STEP - half;
    const oy = ty / MAP_STEP - half;
    // Grund (Ozean) unter dem Kartenbild, falls der Ausschnitt über den Weltrand reicht
    this.miniG.fillStyle(0x1c3a66, 1).fillRect(x0, y0, S, S);
    const cx0 = Math.max(0, ox);
    const cy0 = Math.max(0, oy);
    const cw = Math.min(this.mapSize, ox + 2 * half) - cx0;
    const ch = Math.min(this.mapSize, oy + 2 * half) - cy0;
    this.mini.setCrop(cx0, cy0, Math.max(0, cw), Math.max(0, ch)).setPosition(x0 - ox * MINI_ZOOM, y0 - oy * MINI_ZOOM);
    this.miniFog.setCrop(cx0, cy0, Math.max(0, cw), Math.max(0, ch)).setPosition(x0 - ox * MINI_ZOOM, y0 - oy * MINI_ZOOM);
    const fg = (this.miniFg ??= this.ui.add.graphics().setDepth(4.2)).clear().setVisible(true);
    const px = (t: number) => x0 + (t / MAP_STEP - ox) * MINI_ZOOM;
    const py = (t: number) => y0 + (t / MAP_STEP - oy) * MINI_ZOOM;
    const inside = (x: number, y: number, m = 0) => x >= x0 + m && y >= y0 + m && x <= x0 + S - m && y <= y0 + S - m;
    for (const st of ws.world.meta.settlements) {
      const x = px(st.tx);
      const y = py(st.ty);
      if (!inside(x, y, 3) || !ws.fog.knows(st.tx, st.ty)) continue;
      const known = ws.state.d.discovered.has(`town:${st.id}`);
      const sz = st.capital ? 6 : 4;
      fg.fillStyle(known ? 0x2fe0d8 : st.capital ? 0xffd84a : 0xf4f0e8, 1).fillRect(x - sz / 2, y - sz / 2, sz, sz);
      fg.lineStyle(1, 0x0b0b14, 1).strokeRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    for (const car of ws.live.caravans) {
      const p = caravanPos(car, worldNow());
      const x = px(p.tx);
      const y = py(p.ty);
      if (inside(x, y, 2) && ws.fog.knows(p.tx, p.ty)) fg.fillStyle(0xf08a3a, 1).fillTriangle(x, y - 3, x - 3, y + 3, x + 3, y + 3);
    }
    for (const r of ws.remote.remotes.values()) {
      const x = px(r.x / TILE_PX);
      const y = py(r.y / TILE_PX);
      if (inside(x, y, 2)) fg.fillStyle(0x2fe0d8, 1).fillCircle(x, y, 3).lineStyle(1, 0x0b0b14, 1).strokeCircle(x, y, 3);
    }
    const t = this.miniTarget;
    if (t) {
      let x = px(t.tx);
      let y = py(t.ty);
      if (t.area) {
        // Ungefähres Gebiet (Kreis); außerhalb des Ausschnitts am Rand angedeutet
        const r = Math.max(6, (AREA_RADIUS / MAP_STEP) * MINI_ZOOM);
        x = Phaser.Math.Clamp(x, x0 + r + 1, x0 + S - r - 1);
        y = Phaser.Math.Clamp(y, y0 + r + 1, y0 + S - r - 1);
        fg.fillStyle(0xffd84a, 0.25).fillCircle(x, y, r).lineStyle(1, 0xffd84a, 0.9).strokeCircle(x, y, r);
      } else {
        x = Phaser.Math.Clamp(x, x0 + 4, x0 + S - 4);
        y = Phaser.Math.Clamp(y, y0 + 4, y0 + S - 4);
        fg.fillStyle(0xffd84a, 1).fillCircle(x, y, 3.5).lineStyle(1, 0x0b0b14, 1).strokeCircle(x, y, 3.5);
      }
    }
    // Held in der Mitte, Rahmen
    const hx = x0 + S / 2;
    const hy = y0 + S / 2;
    fg.fillStyle(0xff3355, 1).fillCircle(hx, hy, 3.5).lineStyle(1.5, 0xffffff, 1).strokeCircle(hx, hy, 3.5);
    fg.lineStyle(2, 0x0b0b14, 1).strokeRect(x0, y0, S, S).lineStyle(1, 0xffd84a, 0.6).strokeRect(x0 - 1, y0 - 1, S + 2, S + 2);
  }

  private get fogKey(): string {
    return `fog:${this.seed}`;
  }

  /** Nebel-Textur anlegen bzw. um neu erkundete Zellen ergänzen (Ränder halbtransparent). */
  private updateFog(ws: WorldScene): void {
    const fog = ws.fog;
    const n = fog.size;
    if (!this.fogTex) {
      if (this.ui.textures.exists(this.fogKey)) this.ui.textures.remove(this.fogKey);
      this.fogTex = this.ui.textures.createCanvas(this.fogKey, n, n)!;
      const ctx = this.fogTex.context;
      ctx.fillStyle = FOG_COLOR;
      ctx.fillRect(0, 0, n, n);
      for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) if (fog.isExplored(cx, cy)) this.paintFogAround(fog, cx, cy);
      fog.fresh.length = 0;
      this.refreshFog();
      return;
    }
    if (fog.fresh.length) {
      for (const i of fog.fresh) this.paintFogAround(fog, i % n, Math.floor(i / n));
      fog.fresh.length = 0;
      this.fogChanged = true;
    }
    // Hochladen der Textur höchstens alle 300 ms
    if (this.fogChanged && this.ui.time.now - this.fogRefreshAt > 300) {
      this.fogChanged = false;
      this.fogRefreshAt = this.ui.time.now;
      this.refreshFog();
    }
  }

  /** Nebel-Textur hochladen; weich gefiltert, damit bei starker Vergrößerung keine Treppenkanten entstehen. */
  private refreshFog(): void {
    if (!this.fogTex) return;
    this.fogTex.refresh();
    this.fogTex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  /** Zelle und Nachbarn neu zeichnen: erkundet = frei, an Erkundetes grenzend = halbtransparent, sonst Nebel. */
  private paintFogAround(fog: WorldScene['fog'], cx: number, cy: number): void {
    const ctx = this.fogTex!.context;
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (x < 0 || y < 0 || x >= fog.size || y >= fog.size) continue;
        ctx.clearRect(x, y, 1, 1);
        if (fog.isExplored(x, y)) continue;
        ctx.fillStyle = FOG_EDGE;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /** Färbt Biome einer Karte (Ausschnitt ab x0/y0 in Kacheln, je Pixel `step` Kacheln); Reiche getönt, Grenzen dunkel. */
  private paintBiomes(biomes: Uint8Array, size: number, x0: number, y0: number, step: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const meta = (this.ui.scene.get('world') as WorldScene).world.meta;
    const land = (b: number) => b > 1 && b !== B.River && b !== B.Lake;
    const realm = new Int8Array(biomes.length).fill(-1);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (land(biomes[y * size + x])) realm[y * size + x] = meta.realmAt(x0 + x * step + step / 2, y0 + y * step + step / 2).id;
    for (let i = 0; i < biomes.length; i++) {
      let c = BIOMES[biomes[i]].mapColor;
      const r = realm[i];
      if (r >= 0) {
        const rc = meta.realms[r].color;
        const t = 0.22;
        c = (Math.round((c >> 16) * (1 - t) + (rc >> 16) * t) << 16) | (Math.round(((c >> 8) & 255) * (1 - t) + ((rc >> 8) & 255) * t) << 8) | Math.round((c & 255) * (1 - t) + (rc & 255) * t);
        const x = i % size;
        if ((x + 1 < size && realm[i + 1] >= 0 && realm[i + 1] !== r) || (realm[i + size] !== undefined && realm[i + size] >= 0 && realm[i + size] !== r)) c = 0x1a1424;
      }
      img.data[i * 4] = c >> 16;
      img.data[i * 4 + 1] = (c >> 8) & 255;
      img.data[i * 4 + 2] = c & 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  private buildMap(o: OverviewResult): void {
    const canvas = this.paintBiomes(new Uint8Array(o.biomes), o.size, 0, 0, WORLD_TILES / o.size);
    this.mapTex = `map:${this.seed}`;
    if (this.ui.textures.exists(this.mapTex)) this.ui.textures.remove(this.mapTex);
    this.ui.textures.addCanvas(this.mapTex, canvas);
    this.mapSize = o.size;
    debugState.mapReady = true;
    if (debugState.mapOpen) {
      this.close();
      this.open();
    }
  }

  /** Feiner Kartenausschnitt vom Worker angekommen (nur den neuesten verwenden). */
  private onRegion(r: RegionResult): void {
    if (r.id !== this.regionId) return;
    const key = `mapdetail:${this.seed}`;
    if (this.ui.textures.exists(key)) this.ui.textures.remove(key);
    this.ui.textures.addCanvas(key, this.paintBiomes(new Uint8Array(r.biomes), r.size, r.x0, r.y0, r.step));
    this.detail = { x0: r.x0, y0: r.y0, step: r.step, size: r.size };
    debugState.mapDetail = r.step;
    if (this.map) this.layoutMap();
  }

  toggle(): void {
    if (this.map) this.close();
    else this.open();
  }

  /** Zoomstufen der Weltkarte. */
  

  open(): void {
    debugState.mapOpen = true;
    const { width, height } = this.ui.scale;
    // Über Hinweis-Bannern (35), unter Fenstern wie Heldenfenster (50)
    const c = this.ui.add.container(0, 0).setDepth(40);
    c.add(this.ui.add.rectangle(0, 0, width, height, 0x05050c, 0.88).setOrigin(0).setInteractive());
    this.map = c;
    if (!this.mapSize) {
      c.add(this.ui.add.text(width / 2, height / 2, 'Karte wird gezeichnet …', FONT).setOrigin(0.5));
      return;
    }
    const ws = this.ui.scene.get('world') as WorldScene;
    const side = Math.min(width, height) - 90;
    this.view = { x: width / 2 - side / 2, y: height / 2 - side / 2 + 10, side };
    // Beim Öffnen auf den Helden zentriert (Zoom bleibt wie zuletzt)
    this.mapCenter = { ...ws.player.tile };
    c.add(this.ui.add.text(width / 2, this.view.y - 20, `${ws.world.meta.lore.worldName} – Welt „${this.seed}“`, { ...FONT, fontSize: '16px' }).setOrigin(0.5));
    this.mapInfo = this.ui.add.text(width / 2, this.view.y + side + 14, '', { ...FONT, fontSize: '12px', color: '#2fe0d8' }).setOrigin(0.5);
    c.add(this.mapInfo);
    // Inhalt der Karte (wird bei Zoom/Verschieben neu gesetzt), auf das Kartenfenster beschnitten
    this.mapLayer = this.ui.add.container(0, 0);
    const shape = this.ui.make.graphics({}, false).fillStyle(0xffffff).fillRect(this.view.x, this.view.y, side, side);
    this.mapLayer.setMask(shape.createGeometryMask());
    c.add(this.mapLayer);
    c.add(this.ui.add.rectangle(this.view.x, this.view.y, side, side).setOrigin(0).setStrokeStyle(1, 0x2fe0d8, 0.6));
    // Knöpfe: + − ◎
    const bx = this.view.x + side + 8;
    const btn = (y: number, label: string, fn: () => void, name: string) => {
      const b = this.ui.add.text(Math.min(bx, width - 36), y, label, { ...FONT, fontSize: '18px', color: '#0b0b14', backgroundColor: '#2fe0d8', padding: { x: 8, y: 2 } }).setInteractive({ useHandCursor: true }).setName(name);
      b.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e?: Phaser.Types.Input.EventData) => {
        e?.stopPropagation();
        fn();
      });
      c.add(b);
    };
    btn(this.view.y, '+', () => this.zoomMap(1), 'map-zoom-in');
    btn(this.view.y + 34, '−', () => this.zoomMap(-1), 'map-zoom-out');
    btn(this.view.y + 68, '◎', () => {
      this.mapCenter = { ...ws.player.tile };
      this.layoutMap();
    }, 'map-center');
    // Ziehen verschiebt die Karte, Mausrad zoomt zur Mausposition
    const bg = c.getAt(0) as Phaser.GameObjects.Rectangle;
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => (this.mapDrag = { x: p.x, y: p.y, cx: this.mapCenter.tx, cy: this.mapCenter.ty }));
    this.marker = this.ui.add.rectangle(0, 0, 8, 8).setStrokeStyle(2, 0xff3355);
    c.add(this.marker);
    this.layoutMap();
  }


  /** Bildschirmpixel je Kachel bei der aktuellen Zoomstufe. */
  private get mapK(): number {
    return (this.view.side * MAP_ZOOMS[this.mapZoomIndex]) / WORLD_TILES;
  }

  /** Kachel → Bildschirmposition in der Kartenansicht. */
  private mapToScreen(tx: number, ty: number): { x: number; y: number } {
    const k = this.mapK;
    return { x: this.view.x + this.view.side / 2 + (tx - this.mapCenter.tx) * k, y: this.view.y + this.view.side / 2 + (ty - this.mapCenter.ty) * k };
  }

  /** Zoomt um eine Stufe; mit Bildschirmpunkt bleibt die Stelle darunter stehen (Mausrad). */
  zoomMap(dir: number, at?: { x: number; y: number }): void {
    if (!this.map || !this.mapLayer) return;
    const before = this.mapK;
    this.mapZoomIndex = Phaser.Math.Clamp(this.mapZoomIndex + dir, 0, MAP_ZOOMS.length - 1);
    if (at) {
      const cx = this.view.x + this.view.side / 2;
      const cy = this.view.y + this.view.side / 2;
      const tx = this.mapCenter.tx + (at.x - cx) / before;
      const ty = this.mapCenter.ty + (at.y - cy) / before;
      this.mapCenter = { tx: tx - (at.x - cx) / this.mapK, ty: ty - (at.y - cy) / this.mapK };
    }
    this.layoutMap();
  }

  /** Setzt Kartenbild, Ausschnitt, Nebel und Markierungen für Zoom und Mittelpunkt neu. */
  private layoutMap(): void {
    const layer = this.mapLayer;
    if (!layer) return;
    const ws = this.ui.scene.get('world') as WorldScene;
    const meta = ws.world.meta;
    const z = MAP_ZOOMS[this.mapZoomIndex];
    const k = this.mapK;
    const { side } = this.view;
    // Mittelpunkt so begrenzen, dass die Karte das Fenster füllt
    const halfSpan = side / 2 / k;
    this.mapCenter.tx = Phaser.Math.Clamp(this.mapCenter.tx, halfSpan, WORLD_TILES - halfSpan);
    this.mapCenter.ty = Phaser.Math.Clamp(this.mapCenter.ty, halfSpan, WORLD_TILES - halfSpan);
    debugState.mapZoom = z;
    layer.removeAll(true);
    const o = this.mapToScreen(0, 0);
    layer.add(this.ui.add.image(o.x, o.y, this.mapTex).setOrigin(0).setDisplaySize(WORLD_TILES * k, WORLD_TILES * k));
    // Feiner Ausschnitt ab 4×, sobald der Worker ihn geliefert hat
    const d = this.detail;
    if (z >= 4 && d && this.ui.textures.exists(`mapdetail:${this.seed}`)) {
      const p = this.mapToScreen(d.x0, d.y0);
      layer.add(this.ui.add.image(p.x, p.y, `mapdetail:${this.seed}`).setOrigin(0).setDisplaySize(d.size * d.step * k, d.size * d.step * k));
    }
    if (z >= 4) this.requestRegion();
    // Fog of War darüber
    this.updateFog(ws);
    this.refreshFog();
    layer.add(this.ui.add.image(o.x, o.y, this.fogKey).setOrigin(0).setDisplaySize(WORLD_TILES * k, WORLD_TILES * k));

    const v = this.view;
    const inView = (x: number, y: number) => x >= v.x - 4 && y >= v.y - 4 && x <= v.x + side + 4 && y <= v.y + side + 4;
    const knows = (tx: number, ty: number) => ws.fog.knows(tx, ty);
    const small = side < 500 && z < 4;
    for (const r of meta.realms) {
      const p = this.mapToScreen(r.tx, r.ty);
      if (!knows(r.tx, r.ty) || !inView(p.x, p.y)) continue;
      layer.add(this.ui.add.text(p.x, p.y - (small ? 14 : 22), r.name.toUpperCase(), { fontFamily: 'monospace', fontSize: small ? '9px' : '12px', color: '#ffffff', stroke: '#0b0b14', strokeThickness: 3 }).setOrigin(0.5).setAlpha(0.85));
    }
    for (const s of meta.settlements) {
      const p = this.mapToScreen(s.tx, s.ty);
      if (!knows(s.tx, s.ty) || !inView(p.x, p.y)) continue;
      const known = ws.state.d.discovered.has(`town:${s.id}`);
      const sz = (s.capital ? 7 : 4) + (z >= 8 ? 2 : 0);
      layer.add(this.ui.add.rectangle(p.x, p.y, sz, sz, s.capital ? 0xffd84a : 0xf4f0e8).setStrokeStyle(1, 0x0b0b14));
      if (known) {
        // Wegstein: anklickbar für Schnellreise
        const hit = this.ui.add.circle(p.x, p.y, 12, 0x2fe0d8, 0.25).setStrokeStyle(1, 0x2fe0d8).setInteractive({ useHandCursor: true }).setName(`travel-${s.id}`);
        hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e?: Phaser.Types.Input.EventData) => {
          e?.stopPropagation();
          if (ws.travel(s.id)) this.close();
        });
        layer.add(hit);
      }
      if (s.capital || !small) layer.add(this.ui.add.text(p.x + 6, p.y, s.name, { fontFamily: 'monospace', fontSize: small ? '9px' : '11px', color: s.capital ? '#ffd84a' : '#e0e0e8', stroke: '#0b0b14', strokeThickness: 3 }).setOrigin(0, 0.5));
    }
    for (const r of meta.ruins) {
      if (!ws.state.d.discovered.has(`ruin:${r.id}`)) continue;
      const p = this.mapToScreen(r.tx, r.ty);
      if (!inView(p.x, p.y)) continue;
      const looted = ws.state.d.chests.has(`ruinchest:${r.tx + 2},${r.ty + 1}`);
      layer.add(this.ui.add.triangle(p.x, p.y, 0, 8, 4, 0, 8, 8, looted ? 0x8a8aa0 : 0x3fc4d4).setStrokeStyle(1, 0x0b0b14));
    }
    const found = new Set(ws.hero.hero.chronicle ?? []);
    for (const ob of meta.obelisks) {
      const p = this.mapToScreen(ob.tx, ob.ty);
      if (found.has(ob.fragment ?? -1) && inView(p.x, p.y)) layer.add(this.ui.add.star(p.x, p.y, 4, 2, 5, 0x9b6af0).setStrokeStyle(1, 0xffffff));
    }
    for (const q of ws.hero.quests.active) {
      const t = questTarget(q);
      if (!t) continue;
      const p = this.mapToScreen(t.tx, t.ty);
      if (!inView(p.x, p.y)) continue;
      if (t.npcId && !ws.npcs.npcs.has(t.npcId)) layer.add(this.ui.add.circle(p.x, p.y, Math.max(7, AREA_RADIUS * k), 0xffd84a, 0.25).setStrokeStyle(1, 0xffd84a));
      else layer.add(this.ui.add.circle(p.x, p.y, 4, 0xffd84a).setStrokeStyle(1, 0x0b0b14));
    }
    for (const car of ws.live.caravans) {
      const cp = caravanPos(car, worldNow());
      const p = this.mapToScreen(cp.tx, cp.ty);
      if (knows(cp.tx, cp.ty) && inView(p.x, p.y)) layer.add(this.ui.add.triangle(p.x, p.y, 0, 6, 3, 0, 6, 6, 0xf08a3a).setStrokeStyle(1, 0x0b0b14));
    }
    this.mapInfo?.setText(`Zoom ${z}× · Erkundet: ${(ws.fog.fraction * 100).toFixed(2)} % · Ziehen: verschieben · Rad/+/−: zoomen · türkis: Schnellreise`);
  }

  /** Feinen Ausschnitt um den sichtbaren Bereich anfordern (verzögert, nur wenn der vorhandene nicht reicht). */
  private requestRegion(): void {
    const k = this.mapK;
    const span = this.view.side / k;
    // ~2,5 Bildschirmpixel je Kartenpixel, aber nie feiner als 2 Kacheln
    const step = Math.max(2, Math.pow(2, Math.round(Math.log2(span / (this.view.side / 2.5)))));
    const x0 = this.mapCenter.tx - span / 2;
    const y0 = this.mapCenter.ty - span / 2;
    const d = this.detail;
    if (d && d.step === step && d.x0 <= x0 && d.y0 <= y0 && d.x0 + d.size * step >= x0 + span && d.y0 + d.size * step >= y0 + span) return;
    this.regionTimer?.remove();
    this.regionTimer = this.ui.time.delayedCall(150, () => {
      // 1,6-facher Sichtbereich, damit kleines Verschieben ohne neue Berechnung geht
      const size = Math.ceil((span * 1.6) / step);
      const rx = Math.max(0, Math.round((this.mapCenter.tx - (size * step) / 2) / step) * step);
      const ry = Math.max(0, Math.round((this.mapCenter.ty - (size * step) / 2) / step) * step);
      this.ensureMapWorker().postMessage({ type: 'region', id: ++this.regionId, x0: rx, y0: ry, step, size } satisfies ChunkRequest);
    });
  }

  /** Der Karten-Worker bleibt nach der Übersicht für Ausschnitte bestehen. */
  private ensureMapWorker(): Worker {
    if (!this.mapWorker) {
      this.mapWorker = new Worker(new URL('../render/chunkWorker.ts', import.meta.url), { type: 'module' });
      this.mapWorker.onmessage = (ev: MessageEvent<OverviewResult | RegionResult>) => (ev.data.type === 'overview' ? this.buildMap(ev.data) : this.onRegion(ev.data));
      this.mapWorker.postMessage({ type: 'init', seed: this.seed } satisfies ChunkRequest);
    }
    return this.mapWorker;
  }

  close(): void {
    debugState.mapOpen = false;
    this.map?.destroy();
    this.map = undefined;
    this.marker = undefined;
    this.mapLayer = undefined;
    this.mapInfo = undefined;
    this.mapDrag = null;
  }

  /** Rahmen des sichtbaren Weltausschnitts auf der offenen Karte. */
  updateMarker(ws: WorldScene): void {
    if (!this.marker || !this.mapLayer) return;
    const v = ws.cameras.main.worldView;
    const k = this.mapK;
    const p = this.mapToScreen(v.centerX / TILE_PX, v.centerY / TILE_PX);
    const w = Math.max(6, (v.width / TILE_PX) * k);
    const h = Math.max(6, (v.height / TILE_PX) * k);
    const mv = this.view;
    this.marker.setPosition(p.x, p.y).setSize(w, h).setDisplayOrigin(w / 2, h / 2);
    this.marker.setVisible(p.x > mv.x && p.y > mv.y && p.x < mv.x + mv.side && p.y < mv.y + mv.side);
  }
}
