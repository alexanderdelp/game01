import Phaser from 'phaser';
import { B } from '../world/biomes';

/**
 * Stimmung (M33): ziehender Nebel und Schneefall über dem Bild. Beides liegt fest vor der Kamera (Scroll-Faktor 0)
 * und bekommt jeden Frame Stärke und Biom. Wiederverwendbar für „Der Berg“ im Spiel (M35).
 */
export class Atmosphere {
  private readonly fog: Phaser.GameObjects.TileSprite[] = [];
  private readonly snow: Phaser.GameObjects.Particles.ParticleEmitter;
  private t = 0;
  /** Aktuelle Werte (für Tests) */
  fogAlpha = 0;
  snowRate = 0;

  constructor(private readonly scene: Phaser.Scene) {
    if (!scene.textures.exists('mood-fog')) scene.textures.addCanvas('mood-fog', fogCanvas());
    if (!scene.textures.exists('mood-flake')) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
      g.generateTexture('mood-flake', 2, 2);
      g.destroy();
    }
    for (let i = 0; i < 2; i++) {
      const f = scene.add.tileSprite(0, 0, 64, 64, 'mood-fog').setScrollFactor(0).setDepth(1_400_000 + i).setAlpha(0);
      f.setTileScale(i ? 1.6 : 1);
      this.fog.push(f);
    }
    this.snow = scene.add.particles(0, 0, 'mood-flake', {
      x: { onEmit: () => this.view().x + Math.random() * this.view().w },
      y: { onEmit: () => this.view().y - 8 },
      lifespan: 7000,
      speedY: { min: 28, max: 55 },
      speedX: { min: -22, max: 6 },
      alpha: { start: 0.95, end: 0.6 },
      scale: { min: 0.5, max: 1.2 },
      frequency: -1,
      quantity: 1,
    });
    this.snow.setScrollFactor(0).setDepth(1_399_000);
  }

  /** Sichtbare Fläche in Koordinaten von Objekten mit Scroll-Faktor 0 (die Kamera zoomt um ihre Mitte). */
  private view(): { x: number; y: number; w: number; h: number } {
    const cam = this.scene.cameras.main;
    const w = cam.width / cam.zoom;
    const h = cam.height / cam.zoom;
    return { x: cam.width / 2 - w / 2, y: cam.height / 2 - h / 2, w, h };
  }

  /**
   * @param fog Nebelstärke 0–1, @param height Höhe des Helden (Höheneinheiten), @param snow Schneefall 0–1,
   * @param biome Biom unter dem Helden
   */
  update(dt: number, fog: number, height: number, snow: number, biome: number | undefined): void {
    this.t += dt;
    const cam = this.scene.cameras.main;
    const v = this.view();
    // Nebel: im Tal ein Hauch, oben dicht
    const lift = Phaser.Math.Clamp(0.25 + height / 24, 0.25, 1);
    this.fogAlpha = fog * lift * 0.55;
    this.fog.forEach((f, i) => {
      f.setPosition(v.x + v.w / 2, v.y + v.h / 2).setSize(v.w + 4, v.h + 4);
      f.setTilePosition(cam.scrollX * (0.6 + i * 0.3) + this.t * (10 + i * 7), cam.scrollY * (0.6 + i * 0.3) + this.t * (2 - i * 3));
      f.setAlpha(this.fogAlpha * (i ? 0.7 : 1));
    });
    // Schnee nur, wo es kalt ist
    const cold = biome === B.Snow || biome === B.Peak ? 1 : biome === B.Tundra ? 0.35 : biome === B.Mountain ? 0.2 : 0;
    this.snowRate = snow * cold;
    if (this.snowRate > 0.02) {
      this.snow.frequency = 1000 / (this.snowRate * 90);
      if (!this.snow.emitting) this.snow.start();
    } else if (this.snow.emitting) this.snow.stop();
  }

  destroy(): void {
    this.fog.forEach((f) => f.destroy());
    this.snow.destroy();
  }
}

/** Weiche Nebelschwaden als kachelbare Textur (mehrere Kreise, an den Rändern umgebrochen). */
function fogCanvas(): HTMLCanvasElement {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 30 + rnd() * 60;
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grad.addColorStop(0, 'rgba(226,232,240,0.55)');
        grad.addColorStop(1, 'rgba(226,232,240,0)');
        g.fillStyle = grad;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }
  return c;
}
