import Phaser from 'phaser';
import { applyWarp, bustMaps, bustWarps, type WarpMap } from './bust';
import { ANIMS, DEFAULT_APPEARANCE, FRAME, HAIR_STYLES, ROWS, appearanceKey, layersFor, normalizeAppearance, paintGlow, recolor, topsFor, type Appearance, type Palettes } from './lpc';

const BASE = 'assets/lpc/';

/** Lädt die LPC-Bilder einer Erscheinung (im preload einer Szene aufrufen). */
export function preloadCharacter(scene: Phaser.Scene, a: Appearance): void {
  if (!scene.cache.json.exists('lpc-palettes')) scene.load.json('lpc-palettes', `${BASE}palettes.json`);
  for (const layer of layersFor(normalizeAppearance(a))) {
    for (const anim of layer.anims ?? Object.keys(ANIMS)) {
      const key = `lpc:${layer.dir}/${anim}`;
      if (!scene.textures.exists(key) && !queued.has(key)) {
        queued.add(key);
        scene.load.image(key, `${BASE}${layer.dir}/${anim}.png`);
      }
    }
  }
}

/** Bereits zum Laden angemeldete Bilder (der Erschaffungsbildschirm meldet viele Kombinationen an). */
const queued = new Set<string>();

/** Lädt alle Kleidungsteile, die ein Körper tragen kann (Anlegen von Ausrüstung soll sofort sichtbar sein). */
export function preloadWardrobe(scene: Phaser.Scene, look: Appearance): void {
  for (const torso of ['longsleeve', 'leather', 'plate'] as const) {
    for (const top of torso === 'longsleeve' ? topsFor(look) : [undefined]) {
      for (const shoes of ['shoes', 'boots'] as const) preloadCharacter(scene, { ...look, torso, top, shoes, legs: 'pants' });
    }
  }
}

/** Lädt alle Ebenen, die im Erschaffungsbildschirm wählbar sind. */
export function preloadAllParts(scene: Phaser.Scene): void {
  queued.clear();
  for (const race of ['human', 'elf', 'orc', 'synth'] as const) {
    for (const body of ['male', 'female'] as const) {
      for (const hair of HAIR_STYLES) preloadCharacter(scene, { ...DEFAULT_APPEARANCE, race, body, hair });
      // Startkleidung jedes Volks (Vorschau) und alles, was der Körper tragen kann
      preloadWardrobe(scene, { ...DEFAULT_APPEARANCE, race, body });
    }
  }
}

/**
 * Setzt die Ebenen pro Animation zu einem Spritesheet zusammen, färbt sie um und legt die
 * Phaser-Animationen an. Gibt den Schlüssel-Präfix zurück, z. B. "char:<key>".
 */
export function buildCharacter(scene: Phaser.Scene, a: Appearance, anims: string[] = Object.keys(ANIMS)): string {
  a = normalizeAppearance(a);
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
    const bust = a.bust ? bustFor(scene, layers, anim, a.bust) : null;
    for (const layer of layers) {
      const key = `lpc:${layer.dir}/${anim}`;
      const walkKey = `lpc:${layer.dir}/walk`;
      tctx.clearRect(0, 0, w, h);
      if (scene.textures.exists(key)) {
        tctx.drawImage(scene.textures.get(key).getSourceImage() as HTMLImageElement, 0, 0);
      } else if (anim === 'idle' && scene.textures.exists(walkKey)) {
        // Stehpose aus Geh-Frame 0 jeder Richtung
        const src = scene.textures.get(walkKey).getSourceImage() as HTMLImageElement;
        for (let r = 0; r < def.rows; r++) for (let f = 0; f < def.frames; f++) tctx.drawImage(src, 0, r * FRAME, FRAME, FRAME, f * FRAME, r * FRAME, FRAME, FRAME);
      } else {
        continue;
      }
      const warp = bust && bustWarps(layer.dir);
      if (layer.material || layer.eyes || warp) {
        const img = tctx.getImageData(0, 0, w, h);
        if (layer.material) recolor(img.data, palettes, layer.material, layer.color, layer.base);
        if (layer.eyes) recolor(img.data, palettes, 'eye', layer.eyes);
        if (layer.glow) paintGlow(img.data, palettes, layer.color, layer.glow);
        // Oberweite: Körper und Oberteile gleich verformen (M30)
        if (warp) bust.forEach((row, r) => row.forEach((m, f) => m && applyWarp(img.data, w, f, r, m)));
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

/** Pixel eines geladenen LPC-Bildes. */
function pixels(scene: Phaser.Scene, key: string): { data: Uint8ClampedArray; width: number } | null {
  if (!scene.textures.exists(key)) return null;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  return { data: ctx.getImageData(0, 0, c.width, c.height).data, width: c.width };
}

/** Verformung für die Oberweite (M30): Lage je Bild aus der Kopf-Ebene (fehlende Steh-Animation: Geh-Bild 0). */
function bustFor(scene: Phaser.Scene, layers: ReturnType<typeof layersFor>, anim: string, level: number): (WarpMap | null)[][] | null {
  const head = layers.find((l) => l.dir.startsWith('head/heads/'));
  if (!head) return null;
  // Gleich für alle Figuren mit diesem Kopf und dieser Stufe (Haarfarbe, Kleidung usw. egal)
  const key = `${head.dir}/${anim}/${level}`;
  if (!bustCache.has(key)) bustCache.set(key, computeBust(scene, head.dir, anim, level));
  return bustCache.get(key)!;
}

const bustCache = new Map<string, (WarpMap | null)[][] | null>();

function computeBust(scene: Phaser.Scene, dir: string, anim: string, level: number): (WarpMap | null)[][] | null {
  const head = { dir };
  const walk = pixels(scene, `lpc:${head.dir}/walk`);
  const own = pixels(scene, `lpc:${head.dir}/${anim}`);
  if (!walk) return null;
  const def = ANIMS[anim];
  if (!own) {
    // Stehpose aus Geh-Bild 0: Lage wie dort
    if (anim !== 'idle') return null;
    const one = bustMaps(level, walk.data, walk.width, 1, def.rows, walk.data, walk.width);
    return one.map((row) => Array.from({ length: def.frames }, () => row[0]));
  }
  return bustMaps(level, own.data, own.width, def.frames, def.rows, walk.data, walk.width);
}
