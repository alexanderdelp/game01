import Phaser from 'phaser';
import { ChunkManager } from '../render/ChunkManager';
import { TILE_PX } from '../render/chunkPixels';
import { createDecorAtlas } from '../render/textures';
import { WORLD_TILES, WorldGen } from '../world/WorldGen';
import { debugState } from '../debug';

const ZOOMS = [1, 2, 3, 4];

/** Die Spielwelt: Chunks, Dekorationen und (in M1) eine frei bewegliche Kamera. */
export class WorldScene extends Phaser.Scene {
  world!: WorldGen;
  chunks!: ChunkManager;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private zoomIndex = 2;

  constructor() {
    super('world');
  }

  init(data: { seed: string }): void {
    this.world = new WorldGen(data.seed);
  }

  create(): void {
    createDecorAtlas(this);
    this.chunks = new ChunkManager(this, this.world.seedName);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.chunks.destroy());

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x172a5c);
    cam.setBounds(0, 0, WORLD_TILES * TILE_PX, WORLD_TILES * TILE_PX);
    cam.setRoundPixels(true);
    cam.setZoom(ZOOMS[this.zoomIndex]);
    const spawn = this.world.findSpawn();
    cam.centerOn(spawn.tx * TILE_PX + TILE_PX / 2, spawn.ty * TILE_PX + TILE_PX / 2);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-PLUS', () => this.zoom(1));
    kb.on('keydown-NUMPAD_ADD', () => this.zoom(1));
    kb.on('keydown-MINUS', () => this.zoom(-1));
    kb.on('keydown-NUMPAD_SUBTRACT', () => this.zoom(-1));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoom(dy < 0 ? 1 : -1));

    this.scene.launch('ui', { seed: this.world.seedName });
    debugState.seed = this.world.seedName;
    debugState.spawn = spawn;
  }

  private zoom(dir: number): void {
    this.zoomIndex = Phaser.Math.Clamp(this.zoomIndex + dir, 0, ZOOMS.length - 1);
    this.cameras.main.setZoom(ZOOMS[this.zoomIndex]);
  }

  /** Mittelpunkt der Kamera in Kachelkoordinaten. */
  get focusTile(): { tx: number; ty: number } {
    const v = this.cameras.main.worldView;
    return { tx: Math.floor(v.centerX / TILE_PX), ty: Math.floor(v.centerY / TILE_PX) };
  }

  update(_time: number, delta: number): void {
    const k = this.keys;
    const dx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const dy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    const cam = this.cameras.main;
    if (dx || dy) {
      const speed = ((k.SHIFT.isDown ? 1600 : 500) / cam.zoom) * (delta / 1000);
      const len = Math.hypot(dx, dy);
      cam.scrollX += (dx / len) * speed;
      cam.scrollY += (dy / len) * speed;
    }
    this.chunks.update(cam.worldView);

    const f = this.focusTile;
    debugState.focus = f;
    debugState.zoom = cam.zoom;
    debugState.chunksLoaded = this.chunks.loadedCount;
    debugState.chunksPending = this.chunks.pendingCount;
    debugState.ready = this.chunks.loadedCount > 0 && this.chunks.pendingCount === 0;
  }
}
