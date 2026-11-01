import Phaser from 'phaser';
import { buildCharacter, preloadCharacter } from '../character/CharacterFactory';
import { DEFAULT_APPEARANCE, type Appearance } from '../character/lpc';
import { dress } from '../character/outfit';
import { BANDIT_LOOKS } from '../entities/Enemy';
import { Actor } from '../entities/Actor';
import { load } from '../game/save';
import { ChunkManager } from '../render/ChunkManager';
import { CHUNK_PX, TILE_PX } from '../render/chunkPixels';
import { CREATURES, createCreatureAtlas, createDecorAtlas } from '../render/textures';
import { starterKit, type Item, type Slot } from '../rpg/items';
import { moveBox } from '../world/collision';
import { CELL, CellKind } from '../world/terrain';
import { WORLD_TILES, WorldGen } from '../world/WorldGen';
import { GroundRenderer, type Fog } from './ground';
import { buildPanel } from './panel';
import { findPlace, type PlaceId } from './places';
import { Projection } from './projection';
import { loadSettings, saveSettings, type PerspSettings } from './settings';

/** Ein aufrecht stehendes Objekt mit festem Fußpunkt in der Welt. */
interface Billboard {
  img: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  x: number;
  y: number;
}

/** Zugriff auf die (privaten) geladenen Chunks des ChunkManagers – nur im Prototyp. */
type LoadedMap = Map<string, { key: string; ground: Phaser.GameObjects.Image; objects: Phaser.GameObjects.Image[] }>;

interface Wanderer {
  actor?: Actor;
  slime?: { sprite: Phaser.GameObjects.Sprite; x: number; y: number };
  dx: number;
  dy: number;
  t: number;
}

const FOG_COLORS: Record<PerspSettings['fog'], Pick<Fog, 'color' | 'sky'>> = {
  dunst: { color: [0.62, 0.72, 0.82], sky: [0.25, 0.42, 0.7] },
  dunkel: { color: [0.04, 0.04, 0.08], sky: [0.02, 0.02, 0.05] },
};

/**
 * Prototyp (`?perspektive=1`): echter Weltausschnitt aus dem Seed mit gekippter, perspektivischer Bodenebene.
 * Boden im eigenen WebGL-Canvas (`ground.ts`), Figuren, Dekor und Felswände als aufrechte Billboards, nach Tiefe
 * skaliert und nach Weltzeile sortiert. Nicht für main gedacht – nur zum Ausprobieren des Spielgefühls.
 */
export class PerspectiveScene extends Phaser.Scene {
  s!: PerspSettings;
  private world!: WorldGen;
  private chunks!: ChunkManager;
  private ground!: GroundRenderer;
  private hero!: Actor;
  private look: Appearance = DEFAULT_APPEARANCE;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  /** Dekor und Felswände je Chunk */
  private readonly boards = new Map<string, Billboard[]>();
  private readonly walls = new Map<string, Phaser.GameObjects.Image[]>();
  private readonly wanderers: Wanderer[] = [];
  private cam = { x: 0, y: 0 };
  private proj!: Projection;
  private hud?: HTMLElement;
  private hudAt = 0;
  private wallCount = 0;
  private visible = 0;
  /** Rechenzeit von update() in ms (gleitend) */
  private cpu = 0;

  constructor() {
    super('perspektive');
  }

  init(): void {
    this.s = loadSettings();
    const seed = (load<string[]>('recent') ?? [])[0];
    const hero = seed ? load<{ appearance?: Appearance; equipped?: Partial<Record<Slot, Item>> }>(`hero:${seed}`) : null;
    const body = { ...DEFAULT_APPEARANCE, ...hero?.appearance };
    const equipped = hero?.equipped ?? Object.fromEntries(starterKit(body.race ?? 'human', body.body).map((i) => [i.slot, i]));
    this.look = dress(body, equipped);
  }

  preload(): void {
    preloadCharacter(this, this.look);
    for (const a of BANDIT_LOOKS) preloadCharacter(this, a);
  }

  create(): void {
    createDecorAtlas(this);
    createCreatureAtlas(this);
    const parent = this.game.canvas.parentElement!;
    parent.style.position = 'relative';
    Object.assign(this.game.canvas.style, { position: 'relative', zIndex: '1' });
    this.world = new WorldGen(this.s.seed);
    this.ground = new GroundRenderer(parent, CHUNK_PX, WORLD_TILES * TILE_PX);
    this.chunks = new ChunkManager(this, this.s.seed);
    const loaded = (this.chunks as unknown as { loaded: LoadedMap }).loaded;
    this.chunks.onLoad.push((cx, cy) => {
      const k = `${cx},${cy}`;
      const c = loaded.get(k);
      if (!c) return;
      c.ground.setVisible(false);
      this.ground.upload(cx, cy, this.textures.get(c.key).getSourceImage() as HTMLCanvasElement);
      this.boards.set(k, c.objects.map((img) => ({ img, x: img.x, y: img.y })));
      this.buildWalls(cx, cy, c.key);
    });
    this.chunks.onUnload.push((cx, cy) => {
      const k = `${cx},${cy}`;
      this.ground.release(cx, cy);
      this.boards.delete(k);
      this.walls.get(k)?.forEach((w) => w.destroy());
      this.walls.delete(k);
    });

    this.hero = new Actor(this, 0, 0, buildCharacter(this, this.look));
    this.hero.diagonalFacing = 'side';
    for (let i = 0; i < 6; i++) {
      if (i < 4) {
        const a = new Actor(this, 0, 0, buildCharacter(this, BANDIT_LOOKS[i % BANDIT_LOOKS.length], ['walk', 'idle']));
        a.baseSpeed = 60;
        this.wanderers.push({ actor: a, dx: 0, dy: 0, t: 0 });
      } else {
        const sprite = this.add.sprite(0, 0, CREATURES, 'slime:0').setOrigin(0.5, 0.85).play('slime:loop');
        this.wanderers.push({ slime: { sprite, x: 0, y: 0 }, dx: 0, dy: 0, t: 0 });
      }
    }
    this.goTo(this.s.place);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,Q,E') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.set({ zoom: Phaser.Math.Clamp(this.s.zoom + (dy > 0 ? -0.25 : 0.25), 1, 4) }));
    const panel = buildPanel(this);
    this.hud = panel.querySelector<HTMLElement>('#persp-stats') ?? undefined;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      panel.remove();
      this.ground.destroy();
      this.chunks.destroy();
    });
    (window as unknown as { __perspektive: unknown }).__perspektive = {
      set: (p: Partial<PerspSettings>) => this.set(p),
      goTo: (id: PlaceId) => this.goTo(id),
      state: () => ({ loaded: this.chunks.loadedCount, pending: this.chunks.pendingCount, fps: this.game.loop.actualFps, hero: { x: this.hero.x, y: this.hero.y }, walls: this.wallCount, visible: this.visible, cpu: this.cpu }),
    };
  }

  /** Einstellungen ändern (live) und merken. */
  set(p: Partial<PerspSettings>): void {
    Object.assign(this.s, p);
    saveSettings(this.s);
    if (p.walls !== undefined) for (const list of this.walls.values()) list.forEach((w) => w.setVisible(this.s.walls));
    this.events.emit('settings');
  }

  /** Neuer Seed: Szene mit neuer Welt neu starten. */
  setSeed(seed: string): void {
    this.set({ seed: seed.trim() || 'splitter' });
    location.reload();
  }

  /** Held (und Begleiter) an einen Startort setzen. */
  goTo(id: PlaceId): void {
    this.set({ place: id });
    const p = findPlace(this.world, id);
    const x = p.tx * TILE_PX + TILE_PX / 2;
    const y = p.ty * TILE_PX + TILE_PX - 2;
    this.hero.setPosition(x, y);
    this.cam = { x, y };
    this.wanderers.forEach((w, i) => {
      // Begleiter verteilt vor dem Helden (auf begehbaren Kacheln)
      let tx = p.tx;
      let ty = p.ty;
      for (let n = 0; n < 30; n++) {
        const a = (i / this.wanderers.length) * Math.PI * 2 + n;
        const r = 3 + i + n * 0.3;
        tx = Math.round(p.tx + Math.cos(a) * r);
        ty = Math.round(p.ty - 2 - Math.abs(Math.sin(a)) * r);
        if (this.world.isWalkable(tx, ty)) break;
      }
      const wx = tx * TILE_PX + TILE_PX / 2;
      const wy = ty * TILE_PX + TILE_PX - 2;
      if (w.actor) w.actor.setPosition(wx, wy);
      if (w.slime) Object.assign(w.slime, { x: wx, y: wy });
    });
  }

  /**
   * Felswände (Wandzellen im Geländeraster) als aufrechte Streifen aus dem Bodenbild ausschneiden: je Zellspalte die
   * zusammenhängenden Wandstücke, gleiche Nachbarspalten zusammengefasst. Fußpunkt = Unterkante der Wand.
   */
  private buildWalls(cx: number, cy: number, texKey: string): void {
    const n = CHUNK_PX / CELL;
    const ox = cx * n;
    const oy = cy * n;
    const runsOf = (x: number): [number, number][] => {
      const runs: [number, number][] = [];
      let start = -1;
      for (let y = 0; y <= n; y++) {
        const wall = y < n && this.chunks.cellAt(ox + x, oy + y)?.kind === CellKind.Wall;
        if (wall && start < 0) start = y;
        if (!wall && start >= 0) {
          // Wand läuft in den Chunk darunter weiter → flach lassen (Fuß liegt dort)
          const below = y === n ? this.chunks.cellAt(ox + x, oy + n) : undefined;
          if (!(y === n && (!below || below.kind === CellKind.Wall))) runs.push([start, y - 1]);
          start = -1;
        }
      }
      return runs;
    };
    const strips: { x0: number; x1: number; y0: number; y1: number }[] = [];
    let open: typeof strips = [];
    for (let x = 0; x < n; x++) {
      const runs = runsOf(x);
      const next: typeof strips = [];
      for (const [y0, y1] of runs) {
        const prev = open.find((s) => s.y0 === y0 && s.y1 === y1);
        if (prev) {
          prev.x1 = x;
          next.push(prev);
        } else {
          const s = { x0: x, x1: x, y0, y1 };
          strips.push(s);
          next.push(s);
        }
      }
      open = next;
    }
    if (!strips.length) return;
    const tex = this.textures.get(texKey);
    const list = strips.map((s, i) => {
      tex.add(`wall${i}`, 0, s.x0 * CELL, s.y0 * CELL, (s.x1 - s.x0 + 1) * CELL, (s.y1 - s.y0 + 1) * CELL);
      const img = this.add.image(0, 0, texKey, `wall${i}`).setOrigin(0.5, 1).setVisible(this.s.walls);
      img.setData('foot', { x: cx * CHUNK_PX + ((s.x0 + s.x1 + 1) * CELL) / 2, y: cy * CHUNK_PX + (s.y1 + 1) * CELL });
      return img;
    });
    this.wallCount += list.length;
    this.walls.set(`${cx},${cy}`, list);
  }

  private get fog(): Fog {
    const end = Math.min(this.s.sight * TILE_PX, (this.ground.ringH - 4.2) * CHUNK_PX);
    return { start: end * 0.45, end, ...FOG_COLORS[this.s.fog] };
  }

  /** Billboard an seinen Fußpunkt setzen, nach Tiefe skaliert, sortiert und im Nebel ausgeblendet. */
  private place(obj: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | Phaser.GameObjects.Ellipse, x: number, y: number, fog: Fog, flat = false): boolean {
    const p = this.proj.project(x, y);
    const W = this.scale.width;
    const H = this.scale.height;
    const f = smooth(fog.start, fog.end, this.proj.v.ty - y);
    if (!p || f >= 1 || p.sx < -300 || p.sx > W + 300 || p.sy < -50 || p.sy > H + 400) {
      obj.setVisible(false);
      return false;
    }
    const k = this.s.depthScale ? p.scale : this.s.zoom;
    obj.setVisible(true).setPosition(p.sx, p.sy).setDepth(y);
    if (flat) obj.setScale(k, k * (0.35 + 0.65 * this.proj.cos));
    else obj.setScale(k);
    obj.setAlpha(1 - f * f);
    if ('setTint' in obj && this.s.fog === 'dunkel') {
      const g = Math.round(255 * (1 - f));
      obj.setTint((g << 16) | (g << 8) | g);
    } else if ('clearTint' in obj) obj.clearTint();
    return true;
  }

  update(_t: number, delta: number): void {
    const t0 = performance.now();
    const dt = Math.min(0.05, delta / 1000);
    const k = this.keys;
    const dx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const dy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (k.Q.isDown || k.E.isDown) this.set({ tilt: Phaser.Math.Clamp(this.s.tilt + (k.E.isDown ? 40 : -40) * dt, 0, 70) });
    this.hero.update(dx, dy, k.SHIFT.isDown, dt, this.chunks);
    this.updateWanderers(dt);

    // Kamera folgt weich
    const a = 1 - Math.exp(-dt * 10);
    this.cam.x += (this.hero.x - this.cam.x) * a;
    this.cam.y += (this.hero.y - this.cam.y) * a;
    const W = this.scale.width;
    const H = this.scale.height;
    this.proj = new Projection({ tilt: this.s.tilt, fov: this.s.fov, zoom: this.s.zoom, width: W, height: H, tx: this.cam.x, ty: this.cam.y });
    const fog = this.fog;
    this.chunks.update(this.viewRect(fog));
    this.ground.pixel = this.s.pixel;
    this.ground.render(this.proj, fog);

    let visible = 0;
    for (const list of this.boards.values()) for (const b of list) if (this.place(b.img, b.x, b.y, fog)) visible++;
    if (this.s.walls) {
      for (const list of this.walls.values()) {
        for (const w of list) {
          const foot = w.getData('foot') as { x: number; y: number };
          if (this.place(w, foot.x, foot.y, fog)) visible++;
        }
      }
    }
    const actors = [this.hero, ...this.wanderers.flatMap((w) => (w.actor ? [w.actor] : []))];
    for (const act of actors) {
      this.place(act.sprite, act.x, act.y, fog);
      this.place(act.shadow, act.x, act.y - 1, fog, true);
      act.shadow.setDepth(act.y - 40);
    }
    for (const w of this.wanderers) if (w.slime) this.place(w.slime.sprite, w.slime.x, w.slime.y, fog);
    this.visible = visible;
    this.cpu += (performance.now() - t0 - this.cpu) * 0.1;

    const now = this.time.now;
    if (this.hud && now - this.hudAt > 250) {
      this.hudAt = now;
      this.hud.textContent = [
        `FPS ${this.game.loop.actualFps.toFixed(0)}  Logik ${this.cpu.toFixed(1)} ms  Bild ${W}×${H}`,
        `Chunks ${this.chunks.loadedCount} (+${this.chunks.pendingCount})  Ring ${this.ground.ringW}×${this.ground.ringH}`,
        `Billboards sichtbar ${visible}  Wandstreifen ${this.wallCount}`,
        `Held Kachel ${Math.floor(this.hero.x / TILE_PX)}, ${Math.floor(this.hero.y / TILE_PX)}`,
        'WASD laufen · Shift rennen · Q/E Neigung · Mausrad Zoom',
      ].join('\n');
    }
  }

  /**
   * Weltausschnitt zum Laden: Bodenfläche, die die Kamera bis zur Sichtweite sieht, begrenzt auf das, was die
   * Ringtextur fassen kann (ChunkManager lädt 0,5 Chunks Rand und entlädt erst 1 Chunk weiter draußen).
   */
  private viewRect(fog: Fog): Phaser.Geom.Rectangle {
    const p = this.proj;
    const W = p.v.width;
    const H = p.v.height;
    const pts = [p.unproject(0, H), p.unproject(W, H)].filter((q) => !!q) as { x: number; y: number }[];
    const farY = p.v.ty - fog.end;
    const top = Math.max(p.horizon + 2, 0);
    for (const q of [p.unproject(0, top), p.unproject(W, top)]) if (q) pts.push({ x: q.x, y: Math.max(q.y, farY) });
    // Breite in Sichtweite (dort ist der Ausschnitt am breitesten)
    const zFar = p.d + fog.end * p.sin;
    const half = (W / 2) * (zFar / p.f);
    pts.push({ x: p.v.tx - half, y: Math.max(farY, pts[pts.length - 1]?.y ?? farY) }, { x: p.v.tx + half, y: Math.max(farY, pts[pts.length - 1]?.y ?? farY) });
    let x0 = Math.min(...pts.map((q) => q.x));
    let x1 = Math.max(...pts.map((q) => q.x));
    let y0 = Math.min(...pts.map((q) => q.y));
    let y1 = Math.max(...pts.map((q) => q.y)) + 64;
    const maxW = (this.ground.ringW - 4) * CHUNK_PX;
    const maxH = (this.ground.ringH - 4) * CHUNK_PX;
    if (x1 - x0 > maxW) {
      x0 = p.v.tx - maxW / 2;
      x1 = p.v.tx + maxW / 2;
    }
    if (y1 - y0 > maxH) y0 = y1 - maxH;
    return new Phaser.Geom.Rectangle(x0, y0, x1 - x0, y1 - y0);
  }

  private updateWanderers(dt: number): void {
    for (const w of this.wanderers) {
      w.t -= dt;
      if (w.t <= 0) {
        w.t = 1 + Math.random() * 2.5;
        const idle = Math.random() < 0.35;
        const ang = Math.random() * Math.PI * 2;
        w.dx = idle ? 0 : Math.cos(ang);
        w.dy = idle ? 0 : Math.sin(ang);
        // Nicht zu weit vom Helden weglaufen
        const pos = w.actor ?? w.slime!;
        const ddx = this.hero.x - pos.x;
        const ddy = this.hero.y - pos.y;
        const dist = Math.hypot(ddx, ddy);
        if (dist > 10 * TILE_PX) {
          w.dx = ddx / dist;
          w.dy = ddy / dist;
        }
      }
      if (w.actor) w.actor.update(w.dx, w.dy, false, dt, this.chunks);
      else if (w.slime) {
        const s = w.slime;
        const moved = moveBox({ x: s.x - 8, y: s.y - 6, w: 16, h: 6 }, w.dx * 40 * dt, w.dy * 40 * dt, (b) => this.chunks.blocked(b));
        s.x = moved.x + 8;
        s.y = moved.y + 6;
      }
    }
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
