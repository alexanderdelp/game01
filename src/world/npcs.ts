/** Seed-basierte NPCs: wer wo zu Hause ist, wie er heißt, was er sagt. Rein, ohne Phaser. */
import { HAIR_STYLES, topsFor, type Appearance, type HairStyle } from '../character/lpc';
import { B, BIOMES, DECOR_BLOCK } from './biomes';
import { hash2, mulberry32 } from './rng';
import { CHUNK_TILES, type WorldGen } from './WorldGen';

export interface Role {
  id: string;
  name: string;
  lines: string[];
}

export const ROLES: Record<string, Role> = {
  villager: {
    id: 'villager',
    name: 'Bewohner',
    lines: [
      'Willkommen in {town}! Hier bist du sicher.',
      '{realm} wird vom {faction} regiert. {motto}',
      'In {capital} soll es die besten Schmiede geben.',
      'Draußen stehen Obelisken mit alten Schriften. Kannst du sie lesen?',
      'Man sagt, ganz {world} hat eine Geschichte, die keiner mehr kennt.',
    ],
  },
  ruler: {
    id: 'ruler',
    name: 'Herrscher',
    lines: ['{motto}'],
  },
  barber: {
    id: 'barber',
    name: 'Barbier',
    lines: ['Neue Frisur, neue Kleider – neues Glück!'],
  },
  merchant: {
    id: 'merchant',
    name: 'Händlerin',
    lines: ['Splitter gegen Ware, so einfach ist das.'],
  },
  wanderer: {
    id: 'wanderer',
    name: 'Wanderer',
    lines: [
      'Schöner Tag zum Laufen, nicht wahr?',
      'Ich habe gehört, im Norden schneit es selbst im Sommer.',
      'Hinter jedem Hügel wartet ein neues Rätsel.',
      'Pass auf dich auf, Fremder.',
    ],
  },
  hunter: {
    id: 'hunter',
    name: 'Jäger',
    lines: [
      'Psst! Du verscheuchst das Wild.',
      'Die Wälder hier sind älter als jedes Reich.',
      'Manchmal sehe ich nachts blaue Lichter zwischen den Bäumen.',
    ],
  },
  herder: {
    id: 'herder',
    name: 'Hirte',
    lines: [
      'Meine Herde ist irgendwo da drüben … hoffe ich.',
      'Das Gras ist gut dieses Jahr.',
      'Die Händler kommen seltener als früher.',
    ],
  },
  fisher: {
    id: 'fisher',
    name: 'Fischer',
    lines: [
      'Heute beißt nichts. Vielleicht morgen.',
      'Das Meer spült manchmal seltsame Metallteile an.',
      'Weit draußen soll es Inseln geben, die auf keiner Karte stehen.',
    ],
  },
  nomad: {
    id: 'nomad',
    name: 'Nomade',
    lines: [
      'Die Wüste nimmt, die Wüste gibt.',
      'Unter dem Sand liegen Städte aus Glas und Stahl.',
      'Wasser ist hier mehr wert als Gold.',
    ],
  },
  hermit: {
    id: 'hermit',
    name: 'Eremit',
    lines: [
      'Die Kälte hält die Gedanken klar.',
      'Ich suche nichts. Und finde trotzdem.',
      'Auf den Gipfeln schlafen alte Dinge.',
    ],
  },
  crystalseeker: {
    id: 'crystalseeker',
    name: 'Kristallsucherin',
    lines: [
      'Hörst du das Summen? Die Kristalle singen.',
      'Ein einziger Splitter treibt eine Maschine einen Monat lang.',
      'Die Magier und die Technokraten streiten sich um jeden Hain.',
    ],
  },
  scavenger: {
    id: 'scavenger',
    name: 'Schrottsammler',
    lines: [
      'Alles hier war mal eine Stadt. Jetzt ist es mein Laden.',
      'Wenn die Masten leuchten, ist irgendwo noch Strom.',
      'Ich tausche Zahnräder gegen Geschichten.',
    ],
  },
};

/** Welche Rollen in welchem Biom vorkommen und wie häufig NPCs dort sind (pro Chunk). */
const BIOME_NPCS: Partial<Record<B, { chance: number; roles: string[] }>> = {
  [B.Beach]: { chance: 0.62, roles: ['fisher', 'wanderer'] },
  [B.Grassland]: { chance: 0.75, roles: ['herder', 'wanderer', 'wanderer'] },
  [B.Forest]: { chance: 0.5, roles: ['hunter', 'wanderer'] },
  [B.Jungle]: { chance: 0.38, roles: ['hunter'] },
  [B.Swamp]: { chance: 0.25, roles: ['hermit', 'hunter'] },
  [B.Savanna]: { chance: 0.5, roles: ['herder', 'nomad'] },
  [B.Desert]: { chance: 0.3, roles: ['nomad'] },
  [B.Tundra]: { chance: 0.25, roles: ['hermit', 'hunter'] },
  [B.Snow]: { chance: 0.15, roles: ['hermit'] },
  [B.Mountain]: { chance: 0.15, roles: ['hermit'] },
  [B.CrystalGrove]: { chance: 0.88, roles: ['crystalseeker', 'crystalseeker', 'wanderer'] },
  [B.ScrapWastes]: { chance: 0.88, roles: ['scavenger', 'scavenger', 'nomad'] },
};

export interface NpcSpawn {
  id: string;
  tx: number;
  ty: number;
  role: string;
  name: string;
  archetype: number;
}

export const ARCHETYPES = 16;

const FIRST_FANTASY = ['Kael', 'Mira', 'Thorn', 'Elva', 'Brann', 'Lysa', 'Oren', 'Sela', 'Dorn', 'Ilka', 'Ravel', 'Nyra', 'Tamsin', 'Joran'];
const FIRST_CYBER = ['Vex', 'Nova', 'Juno', 'Kit', 'Rook', 'Zia', 'Pax', 'Echo'];
const LAST = ['Voss', 'Eschwald', 'Kranich', 'Rabenstein', 'Lichtweber', 'Ferro', 'Silberhand', 'Nachtigall', 'Stahlherz', 'Mondfeld'];

export function npcName(rnd: () => number): string {
  if (rnd() < 0.2) return `${FIRST_CYBER[Math.floor(rnd() * FIRST_CYBER.length)]}-${Math.floor(rnd() * 90 + 10)}`;
  return `${FIRST_FANTASY[Math.floor(rnd() * FIRST_FANTASY.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`;
}

/** NPCs, die in einem Chunk zu Hause sind (0–3, in Ortsmitten Händler und Bewohner). */
export function npcsForChunk(world: WorldGen, cx: number, cy: number): NpcSpawn[] {
  const rnd = mulberry32(hash2(world.seed, cx, cy, 4242));
  const out: NpcSpawn[] = [];
  for (const s of world.meta.settlements) {
    if (Math.floor(s.tx / CHUNK_TILES) !== cx || Math.floor(s.ty / CHUNK_TILES) !== cy) continue;
    const srnd = mulberry32(hash2(world.seed, s.tx, s.ty, 4343));
    out.push({ id: `m${s.id}`, tx: s.tx - 2, ty: s.ty + 2, role: 'merchant', name: npcName(srnd), archetype: Math.floor(srnd() * ARCHETYPES) });
    // Barbier mit eigenem Zufallsstrom, damit die übrigen Bewohner des Orts gleich bleiben
    const brnd = mulberry32(hash2(world.seed, s.tx, s.ty, 4444));
    out.push({ id: `b${s.id}`, tx: s.tx + 2, ty: s.ty + 2, role: 'barber', name: npcName(brnd), archetype: Math.floor(brnd() * ARCHETYPES) });
    if (s.capital) out.push({ id: `r${s.id}`, tx: s.tx + 2, ty: s.ty - 2, role: 'ruler', name: npcName(srnd), archetype: Math.floor(srnd() * ARCHETYPES) });
    const n = s.capital ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const a = srnd() * Math.PI * 2;
      const d = 2 + srnd() * (s.radius - 3);
      const tx = Math.round(s.tx + Math.cos(a) * d);
      const ty = Math.round(s.ty + Math.sin(a) * d);
      if (!BIOMES[world.biomeAt(tx, ty)].walkable || world.decorationAt(tx, ty)) continue;
      out.push({ id: `v${s.id},${i}`, tx, ty, role: 'villager', name: npcName(srnd), archetype: Math.floor(srnd() * ARCHETYPES) });
    }
  }
  if (world.meta.settlementNear(cx * CHUNK_TILES + CHUNK_TILES / 2, cy * CHUNK_TILES + CHUNK_TILES / 2, 4)) return out;
  const tries = 3;
  for (let i = 0; i < tries; i++) {
    const tx = cx * CHUNK_TILES + Math.floor(rnd() * CHUNK_TILES);
    const ty = cy * CHUNK_TILES + Math.floor(rnd() * CHUNK_TILES);
    const roll = rnd();
    const b = world.biomeAt(tx, ty);
    const cfg = BIOME_NPCS[b];
    if (!cfg || roll > cfg.chance / tries || !BIOMES[b].walkable) continue;
    const deco = world.decorationAt(tx, ty, b);
    if (deco && DECOR_BLOCK[deco.kind]) continue;
    const role = cfg.roles[Math.floor(rnd() * cfg.roles.length)];
    out.push({ id: `${cx},${cy},${i}`, tx, ty, role, name: npcName(rnd), archetype: Math.floor(rnd() * ARCHETYPES) });
  }
  return out;
}

const SKINS = ['light', 'amber', 'olive', 'taupe', 'bronze', 'brown', 'black', 'lavender', 'blue', 'pale_green'];
const HAIR_COLORS = ['black', 'raven', 'dark_brown', 'chestnut', 'blonde', 'ginger', 'platinum', 'white', 'rose', 'blue', 'green', 'violet'];
const CLOTH = ['brown', 'leather', 'walnut', 'tan', 'maroon', 'red', 'blue', 'navy', 'teal', 'forest', 'green', 'gray', 'charcoal', 'white', 'purple', 'slate'];

/** Die Aussehen-Archetypen einer Welt (seed-basiert). */
export function archetypes(seed: number): Appearance[] {
  const rnd = mulberry32(seed ^ 0xa11ce);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
  const list: Appearance[] = [];
  for (let i = 0; i < ARCHETYPES; i++) {
    // Fantasy-Hauttöne seltener
    const skin = rnd() < 0.8 ? pick(SKINS.slice(0, 7)) : pick(SKINS.slice(7));
    list.push({
      body: rnd() < 0.5 ? 'male' : 'female',
      skin,
      hair: (rnd() < 0.08 ? 'none' : pick(HAIR_STYLES)) as HairStyle,
      hairColor: pick(HAIR_COLORS),
      torso: rnd() < 0.25 ? 'leather' : 'longsleeve',
      torsoColor: pick(CLOTH),
      legsColor: pick(CLOTH),
      feetColor: pick(['brown', 'black', 'charcoal', 'walnut', 'leather']),
    });
    // Schnitt ohne weiteren Zufallswert ableiten, damit die übrigen Archetypen der Welt gleich bleiben
    const last = list[list.length - 1];
    const tops = topsFor(last);
    last.top = tops[i % tops.length];
  }
  return list;
}

/** Wählt ein Wanderziel im Umkreis `radius` Kacheln um das Zuhause. */
export function wanderTarget(home: { tx: number; ty: number }, radius: number, rnd: () => number, walkable: (tx: number, ty: number) => boolean): { tx: number; ty: number } | null {
  for (let i = 0; i < 8; i++) {
    const tx = home.tx + Math.round((rnd() * 2 - 1) * radius);
    const ty = home.ty + Math.round((rnd() * 2 - 1) * radius);
    if (walkable(tx, ty)) return { tx, ty };
  }
  return null;
}
