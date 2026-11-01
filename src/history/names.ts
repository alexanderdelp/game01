/** Namen der Vorgeschichte je Volk (Silben), Beinamen, Bestien und Artefakte. Rein. */
import type { Race, SiteKind } from './types';

type Rnd = () => number;
const pick = <T>(rnd: Rnd, a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

const PLACE: Record<Race, [readonly string[], readonly string[]]> = {
  human: [
    ['Esch', 'Raben', 'Mond', 'Silber', 'Eisen', 'Sturm', 'Dorn', 'Glut', 'Nebel', 'Stern', 'Weiden', 'Falken', 'Linden', 'Hagel', 'Kupfer', 'Asch', 'Wolfs', 'Bären'],
    ['wald', 'furt', 'hafen', 'brück', 'heim', 'stein', 'tal', 'hall', 'burg', 'grund', 'feld', 'wacht', 'tor', 'quell', 'au', 'bach', 'rode'],
  ],
  elf: [
    ['Ael', 'Sil', 'Ithra', 'Elen', 'Lys', 'Fae', 'Ilva', 'Nim', 'Ser', 'Thal', 'Myr', 'Quel', 'Avel'],
    ['dorin', 'wen', 'aleth', 'iel', 'thas', 'mira', 'laen', 'ost', 'enna', 'ivar', 'ross'],
  ],
  orc: [
    ['Gor', 'Krag', 'Urz', 'Mok', 'Draz', 'Grul', 'Zag', 'Bor', 'Thrak', 'Ruk', 'Vurg'],
    ['gash', 'dun', 'mok', 'rak', 'zul', 'grot', 'nar', 'bur', 'kesh', 'tuk'],
  ],
  synth: [
    ['Knoten', 'Relais', 'Sektor', 'Kern', 'Archiv', 'Schaltwerk', 'Speicher', 'Takt'],
    ['-7', '-Alpha', '-Null', '-IX', '-Omega', '-12', '-Delta', '-3'],
  ],
};

const REALM: Record<Race, [readonly string[], readonly string[]]> = {
  human: [['Var', 'Thar', 'Kor', 'Zan', 'Mor', 'Dra', 'Sev', 'Ost', 'Hal', 'Bren'], ['ion', 'dor', 'heim', 'mark', 'gard', 'land', 'ria', 'enn']],
  elf: [['Ae', 'Ili', 'Ny', 'El', 'Syl', 'Ith'], ['thal', 'esse', 'yr', 'ane', 'loria', 'wyn']],
  orc: [['Ghor', 'Krak', 'Uzz', 'Mor', 'Dur'], ['gath', 'mok', 'rak', 'kar', 'zun']],
  synth: [['Netz', 'Gitter', 'Verbund', 'Matrix'], [' Prime', ' Null', ' IX', ' Kor']],
};

const FIRST: Record<Race, [readonly string[], readonly string[]]> = {
  human: [
    ['Aldric', 'Bertram', 'Konrad', 'Ulrich', 'Gerwin', 'Hagen', 'Ortwin', 'Lothar', 'Ruprecht', 'Wido', 'Falk', 'Eckhard'],
    ['Adela', 'Brunhild', 'Gisela', 'Hedwig', 'Irmgard', 'Mechthild', 'Ottilie', 'Runa', 'Wiltrud', 'Ida', 'Swanhild', 'Reinhild'],
  ],
  elf: [
    ['Aerion', 'Caelith', 'Faelan', 'Ithrel', 'Lorvan', 'Sarethil', 'Thalion', 'Vaelis', 'Elidor'],
    ['Aelira', 'Elowen', 'Ithrea', 'Lysanna', 'Miriel', 'Naeva', 'Sylwen', 'Thessaly', 'Yllan'],
  ],
  orc: [
    ['Grosh', 'Krugg', 'Morgash', 'Urzog', 'Thrak', 'Bolgar', 'Dazgul', 'Ragnok', 'Zurgh'],
    ['Agra', 'Brakka', 'Grisha', 'Murza', 'Shagra', 'Urzula', 'Zogha', 'Kesha'],
  ],
  synth: [
    ['Einheit', 'Vektor', 'Index', 'Faktor', 'Modul', 'Kalibrat'],
    ['Einheit', 'Vektor', 'Index', 'Faktor', 'Modul', 'Kalibrat'],
  ],
};

const EPITHET_M = ['der Kühne', 'der Weise', 'der Grausame', 'der Gerechte', 'der Alte', 'Eisenhand', 'Splitterauge', 'der Stille', 'Sturmbrecher', 'der Fromme', 'Silberzunge', 'der Rote'];
const EPITHET_F = ['die Kühne', 'die Weise', 'die Grausame', 'die Gerechte', 'die Alte', 'Eisenhand', 'Splitterauge', 'die Stille', 'Sturmbrecherin', 'die Fromme', 'Silberzunge', 'die Rote'];

export function placeName(rnd: Rnd, race: Race): string {
  const [a, b] = PLACE[race];
  return `${pick(rnd, a)}${pick(rnd, b)}`;
}

export function realmName(rnd: Rnd, race: Race): string {
  const [a, b] = REALM[race];
  return `${pick(rnd, a)}${pick(rnd, b)}`;
}

export function personName(rnd: Rnd, race: Race, female: boolean): string {
  const base = pick(rnd, FIRST[race][female ? 1 : 0]);
  if (race === 'synth') return `${base} ${Math.floor(rnd() * 90 + 10)}-${pick(rnd, ['K', 'R', 'V', 'X', 'Q'])}`;
  return rnd() < 0.55 ? `${base} ${pick(rnd, female ? EPITHET_F : EPITHET_M)}` : base;
}

/** Großbestien: Art, Wohnbiom-Vorliebe (Biom-IDs), Gegnerart im Spiel. */
export const BEASTS = [
  { kind: 'Aschewurm', art: 'der', biomes: [11, 12, 8], enemy: 'slime' },
  { kind: 'Splitterhydra', art: 'die', biomes: [13, 6, 5], enemy: 'wisp' },
  { kind: 'Rostkoloss', art: 'der', biomes: [14, 8, 11], enemy: 'drone' },
  { kind: 'Nebelmutter', art: 'die', biomes: [6, 4, 5], enemy: 'wisp' },
  { kind: 'Glutgreif', art: 'der', biomes: [11, 7, 18], enemy: 'drone' },
  { kind: 'Frostschlund', art: 'der', biomes: [10, 9, 11], enemy: 'slime' },
] as const;

const BEAST_A = ['Var', 'Skor', 'Ghaz', 'Mal', 'Nyx', 'Ur', 'Thra', 'Vorn', 'Kael', 'Az'];
const BEAST_B = ['grimm', 'garoth', 'zar', 'moth', 'rax', 'oloth', 'ghast', 'vex', 'umbra', 'thrax'];

export function beastName(rnd: Rnd): string {
  return `${pick(rnd, BEAST_A)}${pick(rnd, BEAST_B)}`;
}

/** Artefakt-Arten: Name des Gegenstands und Grundwörter für den Eigennamen. */
export const ARTIFACT_KINDS = ['Klinge', 'Krone', 'Stab', 'Amulett', 'Kern', 'Harnisch', 'Foliant', 'Ring', 'Lanze', 'Maske'] as const;
const ART_OF = ['des Morgenrots', 'der Sieben Winde', 'aus Glas', 'der Stille', 'des Ersten Lichts', 'der Tiefe', 'aus Sternenerz', 'der Wachen Augen', 'des Letzten Königs', 'der Funken', 'aus Rost und Rune', 'der Ewigen Glut'];

export function artifactName(rnd: Rnd, kind: number, race: Race): string {
  const k = ARTIFACT_KINDS[kind];
  if (race === 'synth' || (kind === 4 && rnd() < 0.6)) return `${k} ${pick(rnd, ['Null-Eins', 'Prisma', 'Omega', 'Sigma-9', 'Echo'])}`;
  return `${k} ${pick(rnd, ART_OF)}`;
}

export function worldName(rnd: Rnd): string {
  return `${pick(rnd, ['Ael', 'Myr', 'Cal', 'Ther', 'Vey', 'Or'])}${pick(rnd, ['theron', 'dris', 'avon', 'ensia', 'galoth', 'umbra'])}`;
}

/** Name eines Ortes, der kein Dorf ist. */
export function specialName(rnd: Rnd, kind: SiteKind, race: Race, near: string): string {
  switch (kind) {
    case 'tower': return `Turm von ${placeName(rnd, race)}`;
    case 'lab': return race === 'synth' ? placeName(rnd, 'synth') : `Labor ${placeName(rnd, 'synth')}`;
    case 'temple': return `Tempel des ${pick(rnd, ['Lichts', 'Morgens', 'Sterns', 'Ewigen Feuers', 'Hüters'])} zu ${placeName(rnd, race)}`;
    case 'fortress': return `Feste ${placeName(rnd, race)}`;
    case 'mine': return `Mine ${placeName(rnd, race)}`;
    case 'tomb': return `Grabmal bei ${near}`;
    case 'battlefield': return `Schlachtfeld von ${near}`;
    case 'lair': return `Hort bei ${near}`;
    case 'crater': return `Splitterkrater von ${near}`;
    case 'relic': return `Relikt ${placeName(rnd, 'synth')}`;
    default: return placeName(rnd, race);
  }
}
