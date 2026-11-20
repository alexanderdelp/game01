/** LPC-Charakter: Ebenen, Animationen und Paletten-Umfärbung (ohne Phaser, testbar). */

export const FRAME = 64;

export type BodyType = 'male' | 'female';
export type Material = 'body' | 'hair' | 'cloth' | 'metal' | 'eye' | null;

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
  slash: { frames: 6, rows: 4, frameRate: 24, repeat: 0 },
  thrust: { frames: 8, rows: 4, frameRate: 16, repeat: 0 },
  spellcast: { frames: 7, rows: 4, frameRate: 16, repeat: 0 },
  hurt: { frames: 6, rows: 1, frameRate: 12, repeat: 0 },
};

export const ROWS = ['up', 'left', 'down', 'right'] as const;

export const HAIR_STYLES = ['plain', 'long', 'bob', 'spiked', 'messy1', 'pixie', 'ponytail', 'braid', 'bangs_bun', 'pigtails'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number] | 'none';
/** Frisuren mit Teil hinter dem Kopf (eigene Ebene hinter dem Körper). */
const HAIR_BACK: readonly string[] = ['ponytail', 'braid'];
/** Art des Oberteils aus der Ausrüstung: Stoff (Schnitt in `top`), Leder oder Platte (Metall in `torsoColor`). */
export type TorsoStyle = 'longsleeve' | 'leather' | 'plate';
/** Schnitt eines Stoff-Oberteils. */
export type Top = 'shirt' | 'vneck' | 'scoop' | 'blouse' | 'corset' | 'bare';
export type Shoes = 'shoes' | 'boots' | 'none';

export type Race = 'human' | 'elf' | 'orc' | 'synth';

export interface Appearance {
  race?: Race;
  body: BodyType;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  torso: TorsoStyle;
  torsoColor: string;
  legsColor: string;
  feetColor: string;
  weapon?: 'dagger' | 'none';
  /** Schnitt des Oberteils (Standard: Hemd); Synth trägt stattdessen Panzerplatten in `torsoColor` (Metall). */
  top?: Top;
  /** Schuhwerk (Standard: Schuhe – hohe Stiefel verdecken die Hose fast ganz). */
  shoes?: Shoes;
  /** Hose oder nackte Beine (Standard: Hose). */
  legs?: 'pants' | 'none';
  /** Volksmerkmal Elf: Augenfarbe (Augenpalette). */
  eyes?: string;
  /** Volksmerkmal Synth: Farbe der Leuchtlinien und Augen (Augenpalette). */
  glow?: string;
  /** Oberweite (M30): Stufe 0–3, nur Mensch mit weiblichem Körper (Standard 0 = LPC-Figur). */
  bust?: number;
}

/** Augen- und Leuchtfarben (Namen der LPC-Augenpalette). */
export const EYE_COLORS = ['blue', 'green', 'purple', 'red', 'orange', 'yellow', 'brown', 'gray'];
export const GLOW_COLORS = ['blue', 'green', 'purple', 'red', 'orange', 'yellow'];

/** Wählbare Schnitte je Körper (Ork-Männer haben einen eigenen, muskulösen Körper ohne passende Hemden). */
export function topsFor(a: Pick<Appearance, 'race' | 'body'>): Top[] {
  if (a.race === 'synth') return [];
  if (a.race === 'orc' && a.body === 'male') return ['bare', 'shirt'];
  return a.body === 'female' ? ['shirt', 'vneck', 'scoop', 'blouse', 'corset'] : ['shirt', 'vneck'];
}

/** Metallfarben der Synth-Panzerung. */
export const METALS = ['silver', 'steel', 'iron', 'brass', 'bronze', 'copper', 'gold', 'ceramic'];

/** Stufen des Oberweite-Reglers (M30): 0 = LPC-Figur wie bisher. */
export const BUST_MAX = 3;

/** Oberweite-Regler nur für Menschen mit weiblichem Körper. */
export function bustAllowed(a: Pick<Appearance, 'race' | 'body'>): boolean {
  return (a.race ?? 'human') === 'human' && a.body === 'female';
}

/** Gültige Stufe (alte Spielstände ohne Wert, andere Völker/Körper: 0). */
export function bustLevel(a: Pick<Appearance, 'race' | 'body' | 'bust'>): number {
  if (!bustAllowed(a)) return 0;
  const b = Math.round(Number(a.bust) || 0);
  return Math.max(0, Math.min(BUST_MAX, b));
}

/** Bringt ein (evtl. älteres oder ungültiges) Aussehen in einen gültigen Zustand. */
export function normalizeAppearance(a: Appearance): Appearance {
  const out = { ...a };
  // Synth haben kein Geschlecht: ein Körperbau
  if (out.race === 'synth') out.body = 'male';
  const tops = topsFor(out);
  if (tops.length && !tops.includes(out.top ?? 'shirt')) out.top = tops[0];
  const metal = out.race === 'synth' || out.torso === 'plate';
  if (metal && !METALS.includes(out.torsoColor)) out.torsoColor = METALS[0];
  if (!metal && METALS.includes(out.torsoColor)) out.torsoColor = DEFAULT_APPEARANCE.torsoColor;
  if (out.race !== 'elf') delete out.eyes;
  if (out.race !== 'synth') delete out.glow;
  else out.glow ??= GLOW_COLORS[0];
  // Oberweite nur bei Mensch + weiblich; Stufe 0 wird nicht gespeichert (gleich wie ältere Stände)
  const bust = bustLevel(out);
  if (bust) out.bust = bust;
  else delete out.bust;
  return out;
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
  /** Palette, in der das Quellbild gezeichnet ist (Standard: BASE_PALETTE des Materials). */
  base?: string;
  /** Vorhandene Animationen, falls nicht alle (fehlendes "idle" wird aus Geh-Frame 0 gebildet). */
  anims?: string[];
  /** Augen zusätzlich umfärben (Augenpalette). */
  eyes?: string;
  /** Leuchtlinien: dunkle Fugen einer Metall-Ebene in dieser Farbe (Augenpalette). */
  glow?: string;
}

/** Ebenen in Zeichenreihenfolge (hinten nach vorne). */
export function layersFor(a: Appearance): Layer[] {
  const race = a.race ?? 'human';
  const female = a.body === 'female';
  const thin = female ? 'thin' : 'male';
  // Ork-Männer: muskulöser Körper (deutlich anders gebaut als Mensch/Elf/Synth)
  const muscular = race === 'orc' && !female;
  const weapon = a.weapon && a.weapon !== 'none';
  const layers: Layer[] = [];
  if (weapon) layers.push({ dir: `weapon/${a.weapon}/bg`, material: null, color: '', anims: ['slash', 'walk'] });
  if (HAIR_BACK.includes(a.hair)) layers.push({ dir: `hair/${a.hair}/adult/bg`, material: 'hair', color: a.hairColor });
  layers.push({ dir: `body/bodies/${muscular ? 'muscular' : a.body}`, material: 'body', color: a.skin });
  if (race === 'synth') {
    // Synth: Panzerplatten sind der Körper (Implantate) – mit Leuchtlinien in der Volksfarbe
    const glow = a.glow;
    layers.push(
      { dir: `legs/armour/plate/${thin}`, material: 'metal', color: a.torsoColor, glow },
      { dir: `feet/boots/basic/${thin}`, material: 'cloth', color: 'black' },
      { dir: `torso/armour/plate/${a.body}`, material: 'metal', color: a.torsoColor, glow },
      { dir: `arms/armour/plate/${thin}`, material: 'metal', color: a.torsoColor, glow },
    );
  } else {
    if (a.legs !== 'none') layers.push({ dir: `legs/pants/${muscular ? 'muscular' : thin}`, material: 'cloth', color: a.legsColor });
    if (a.shoes !== 'none') layers.push({ dir: `feet/${a.shoes === 'boots' ? 'boots' : 'shoes'}/basic/${thin}`, material: 'cloth', color: a.feetColor });
    layers.push(...topLayers(a));
  }
  const eyes = race === 'synth' ? a.glow : race === 'elf' ? a.eyes : undefined;
  layers.push(
    race === 'orc'
      ? { dir: `head/heads/orc/${a.body}`, material: 'body', color: a.skin, base: 'green' }
      : { dir: `head/heads/human/${a.body}`, material: 'body', color: a.skin, eyes },
  );
  if (a.hair !== 'none') layers.push({ dir: HAIR_BACK.includes(a.hair) ? `hair/${a.hair}/adult/fg` : `hair/${a.hair}/adult`, material: 'hair', color: a.hairColor });
  if (race === 'elf') layers.push({ dir: 'head/ears/long/adult', material: 'body', color: a.skin });
  if (weapon) layers.push({ dir: `weapon/${a.weapon}/fg`, material: null, color: '', anims: ['slash', 'thrust', 'walk', 'hurt'] });
  return layers;
}

/** Oberteil-Ebenen: Rüstung aus der Ausrüstung oder der gewählte Schnitt. */
function topLayers(a: Appearance): Layer[] {
  const body = a.body === 'female' ? 'female' : 'male';
  const thin = a.body === 'female' ? 'thin' : 'male';
  if (a.torso === 'leather') return [{ dir: `torso/armour/leather/${body}`, material: null, color: '' }];
  if (a.torso === 'plate') {
    return [
      { dir: `torso/armour/plate/${body}`, material: 'metal', color: a.torsoColor },
      { dir: `arms/armour/plate/${thin}`, material: 'metal', color: a.torsoColor },
    ];
  }
  const top = a.top ?? 'shirt';
  const cloth = (dir: string, color = a.torsoColor): Layer => ({ dir, material: 'cloth', color });
  // Bluse und Korsett haben upstream keine Steh-Animation: sie wird aus Geh-Bild 0 gebildet
  const noIdle = (l: Layer): Layer => ({ ...l, anims: ['walk', 'slash', 'thrust', 'spellcast', 'hurt'] });
  switch (top) {
    case 'bare':
      return [];
    case 'vneck':
      return [cloth(`torso/clothes/longsleeve/longsleeve2_vneck/${body}`)];
    case 'scoop':
      return [cloth('torso/clothes/longsleeve/longsleeve2_scoop/female')];
    case 'blouse':
      return [noIdle(cloth('torso/clothes/blouse/female'))];
    case 'corset':
      return [noIdle(cloth('torso/clothes/blouse_longsleeve/female', 'white')), noIdle(cloth('torso/clothes/corset/female'))];
    default:
      return [cloth(`torso/clothes/longsleeve/longsleeve2/${body}`)];
  }
}

export type Palettes = Record<'body' | 'hair' | 'cloth' | 'metal' | 'eye', Record<string, string[]>>;

/** Basis-Palette, in der die LPC-Quellbilder gezeichnet sind. */
export const BASE_PALETTE = { body: 'light', hair: 'orange', cloth: 'white', metal: 'steel', eye: 'blue' } as const;

const hex = (s: string) => parseInt(s.slice(1), 16);

/** Höchster Abstand² (RGB), bis zu dem eine Farbe noch als Palettenfarbe gilt (Farbmanagement verschiebt um wenige Stufen). */
const TOLERANCE2 = 3 * 14 * 14;

/**
 * Färbt RGBA-Pixel in-place von der Basis- auf die Zielpalette um. Farben, die nur leicht von der Basispalette
 * abweichen (Browser mit Farbmanagement), werden der nächstgelegenen Palettenfarbe zugeordnet.
 */
export function recolor(px: Uint8ClampedArray, palettes: Palettes, material: Exclude<Material, null>, target: string, base: string = BASE_PALETTE[material]): void {
  const from = palettes[material][base];
  const to = palettes[material][target];
  if (!from || !to || target === base) return;
  const src = from.map(hex);
  const dst = from.map((_, i) => hex(to[Math.min(i, to.length - 1)]));
  const map = new Map<number, number>();
  src.forEach((c, i) => map.set(c, dst[i]));
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const c = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    let n = map.get(c);
    if (n === undefined) {
      n = -1;
      let best = TOLERANCE2;
      src.forEach((b, k) => {
        const d = ((b >> 16) - px[i]) ** 2 + (((b >> 8) & 255) - px[i + 1]) ** 2 + ((b & 255) - px[i + 2]) ** 2;
        if (d <= best) {
          best = d;
          n = dst[k];
        }
      });
      map.set(c, n);
    }
    if (n < 0) continue;
    px[i] = n >> 16;
    px[i + 1] = (n >> 8) & 255;
    px[i + 2] = n & 255;
  }
}

/** Leuchtlinien: färbt die dunklen Fugen (Stufe 1) einer bereits umgefärbten Metall-Ebene in der Leuchtfarbe. */
export function paintGlow(px: Uint8ClampedArray, palettes: Palettes, metal: string, glow: string): void {
  const seam = palettes.metal[metal]?.[1];
  const light = palettes.eye[glow]?.[2];
  if (!seam || !light) return;
  const from = hex(seam);
  const to = hex(light);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0 || ((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]) !== from) continue;
    px[i] = to >> 16;
    px[i + 1] = (to >> 8) & 255;
    px[i + 2] = to & 255;
  }
}

export function appearanceKey(a: Appearance): string {
  return Object.values(a).join('-');
}
