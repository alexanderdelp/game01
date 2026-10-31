import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { debugState } from '../debug';
import { load } from '../game/save';
import { createDecorAtlas, ATLAS } from '../render/textures';
import type { Hero } from '../rpg/progression';
import { randomSeedName } from '../world/rng';

const FONT = { fontFamily: 'monospace', fontSize: '16px', color: '#f4f0e8' };
export const GAME_TITLE = 'Splitterwelten';

/** Titelbildschirm: weiterspielen, zuletzt gespielte Welten, neue Welt, eigener Seed. */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  create(): void {
    debugState.scene = 'title';
    createDecorAtlas(this);
    this.cameras.main.setBackgroundColor(0x0b0b14);
    this.layout();
    const onResize = () => this.layout();
    this.scale.on('resize', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize));
    this.input.on('pointerdown', () => audio.unlock());
    debugState.titleStart = (seed: string) => this.start(seed);
  }

  private layout(): void {
    this.children.removeAll(true);
    const { width, height } = this.scale;
    // Kulisse: Wald, Kristalle und ein Neon-Mast
    const ground = height * 0.42;
    this.add.rectangle(0, ground, width, height - ground, 0x1d3a1e).setOrigin(0);
    const props = ['pine:1', 'oak:0', 'crystal:0', 'oak:2', 'pylon:0', 'crystal:2', 'pine:3', 'oak:1', 'crystal:1', 'pine:0'];
    for (let x = -10, i = 0; x < width + 60; x += 58, i++) this.add.image(x, ground + 8 + (i % 2) * 6, ATLAS, props[i % props.length]).setOrigin(0.5, 1).setScale(2);
    const title = this.add.text(width / 2, height * 0.13, GAME_TITLE, { fontFamily: 'monospace', fontSize: width < 500 ? '34px' : '56px', color: '#2fe0d8', stroke: '#0b0b14', strokeThickness: 8 }).setOrigin(0.5);
    this.tweens.add({ targets: title, alpha: 0.8, yoyo: true, repeat: -1, duration: 1400 });
    this.add.text(width / 2, height * 0.13 + (width < 500 ? 32 : 46), 'High-Fantasy trifft Cyberpunk', { ...FONT, fontSize: '14px', color: '#c4a8ff' }).setOrigin(0.5);

    const btn = (y: number, label: string, cb: () => void, primary = false, name = '') => {
      const b = this.add
        .text(width / 2, y, label, { ...FONT, color: '#0b0b14', backgroundColor: primary ? '#2fe0d8' : '#c0c0cc', padding: { x: 14, y: 8 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setName(name);
      b.on('pointerdown', cb);
      return b;
    };
    let y = height * 0.5;
    const recent = (load<string[]>('recent') ?? []).slice(0, 4);
    recent.forEach((seed, i) => {
      const h = load<Hero>(`hero:${seed}`);
      const label = h?.name ? `${i === 0 ? 'Weiterspielen: ' : ''}${h.name} · Stufe ${h.level} · „${seed}“` : `${i === 0 ? 'Weiterspielen: ' : ''}„${seed}“`;
      btn(y, label, () => this.start(seed), i === 0, `recent-${i}`);
      y += 46;
    });
    y += 8;
    btn(y, 'Neue Welt (Zufall)', () => this.start(randomSeedName()), recent.length === 0, 'new');
    y += 46;
    btn(y, 'Welt mit eigenem Namen …', () => {
      const s = window.prompt('Name (Seed) der Welt – gleicher Name = gleiche Welt:')?.trim();
      if (s) this.start(s.slice(0, 40));
    }, false, 'custom');
    this.add.text(width / 2, height - 18, 'Tipp: Gleicher Weltname bei Freunden = dieselbe Welt (Teilen-Link im Spiel).', { ...FONT, fontSize: '11px', color: '#8a8aa0' }).setOrigin(0.5);
  }

  private start(seed: string): void {
    audio.unlock();
    const url = new URL(location.href);
    url.searchParams.set('seed', seed);
    history.replaceState(null, '', url.toString());
    const hasHero = !!load<Hero>(`hero:${seed}`)?.appearance;
    this.scene.start(hasHero ? 'world' : 'create', { seed });
  }
}
