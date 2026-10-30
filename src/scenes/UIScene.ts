import Phaser from 'phaser';
import { debugState } from '../debug';
import { TILE_PX } from '../render/chunkPixels';
import type { ChunkRequest, OverviewResult } from '../render/chunkProtocol';
import { touchInput } from '../game/input';
import { BIOMES } from '../world/biomes';
import { randomSeedName } from '../world/rng';
import { WORLD_TILES } from '../world/WorldGen';
import type { WorldScene } from './WorldScene';

const MAP_STEP = 8;
const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#f4f0e8' };

/** HUD und Weltkarte, gezeichnet ohne Kamera-Zoom über der Welt. */
export class UIScene extends Phaser.Scene {
  private hud!: Phaser.GameObjects.Text;
  private help!: Phaser.GameObjects.Text;
  private map?: Phaser.GameObjects.Container;
  private mapImage?: Phaser.GameObjects.Image;
  private marker?: Phaser.GameObjects.Rectangle;
  private mapWorker?: Worker;
  private mapTex = '';
  private mapSize = 0;
  private seed = '';

  constructor() {
    super('ui');
  }

  init(data: { seed: string }): void {
    this.seed = data.seed;
  }

  create(): void {
    this.hud = this.add.text(8, 8, '', { ...FONT, backgroundColor: '#0b0b14cc', padding: { x: 6, y: 4 } });
    this.help = this.add
      .text(8, 0, this.sys.game.device.input.touch ? 'Ziehen: laufen' : 'WASD: laufen  Leertaste/J: angreifen  E: reden  Shift: rennen  Mausrad: Zoom  M: Karte  N: neue Welt', {
        ...FONT,
        fontSize: '12px',
        backgroundColor: '#0b0b14cc',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0, 1);

    const kb = this.input.keyboard!;
    kb.on('keydown-M', () => this.toggleMap());
    kb.on('keydown-N', () => {
      const url = new URL(location.href);
      url.searchParams.set('seed', randomSeedName());
      location.href = url.toString();
    });

    this.createTouchControls();
    this.nameTag = this.add
      .text(0, 0, '', { ...FONT, fontSize: '12px', backgroundColor: '#0b0b14aa', padding: { x: 4, y: 2 } })
      .setOrigin(0.5, 1)
      .setDepth(5)
      .setVisible(false);
    this.hpBar = this.add.graphics().setDepth(6);
    const ws = this.scene.get('world') as WorldScene;
    const onDamage = (d: { x: number; y: number; amount: number; color: string }) => this.damageNumber(d);
    ws.events.on('damage', onDamage);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ws.events.off('damage', onDamage));
    const onDied = () => {
      const t = this.add.text(this.scale.width / 2, this.scale.height / 2, 'Du bist gefallen …', { ...FONT, fontSize: '22px' }).setOrigin(0.5).setDepth(40);
      ws.events.once('player-respawned', () => t.destroy());
    };
    ws.events.on('player-died', onDied);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ws.events.off('player-died', onDied));
    const onTalk = (d: { name: string; role: string; text: string } | null) => this.showDialog(d);
    ws.events.on('talk', onTalk);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ws.events.off('talk', onTalk));

    // Übersichtskarte im Hintergrund erzeugen.
    this.mapWorker = new Worker(new URL('../render/chunkWorker.ts', import.meta.url), { type: 'module' });
    this.mapWorker.onmessage = (ev: MessageEvent<OverviewResult>) => this.buildMap(ev.data);
    this.mapWorker.postMessage({ type: 'init', seed: this.seed } satisfies ChunkRequest);
    this.mapWorker.postMessage({ type: 'overview', step: MAP_STEP } satisfies ChunkRequest);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.mapWorker?.terminate());
  }

  /** Virtueller Stick (Ziehen irgendwo auf dem Bildschirm) und Buttons für Touch-Geräte. */
  private createTouchControls(): void {
    const base = this.add.circle(0, 0, 34, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.35).setVisible(false).setDepth(20);
    const knob = this.add.circle(0, 0, 14, 0xffffff, 0.4).setVisible(false).setDepth(21);
    let pointerId = -1;
    const onButton = (p: Phaser.Input.Pointer) => this.input.hitTestPointer(p).length > 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (pointerId !== -1 || onButton(p) || this.map) return;
      pointerId = p.id;
      base.setPosition(p.x, p.y).setVisible(true);
      knob.setPosition(p.x, p.y).setVisible(true);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== pointerId) return;
      const dx = p.x - base.x;
      const dy = p.y - base.y;
      const len = Math.hypot(dx, dy);
      const max = 34;
      const k = len > max ? max / len : 1;
      knob.setPosition(base.x + dx * k, base.y + dy * k);
      touchInput.x = len < 6 ? 0 : (dx * k) / max;
      touchInput.y = len < 6 ? 0 : (dy * k) / max;
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== pointerId) return;
      pointerId = -1;
      base.setVisible(false);
      knob.setVisible(false);
      touchInput.x = 0;
      touchInput.y = 0;
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    if (!this.sys.game.device.input.touch) return;
    const ws = () => this.scene.get('world') as WorldScene;
    // Großer Angriffsbutton unten rechts
    this.attackButton = this.add.circle(0, 0, 36, 0xe04a5a, 0.45).setStrokeStyle(3, 0xffffff, 0.6).setDepth(30).setInteractive();
    this.attackButton.on('pointerdown', () => ws().attack());
    this.attackLabel = this.add.text(0, 0, '⚔', { ...FONT, fontSize: '26px' }).setOrigin(0.5).setDepth(31);
    const buttons: [string, () => void][] = [
      ['Karte', () => this.toggleMap()],
      ['Reden', () => ws().interact()],
      ['+', () => ws().zoom(1)],
      ['−', () => ws().zoom(-1)],
    ];
    buttons.forEach(([label, fn], i) => {
      const b = this.add
        .text(0, 0, label, { ...FONT, fontSize: '18px', backgroundColor: '#0b0b14cc', padding: { x: 10, y: 6 } })
        .setOrigin(1, 0)
        .setDepth(30)
        .setInteractive({ useHandCursor: true });
      b.on('pointerdown', fn);
      this.touchButtons.push({ b, i });
    });
  }

  private touchButtons: { b: Phaser.GameObjects.Text; i: number }[] = [];
  private hpBar!: Phaser.GameObjects.Graphics;
  private attackButton?: Phaser.GameObjects.Arc;

  /** Aufsteigende Schadenszahl an einer Weltposition. */
  private damageNumber(d: { x: number; y: number; amount: number; color: string }): void {
    const ws = this.scene.get('world') as WorldScene;
    const cam = ws.cameras.main;
    const sx = (d.x - cam.worldView.x) * cam.zoom;
    const sy = (d.y - cam.worldView.y) * cam.zoom;
    const t = this.add
      .text(sx, sy, String(d.amount), { fontFamily: 'monospace', fontSize: '18px', color: d.color, stroke: '#0b0b14', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(8);
    this.tweens.add({ targets: t, y: sy - 34, alpha: 0, duration: 750, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  private drawHp(): void {
    const ws = this.scene.get('world') as WorldScene;
    const s = ws.combat.stats;
    const x = 8;
    const y = this.hud.y + this.hud.height + 6;
    const w = 160;
    const g = this.hpBar.clear();
    g.fillStyle(0x0b0b14, 0.85).fillRect(x, y, w + 4, 14);
    const f = Math.max(0, s.hp) / s.maxHp;
    g.fillStyle(f > 0.5 ? 0x4cb53e : f > 0.25 ? 0xe0b030 : 0xe04a5a, 1).fillRect(x + 2, y + 2, w * f, 10);
    this.hpText ??= this.add.text(0, 0, '', { ...FONT, fontSize: '11px' }).setDepth(7);
    this.hpText.setText(`LP ${Math.ceil(s.hp)}/${s.maxHp}`).setPosition(x + 6, y + 1);
  }

  private hpText?: Phaser.GameObjects.Text;
  private attackLabel?: Phaser.GameObjects.Text;
  private dialog?: Phaser.GameObjects.Container;
  private nameTag!: Phaser.GameObjects.Text;

  /** Dialogfenster unten am Bildschirm. */
  private showDialog(d: { name: string; role: string; text: string } | null): void {
    this.dialog?.destroy();
    this.dialog = undefined;
    if (!d) return;
    const w = Math.min(this.scale.width - 24, 640);
    const x = (this.scale.width - w) / 2;
    const y = this.scale.height - 130;
    const c = this.add.container(x, y).setDepth(15);
    const bg = this.add.rectangle(0, 0, w, 96, 0x0b0b14, 0.9).setOrigin(0).setStrokeStyle(2, 0x2fe0d8, 0.8);
    const title = this.add.text(12, 8, `${d.name} · ${d.role}`, { ...FONT, fontSize: '15px', color: '#2fe0d8' });
    const text = this.add.text(12, 32, `„${d.text}“`, { ...FONT, fontSize: '15px', wordWrap: { width: w - 24 } });
    const hint = this.add
      .text(w - 10, 88, this.sys.game.device.input.touch ? 'Reden: weiter' : 'E: schließen', { ...FONT, fontSize: '11px', color: '#8a8aa0' })
      .setOrigin(1, 1);
    c.add([bg, title, text, hint]);
    this.dialog = c;
  }

  private buildMap(o: OverviewResult): void {
    this.mapWorker?.terminate();
    this.mapWorker = undefined;
    const biomes = new Uint8Array(o.biomes);
    const canvas = document.createElement('canvas');
    canvas.width = o.size;
    canvas.height = o.size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(o.size, o.size);
    for (let i = 0; i < biomes.length; i++) {
      const c = BIOMES[biomes[i]].mapColor;
      img.data[i * 4] = c >> 16;
      img.data[i * 4 + 1] = (c >> 8) & 255;
      img.data[i * 4 + 2] = c & 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mapTex = `map:${this.seed}`;
    if (this.textures.exists(this.mapTex)) this.textures.remove(this.mapTex);
    this.textures.addCanvas(this.mapTex, canvas);
    this.mapSize = o.size;
    debugState.mapReady = true;
    if (debugState.mapOpen) {
      this.closeMap();
      this.openMap();
    }
  }

  private toggleMap(): void {
    if (this.map) this.closeMap();
    else this.openMap();
  }

  private openMap(): void {
    debugState.mapOpen = true;
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setDepth(10);
    c.add(this.add.rectangle(0, 0, width, height, 0x05050c, 0.82).setOrigin(0));
    if (!this.mapSize) {
      c.add(this.add.text(width / 2, height / 2, 'Karte wird gezeichnet …', FONT).setOrigin(0.5));
      this.map = c;
      return;
    }
    const side = Math.min(width, height) - 80;
    this.mapImage = this.add.image(width / 2, height / 2 + 10, this.mapTex).setDisplaySize(side, side);
    c.add(this.mapImage);
    c.add(this.add.text(width / 2, height / 2 - side / 2 - 18, `Weltkarte – ${this.seed}`, { ...FONT, fontSize: '16px' }).setOrigin(0.5));
    this.marker = this.add.rectangle(0, 0, 8, 8).setStrokeStyle(2, 0xff3355);
    c.add(this.marker);
    this.map = c;
  }

  private closeMap(): void {
    debugState.mapOpen = false;
    this.map?.destroy();
    this.map = undefined;
    this.mapImage = undefined;
    this.marker = undefined;
  }

  update(): void {
    const ws = this.scene.get('world') as WorldScene;
    const { tx, ty } = ws.focusTile;
    const b = ws.chunks.biomeAt(tx, ty);
    const biomeName = b === undefined ? '…' : BIOMES[b].name;
    debugState.biome = biomeName;
    this.hud.setText(
      [`Welt: ${this.seed}`, `Position: ${tx}, ${ty}`, `Gebiet: ${biomeName}`, `FPS: ${Math.round(this.game.loop.actualFps)}`].join('\n'),
    );
    this.help.setY(this.scale.height - 6);
    this.drawHp();
    if (this.attackButton) {
      const ax = this.scale.width - 60;
      const ay = this.scale.height - 90;
      this.attackButton.setPosition(ax, ay);
      this.attackLabel!.setPosition(ax, ay);
    }
    let bx = this.scale.width - 8;
    for (const { b } of this.touchButtons) {
      b.setPosition(bx, 8);
      bx -= b.width + 8;
    }

    // Namensschild über dem nächsten ansprechbaren NPC
    const near = ws.talkingTo ?? ws.npcs.nearest(ws.player, 80);
    if (near && !this.map) {
      const cam = ws.cameras.main;
      const sx = (near.actor.x - cam.worldView.x) * cam.zoom;
      const sy = (near.actor.y - 52 - cam.worldView.y) * cam.zoom;
      const hint = ws.talkingTo || this.sys.game.device.input.touch ? '' : '  [E]';
      this.nameTag.setText(`${near.spawn.name}${hint}`).setPosition(Math.round(sx), Math.round(sy)).setVisible(true);
    } else {
      this.nameTag.setVisible(false);
    }

    if (this.marker && this.mapImage) {
      const side = this.mapImage.displayWidth;
      const scale = side / (WORLD_TILES * TILE_PX);
      const v = ws.cameras.main.worldView;
      this.marker.setPosition(this.mapImage.x - side / 2 + v.centerX * scale, this.mapImage.y - side / 2 + v.centerY * scale);
      this.marker.setSize(Math.max(6, v.width * scale), Math.max(6, v.height * scale));
    }
  }
}
