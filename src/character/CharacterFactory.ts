import Phaser from 'phaser';
import { ANIMS, FRAME, ROWS, appearanceKey, layersFor, recolor, type Appearance, type Palettes } from './lpc';

const BASE = 'assets/lpc/';

/** Lädt die LPC-Bilder einer Erscheinung (im preload einer Szene aufrufen). */
export function preloadCharacter(scene: Phaser.Scene, a: Appearance): void {
  if (!scene.cache.json.exists('lpc-palettes')) scene.load.json('lpc-palettes', `${BASE}palettes.json`);
  for (const layer of layersFor(a)) {
    for (const anim of Object.keys(ANIMS)) {
      const key = `lpc:${layer.dir}/${anim}`;
      if (!scene.textures.exists(key)) scene.load.image(key, `${BASE}${layer.dir}/${anim}.png`);
    }
  }
}

/**
 * Setzt die Ebenen pro Animation zu einem Spritesheet zusammen, färbt sie um und legt die
 * Phaser-Animationen an. Gibt den Schlüssel-Präfix zurück, z. B. "char:<key>".
 */
export function buildCharacter(scene: Phaser.Scene, a: Appearance, anims: string[] = Object.keys(ANIMS)): string {
  const prefix = `char:${appearanceKey(a)}`;
  const palettes = scene.cache.json.get('lpc-palettes') as Palettes;
  const layers = layersFor(a);

  for (const anim of anims) {
    const def = ANIMS[anim];
    if (scene.textures.exists(`${prefix}:${anim}`)) continue;
    const w = def.frames * FRAME;
    const h = def.rows * FRAME;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext('2d', { willReadFrequently: true })!;
    for (const layer of layers) {
      const key = `lpc:${layer.dir}/${anim}`;
      if (!scene.textures.exists(key)) continue;
      const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
      tctx.clearRect(0, 0, w, h);
      tctx.drawImage(src, 0, 0);
      if (layer.material) {
        const img = tctx.getImageData(0, 0, w, h);
        recolor(img.data, palettes, layer.material, layer.color);
        tctx.putImageData(img, 0, 0);
      }
      ctx.drawImage(tmp, 0, 0);
    }
    const texKey = `${prefix}:${anim}`;
    scene.textures.addSpriteSheet(texKey, canvas as unknown as HTMLImageElement, { frameWidth: FRAME, frameHeight: FRAME });

    for (let r = 0; r < def.rows; r++) {
      const dir = def.rows === 1 ? 'any' : ROWS[r];
      // Beim Gehen ist Frame 0 die Standpose und gehört nicht in den Zyklus.
      const start = anim === 'walk' ? 1 : 0;
      scene.anims.create({
        key: `${prefix}:${anim}:${dir}`,
        frames: scene.anims.generateFrameNumbers(texKey, { start: r * def.frames + start, end: r * def.frames + def.frames - 1 }),
        frameRate: def.frameRate,
        repeat: def.repeat,
      });
    }
  }
  return prefix;
}
