/**
 * Handgezeichnete Pixel-Sprites als ASCII-Raster. '.' ist transparent, jedes andere Zeichen
 * wird über die Palette des Sprites auf eine Farbe abgebildet. Kürzere Zeilen werden rechts
 * transparent aufgefüllt.
 */

export interface SpriteDef {
  rows: string[];
  palette: Record<string, number>;
}

const OUT = 0x1a1424;

const leaf = { k: OUT, g: 0x245c26, G: 0x37803a, l: 0x58a84a, L: 0x86cc66, b: 0x7a5232, B: 0x523420 };

export const SPRITES: Record<string, SpriteDef> = {
  oak: {
    palette: leaf,
    rows: [
      '.....kkkkkk.....',
      '...kkGGlLGGkk...',
      '..kGGlLLlGGGGk..',
      '.kGGlLlGGGGgGGk.',
      '.kGlllGGGGGGgGk.',
      'kGGlGGGGgGGGGGgk',
      'kGGGGGGgGGlGGGgk',
      'kgGGGGGGGGlLGggk',
      'kgGGgGGGGGGGGggk',
      '.kgGGGGgGGGGggk.',
      '.kggGGgGGGgggk..',
      '..kkggggggggkk..',
      '....kkkbbkkk....',
      '......kbBk......',
      '......kbBk......',
      '......kbBk......',
      '.....kbbBBk.....',
      '.....kkkkkk.....',
    ],
  },
  pine: {
    palette: { ...leaf, G: 0x2e6b3a, l: 0x3f8a4a, g: 0x1d4a2a },
    rows: [
      '......kk......',
      '.....kGlk.....',
      '.....kGlk.....',
      '....kGGllk....',
      '....kgGGlk....',
      '...kgGGGGlk...',
      '....kgGGGk....',
      '...kgGGGGlk...',
      '..kgGGGGGGlk..',
      '...kggGGGgk...',
      '..kgGGGGGGlk..',
      '.kgGGGGGGGGlk.',
      'kggGGGGGGGGGlk',
      '.kkggggggggkk.',
      '.....kbBk.....',
      '.....kbBk.....',
      '.....kkkk.....',
    ],
  },
  snowpine: {
    palette: { ...leaf, G: 0x2e5b4a, l: 0x3f7a62, g: 0x1d3f34, w: 0xf2f6fa, W: 0xc8d6e4 },
    rows: [
      '......kk......',
      '.....kwwk.....',
      '.....kGWk.....',
      '....kwwwwk....',
      '....kgGGlk....',
      '...kwwWwwwk...',
      '....kgGGGk....',
      '...kwwwWwwk...',
      '..kgGGGGGGlk..',
      '...kWwwwwWk...',
      '..kwwGGGGwwk..',
      '.kgGGGGGGGGlk.',
      'kwwwwWWwwwwWwk',
      '.kkggggggggkk.',
      '.....kbBk.....',
      '.....kbBk.....',
      '.....kkkk.....',
    ],
  },
  palm: {
    palette: { ...leaf, b: 0xa07a48, B: 0x7a5a32 },
    rows: [
      '...kk....kk.....',
      '..kGGk..kGlk....',
      '.kGllGkkGllGkk..',
      'kGl..kGGlGGlLGk.',
      'kG..kGlGGGk.kGGk',
      'k..kGlk.bkGk..kk',
      '...kGk..bB.kGk..',
      '...kk...bBk.kk..',
      '........kbB.....',
      '........kbBk....',
      '.........bBk....',
      '.........kbBk...',
      '.........kbBk...',
      '.........kbBk...',
      '........kbbBBk..',
      '........kkkkkk..',
    ],
  },
  cactus: {
    palette: { k: OUT, g: 0x2f7a3e, G: 0x46a050, l: 0x6cc46a },
    rows: [
      '....kkk....',
      '...kGlGk...',
      '...kGlGk.kk',
      'kk.kGlGkkGk',
      'kGkkGlGkGlk',
      'kGlkGlGkGlk',
      'kGlGGlGGGk.',
      '.kgGGlGGgk.',
      '..kkGlGkk..',
      '...kGlGk...',
      '...kgGgk...',
      '...kkkkk...',
    ],
  },
  deadtree: {
    palette: { k: OUT, b: 0x6e5a48, B: 0x4a3c30 },
    rows: [
      'k......k..k.',
      'bk....kb.kb.',
      '.bk..kb.kb..',
      '..bkkbbkb...',
      '...kbBbB.kk.',
      '....kbBkbb..',
      '....kbBb....',
      '....kbBk....',
      '....kbBk....',
      '...kbbBBk...',
      '...kkkkkk...',
    ],
  },
  bush: {
    palette: leaf,
    rows: [
      '...kkkkk...',
      '.kkGlLlGkk.',
      'kGGlLGGGgGk',
      'kGlGGGgGGgk',
      'kgGGgGGGggk',
      '.kggggggkk.',
      '..kkkkkk...',
    ],
  },
  flowers: {
    palette: { k: OUT, r: 0xe04a5a, y: 0xf2d24a, w: 0xf6f0f0, G: 0x37803a, p: 0xb86ae0 },
    rows: [
      '.r.....y',
      'ryr...yrw',
      '.r..w..y.',
      '.G.wyw.G.',
      '.G..w..G.',
      '..G.G.G..',
    ],
  },
  tuft: {
    palette: { G: 0x37803a, l: 0x6cbc4f, g: 0x2a6a2a },
    rows: [
      '..l...l.',
      'l.Gl.lG.',
      'Gl.GlG.l',
      'gGlgGglG',
    ],
  },
  rock: {
    palette: { k: OUT, s: 0x6a6670, S: 0x8a8690, L: 0xb0acb6 },
    rows: [
      '...kkkk...',
      '..kSLLSk..',
      '.kSLSSSsk.',
      'kSSSSSsssk',
      'ksSSsssssk',
      '.kkkkkkkk.',
    ],
  },
  boulder: {
    palette: { k: OUT, s: 0x5e5a64, S: 0x7c7884, L: 0xa4a0ac, w: 0xe8eef4 },
    rows: [
      '.....kkkkk......',
      '...kkwwLLSkk....',
      '..kLwLLSSSSSk...',
      '.kLLLSSSSSSssk..',
      '.kLSSSSSsSSsssk.',
      'kSSSSSsSSSSSsssk',
      'kSSSsSSSSSSssssk',
      'ksSSSSSSSsssssk.',
      'kssSSsssssssssk.',
      '.kssssssssssskk.',
      '..kkkkkkkkkkk...',
    ],
  },
  reeds: {
    palette: { k: OUT, G: 0x5a7a3a, l: 0x86a84a, b: 0x7a5232 },
    rows: [
      '.b...b..',
      '.b..bb.b',
      '.G..lb.b',
      '.Gl.G..G',
      'lG.GG.lG',
      'GG.Gl.GG',
      'GGlGGlGG',
    ],
  },
  crystal: {
    palette: { k: 0x1a1030, p: 0x6a3ab0, P: 0x9b6af0, L: 0xd8c4ff, w: 0xffffff },
    rows: [
      '.....k.....',
      '....kLk....',
      '....kwPk...',
      '...kLPPk...',
      '...kLPpk.k.',
      '.k.kLPpkkLk',
      'kLkkLPpkLPk',
      'kLPkLPpkPpk',
      'kLPkLPpkPpk',
      'kPpkPPpkpk.',
      '.kppPppppk.',
      '..kkkkkkk..',
    ],
  },
  scrap: {
    palette: { k: OUT, m: 0x4a4a52, M: 0x6c6c78, L: 0x9a9aa6, r: 0x8a4a2a, c: 0x2fe0d8, C: 0x9afff8 },
    rows: [
      '.....kkkk.......',
      '....kMLLMk......',
      '..kkMMLMMmkk....',
      '.kMMmMMcMmMMk...',
      'kMLMmkkCkmMMMk..',
      'kMMmkrrkkmmMMmk.',
      'kmMMkrmrkMcMmmk.',
      '.kmmmkkkmMCmmk..',
      '..kkmmmmmmmkk...',
      '....kkkkkkk.....',
    ],
  },
  pylon: {
    palette: { k: OUT, m: 0x3a3a46, M: 0x5c5c6c, c: 0x2fe0d8, C: 0xc8fffa, p: 0xf04ab0 },
    rows: [
      '....kkk....',
      '...kCCCk...',
      '..kCcCcCk..',
      '...kCCCk...',
      '....kMk....',
      '...kMmMk...',
      '....kck....',
      '....kMk....',
      '....kmk....',
      '....kck....',
      '...kMmMk...',
      '....kmk....',
      '....kpk....',
      '....kMk....',
      '....kmk....',
      '...kMmmk...',
      '..kMMmmmk..',
      '..kkkkkkk..',
    ],
  },
};

/** Zeichnet ein Sprite in RGBA-Pixel. */
export function rasterize(def: SpriteDef, tint?: (c: number) => number): { w: number; h: number; data: Uint8ClampedArray } {
  const h = def.rows.length;
  const w = Math.max(...def.rows.map((r) => r.length));
  const data = new Uint8ClampedArray(w * h * 4);
  def.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      let c = def.palette[ch];
      if (c === undefined) throw new Error(`Unbekannte Farbe '${ch}' im Sprite`);
      if (tint) c = tint(c);
      const i = (y * w + x) * 4;
      data[i] = c >> 16;
      data[i + 1] = (c >> 8) & 255;
      data[i + 2] = c & 255;
      data[i + 3] = 255;
    }
  });
  return { w, h, data };
}
