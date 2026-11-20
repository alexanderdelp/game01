import { DEFAULT_APPEARANCE, normalizeAppearance } from '../character/lpc';
import { starterKit } from '../rpg/items';
import { newHero, type Hero } from '../rpg/progression';
import { on } from './features';
import { load, save } from './save';

/**
 * Gibt es für die Welt einen Helden? Im Kernmodus (ohne System `creation`) wird bei Bedarf ein Standard-Held
 * angelegt, damit das Spiel ohne Erschaffungsbildschirm direkt in der Welt beginnt.
 */
export function ensureHero(seed: string): boolean {
  if (load<Hero>(`hero:${seed}`)?.appearance) return true;
  if (on('creation')) return false;
  const hero = newHero();
  hero.appearance = normalizeAppearance({ ...DEFAULT_APPEARANCE });
  hero.race = hero.appearance.race ?? 'human';
  for (const it of starterKit(hero.race, hero.appearance.body)) hero.equipped[it.slot] = it;
  hero.kit = true;
  hero.name = 'Wanderer';
  save(`hero:${seed}`, hero);
  return true;
}
