import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyWarp, bustMap, bustMaps, bustWarps, frameAt, headOffset } from '../../src/character/bust';
import { dress } from '../../src/character/outfit';
import { ANIMS, BUST_MAX, DEFAULT_APPEARANCE, FRAME, appearanceKey, bustAllowed, bustLevel, normalizeAppearance, type Appearance } from '../../src/character/lpc';
import { starterKit } from '../../src/rpg/items';
import { decodePng } from '../../tools/png';

const LPC = 'public/assets/lpc/';
const png = (p: string) => decodePng(readFileSync(`${LPC}${p}.png`));
const woman = (a: Partial<Appearance> = {}): Appearance => ({ ...DEFAULT_APPEARANCE, race: 'human', body: 'female', ...a });

describe('M30 – Oberweite: Wert und Regler (R1)', () => {
  it('Regler nur bei Mensch + weiblich', () => {
    expect(bustAllowed({ race: 'human', body: 'female' })).toBe(true);
    expect(bustAllowed({ race: undefined, body: 'female' })).toBe(true);
    expect(bustAllowed({ race: 'human', body: 'male' })).toBe(false);
    for (const race of ['elf', 'orc', 'synth'] as const) expect(bustAllowed({ race, body: 'female' })).toBe(false);
  });

  it('Wert bleibt erhalten, alte Stände ohne Wert = Standard, ungültige Werte werden begrenzt', () => {
    expect(normalizeAppearance(woman({ bust: 2 })).bust).toBe(2);
    expect(normalizeAppearance(woman()).bust).toBeUndefined();
    expect(bustLevel(woman())).toBe(0);
    expect(normalizeAppearance(woman({ bust: 9 })).bust).toBe(BUST_MAX);
    expect(normalizeAppearance(woman({ bust: -1 })).bust).toBeUndefined();
    expect(normalizeAppearance(woman({ bust: Number.NaN })).bust).toBeUndefined();
    // Gespeicherter Wert übersteht JSON (Spielstand) und das Anziehen der Ausrüstung
    const saved = JSON.parse(JSON.stringify(normalizeAppearance(woman({ bust: 3 })))) as Appearance;
    const kit = Object.fromEntries(starterKit('human', 'female').map((i) => [i.slot, i]));
    expect(dress(saved, kit).bust).toBe(3);
  });

  it('andere Völker/Körper verlieren den Wert; Stufe 0 ändert den Figurenschlüssel nicht', () => {
    expect(normalizeAppearance(woman({ race: 'elf', bust: 2 })).bust).toBeUndefined();
    expect(normalizeAppearance(woman({ body: 'male', bust: 2 })).bust).toBeUndefined();
    expect(appearanceKey(normalizeAppearance(woman({ bust: 0 })))).toBe(appearanceKey(normalizeAppearance(woman())));
    expect(appearanceKey(normalizeAppearance(woman({ bust: 1 })))).not.toBe(appearanceKey(normalizeAppearance(woman())));
  });
});

describe('M30 – Verformung (R2)', () => {
  it('verformt Körper und Oberkörper-Ebenen, nicht Kopf, Haare, Beine, Waffe', () => {
    expect(bustWarps('body/bodies/female')).toBe(true);
    expect(bustWarps('torso/clothes/longsleeve/longsleeve2/female')).toBe(true);
    expect(bustWarps('arms/armour/plate/thin')).toBe(true);
    for (const d of ['head/heads/human/female', 'hair/long/adult', 'legs/pants/thin', 'weapon/dagger/fg']) expect(bustWarps(d)).toBe(false);
  });

  it('findet die Lage des Kopfes je Bild (auch verschoben)', () => {
    const walk = png('head/heads/human/female/walk');
    const ref = frameAt(walk.data, walk.width, 0, 2);
    expect(headOffset(ref, ref)).toEqual({ x: 0, y: 0 });
    const moved = new Uint8ClampedArray(ref.length);
    for (let y = 0; y < FRAME - 1; y++) moved.set(ref.subarray(y * FRAME * 4, (y * FRAME + FRAME - 2) * 4), ((y + 1) * FRAME + 2) * 4);
    expect(headOffset(ref, moved)).toEqual({ x: 2, y: 1 });
    expect(headOffset(ref, new Uint8ClampedArray(ref.length))).toBeNull();
  });

  it('Stufe 0 verändert nichts; höhere Stufen verschieben mehr Pixel', () => {
    const counts = [0, 1, 2, 3].map((l) => Array.from(bustMap(3, l, { x: 0, y: 0 })).filter((s) => s !== -1).length);
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[3]).toBeGreaterThan(counts[1]);
  });

  it('Kleidung passt: keine Lücken – unter dem Hemd kommt in keiner Animation neue Haut zum Vorschein', () => {
    const head = 'head/heads/human/female';
    for (const anim of ['walk', 'slash', 'thrust', 'spellcast']) {
      const def = ANIMS[anim];
      const body = png(`body/bodies/female/${anim}`);
      const shirt = png(`torso/clothes/longsleeve/longsleeve2/female/${anim}`);
      const h = png(`${head}/${anim}`);
      const w = png(`${head}/walk`);
      const maps = bustMaps(BUST_MAX, h.data, h.width, def.frames, def.rows, w.data, w.width);
      expect(maps.flat().filter(Boolean).length).toBeGreaterThan(def.frames * def.rows * 0.8);
      // Haut frei (Körper deckend, Hemd nicht) an Pixel i eines Bildes
      const bare = (b: Uint8ClampedArray, s: Uint8ClampedArray, f: number, r: number, i: number) => {
        const k = ((r * FRAME + Math.floor(i / FRAME)) * body.width + f * FRAME + (i % FRAME)) * 4 + 3;
        return b[k] > 0 && s[k] === 0;
      };
      const b0 = body.data.slice();
      const s0 = shirt.data.slice();
      for (const img of [body, shirt]) maps.forEach((row, r) => row.forEach((m, f) => m && applyWarp(img.data, img.width, f, r, m)));
      let gaps = 0;
      maps.forEach((row, r) =>
        row.forEach((m, f) => {
          if (!m) return;
          for (let i = 0; i < FRAME * FRAME; i++) {
            if (!bare(body.data, shirt.data, f, r, i)) continue;
            const src = m[i] === -1 ? i : m[i];
            if (src < 0 || !bare(b0, s0, f, r, src)) gaps++;
          }
        }),
      );
      expect(gaps, anim).toBe(0);
    }
  });

  it('Silhouette wächst in der Seitenansicht nach vorn (Geh-Bild 0, rechts)', () => {
    const shirt = png('torso/clothes/longsleeve/longsleeve2/female/walk');
    const front = (px: Uint8ClampedArray) => {
      let max = 0;
      for (let y = 37; y < 43; y++) for (let x = 0; x < FRAME; x++) if (px[((3 * FRAME + y) * shirt.width + x) * 4 + 3]) max = Math.max(max, x);
      return max;
    };
    const x0 = front(shirt.data);
    applyWarp(shirt.data, shirt.width, 0, 3, bustMap(3, BUST_MAX, { x: 0, y: 0 }));
    expect(front(shirt.data) - x0).toBeGreaterThanOrEqual(2);
    expect(front(shirt.data) - x0).toBeLessThanOrEqual(4);
  });
});
