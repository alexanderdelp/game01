/** LPC-Charakter: Ebenen, Animationen und Paletten-Umfärbung (ohne Phaser, testbar). */

export const FRAME = 64;

export type BodyType = 'male' | 'female';
export type Material = 'body' | 'hair' | 'cloth' | null;

export interface AnimDef {
  frames: number;
  /** Anzahl Zeilen: 4 Richtungen (oben, links, unten, rechts) oder 1. */
  rows: 1 | 4;
  frameRate: number;
  repeat: number;
}

export const ANIMS: Record<string, AnimDef> = {
  walk: { frames: 9, rows: 4, frameRate: 10, repeat: -1 },
  idle: { frames: 2, rows: 4, frameRate: 2, repeat: -1 },
  slash: { frames: 6, rows: 4, frameRate: 16, repeat: 0 },
  thrust: { frames: 8, rows: 4, frameRate: 16, repeat: 0 },
  spellcast: { frames: 7, rows: 4, frameRate: 12, repeat: 0 },
  hurt: { frames: 6, rows: 1, frameRate: 12, repeat: 0 },
};

export const ROWS = ['up', 'left', 'down', 'right'] as const;

export const HAIR_STYLES = ['plain', 'long', 'bob', 'spiked', 'messy1', 'pixie'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number] | 'none';
export type TorsoStyle = 'longsleeve' | 'leather';

export interface Appearance {
  body: BodyType;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  torso: TorsoStyle;
  torsoColor: string;
  legsColor: string;
  feetColor: string;
  weapon?: 'dagger' | 'none';
}

export const DEFAULT_APPEARANCE: Appearance = {
  body: 'male',
  skin: 'olive',
  hair: 'spiked',
  hairColor: 'raven',
  torso: 'longsleeve',
  torsoColor: 'teal',
  legsColor: 'charcoal',
  feetColor: 'brown',
  weapon: 'dagger',
};

export interface Layer {
  /** Pfad unter assets/lpc ohne Animation, z. B. "body/bodies/male". */
  dir: string;
  material: Material;
  color: string;
  /** Vorhandene Animationen, falls nicht alle (fehlendes "idle" wird aus Geh-Frame 0 gebildet). */
  anims?: string[];
}

/** Ebenen in Zeichenreihenfolge (hinten nach vorne). */
export function layersFor(a: Appearance): Layer[] {
  const thin = a.body === 'female' ? 'thin' : 'male';
  const weapon = a.weapon && a.weapon !== 'none';
  const layers: Layer[] = [];
  if (weapon) layers.push({ dir: `weapon/${a.weapon}/bg`, material: null, color: '', anims: ['slash', 'walk'] });
  layers.push(
    { dir: `body/bodies/${a.body}`, material: 'body', color: a.skin },
    { dir: `legs/pants/${thin}`, material: 'cloth', color: a.legsColor },
    { dir: `feet/boots/basic/${thin}`, material: 'cloth', color: a.feetColor },
    a.torso === 'leather'
      ? { dir: `torso/armour/leather/${a.body}`, material: null, color: '' }
      : { dir: `torso/clothes/longsleeve/longsleeve2/${a.body}`, material: 'cloth', color: a.torsoColor },
    { dir: `head/heads/human/${a.body}`, material: 'body', color: a.skin },
  );
  if (a.hair !== 'none') layers.push({ dir: `hair/${a.hair}/adult`, material: 'hair', color: a.hairColor });
  if (weapon) layers.push({ dir: `weapon/${a.weapon}/fg`, material: null, color: '', anims: ['slash', 'thrust', 'walk', 'hurt'] });
  return layers;
}

export type Palettes = Record<'body' | 'hair' | 'cloth', Record<string, string[]>>;

/** Basis-Palette, in der die LPC-Quellbilder gezeichnet sind. */
export const BASE_PALETTE = { body: 'light', hair: 'orange', cloth: 'white' } as const;

const hex = (s: string) => parseInt(s.slice(1), 16);

/** Färbt RGBA-Pixel in-place von der Basis- auf die Zielpalette um. */
export function recolor(px: Uint8ClampedArray, palettes: Palettes, material: Exclude<Material, null>, target: string): void {
  const from = palettes[material][BASE_PALETTE[material]];
  const to = palettes[material][target];
  if (!from || !to || target === BASE_PALETTE[material]) return;
  const map = new Map<number, number>();
  from.forEach((c, i) => map.set(hex(c), hex(to[Math.min(i, to.length - 1)])));
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const c = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    const n = map.get(c);
    if (n === undefined) continue;
    px[i] = n >> 16;
    px[i + 1] = (n >> 8) & 255;
    px[i + 2] = n & 255;
  }
}

export function appearanceKey(a: Appearance): string {
  return Object.values(a).join('-');
}
