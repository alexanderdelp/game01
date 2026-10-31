/** Aussehen aus Körper + Ausrüstung (M23): Was die Figur trägt, kommt aus den angelegten Gegenständen. Rein. */
import type { Item, Slot } from '../rpg/items';
import { normalizeAppearance, type Appearance, type Top } from './lpc';

/**
 * Zieht einen Körper (Volk, Haut, Haare, Merkmal) mit der Ausrüstung an. Leere Plätze: schlichte Leinen-Unterkleidung
 * (Ork-Männer mit freiem Oberkörper), barfuß.
 */
export function dress(body: Appearance, equipped: Partial<Record<Slot, Item>>): Appearance {
  // Waffe nur, wenn eine angelegt ist (alles Getragene ist sichtbar)
  const a: Appearance = { ...body, weapon: equipped.weapon ? 'dagger' : 'none' };
  const top = equipped.armor;
  if (top?.base === 'leather') a.torso = 'leather';
  else if (top?.base === 'plate') {
    a.torso = 'plate';
    a.torsoColor = top.color || 'silver';
  } else {
    a.torso = 'longsleeve';
    a.top = (top?.style as Top | undefined) ?? (top ? 'shirt' : body.race === 'orc' && body.body === 'male' ? 'bare' : 'shirt');
    // Ältere Gegenstände ohne Farbe behalten die frühere Kleidungsfarbe
    a.torsoColor = top ? top.color || body.torsoColor : 'white';
  }
  a.legs = 'pants';
  a.legsColor = equipped.legs?.color || (equipped.legs ? body.legsColor : 'white');
  const feet = equipped.feet;
  a.shoes = feet ? (feet.base === 'boots' ? 'boots' : 'shoes') : 'none';
  a.feetColor = feet?.color || body.feetColor;
  // Synth: Panzerung ist der Körper; ihre Metallfarbe kommt von angelegten Platten
  if (body.race === 'synth') a.torsoColor = top?.base === 'plate' ? top.color || 'silver' : 'silver';
  return normalizeAppearance(a);
}
