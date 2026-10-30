/** Deterministische Zufallsfunktionen. Alles hier ist rein und ohne globalen Zustand. */

/** FNV-1a-Hash eines Strings auf 32 Bit (unsigned). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: schneller, guter 32-Bit-PRNG. Liefert Zahlen in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash von (seed, x, y[, salt]) auf 32 Bit – für pro-Kachel-Zufall ohne Reihenfolgeabhängigkeit. */
export function hash2(seed: number, x: number, y: number, salt = 0): number {
  let h = seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Wie hash2, aber als Zahl in [0, 1). */
export function rand2(seed: number, x: number, y: number, salt = 0): number {
  return hash2(seed, x, y, salt) / 4294967296;
}

/** Erzeugt einen gut lesbaren Zufalls-Seed, z. B. "nebel-kristall-427". */
export function randomSeedName(rnd: () => number = Math.random): string {
  const a = ['nebel', 'neon', 'eisen', 'sturm', 'glut', 'mond', 'silber', 'schatten', 'funken', 'drachen', 'chrom', 'rune'];
  const b = ['kristall', 'wald', 'krone', 'schmiede', 'pfad', 'turm', 'herz', 'quelle', 'klinge', 'reich', 'feuer', 'tor'];
  const pick = (arr: string[]) => arr[Math.floor(rnd() * arr.length)];
  return `${pick(a)}-${pick(b)}-${Math.floor(rnd() * 900 + 100)}`;
}
