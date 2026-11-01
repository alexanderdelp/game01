import Phaser from 'phaser';
import { load } from './game/save';
import type { Hero } from './rpg/progression';
import { CreateScene } from './scenes/CreateScene';
import { GAME_TITLE, TitleScene } from './scenes/TitleScene';
import { UIScene } from './scenes/UIScene';
import { WorldScene } from './scenes/WorldScene';
import { ArenaScene } from './arena/ArenaScene';
import { debugState } from './debug';
import { DAY_MS, EPOCH } from './sim/simulation';
import { DEFAULT_YEARS } from './history/simulate';

const params = new URLSearchParams(location.search);
// Ohne Seed in der Adresse startet der Titelbildschirm (Weltauswahl)
const seed = params.get('seed')?.trim() ?? '';
// Testmodus: feste Weltzeit (Mittag) und keine Invasionen → reproduzierbare automatische Tests
if (params.get('test') === '1') {
  debugState.timeOffset = EPOCH + 1000 * DAY_MS + DAY_MS / 2 - Date.now();
  debugState.calm = true;
}

// Legenden-Modus (Vorgeschichte): eigene HTML-Seite ohne Phaser
if (params.get('legends') === '1') {
  void import('./legends/legends').then((m) => m.startLegends(seed || 'nebel-kristall-427', Number(params.get('jahre')) || DEFAULT_YEARS));
} else startGame();

function startGame(): void {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    pixelArt: true,
    input: { gamepad: true },
    backgroundColor: '#0b0b14',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [],
  });

  // Kampf-Arena: nur der Kampf, ohne Welt (zum Ausprobieren von Steuerung und Kampfgefühl)
  const arena = params.get('arena') === '1';
  const hasHero = !!seed && !!load<Hero>(`hero:${seed}`)?.appearance;
  game.scene.add('world', WorldScene, !arena && !!seed && hasHero, { seed });
  game.scene.add('ui', UIScene, false);
  game.scene.add('create', CreateScene, !arena && !!seed && !hasHero, { seed });
  game.scene.add('title', TitleScene, !arena && !seed);
  game.scene.add('arena', ArenaScene, arena);
  document.title = GAME_TITLE;
}
