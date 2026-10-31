import Phaser from 'phaser';
import { load } from './game/save';
import type { Hero } from './rpg/progression';
import { CreateScene } from './scenes/CreateScene';
import { GAME_TITLE, TitleScene } from './scenes/TitleScene';
import { UIScene } from './scenes/UIScene';
import { WorldScene } from './scenes/WorldScene';
import { debugState } from './debug';
import { DAY_MS, EPOCH } from './sim/simulation';

const params = new URLSearchParams(location.search);
// Ohne Seed in der Adresse startet der Titelbildschirm (Weltauswahl)
const seed = params.get('seed')?.trim() ?? '';
// Testmodus: feste Weltzeit (Mittag) und keine Invasionen → reproduzierbare automatische Tests
if (params.get('test') === '1') {
  debugState.timeOffset = EPOCH + 1000 * DAY_MS + DAY_MS / 2 - Date.now();
  debugState.calm = true;
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  input: { gamepad: true },
  backgroundColor: '#0b0b14',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [],
});

const hasHero = !!seed && !!load<Hero>(`hero:${seed}`)?.appearance;
game.scene.add('world', WorldScene, !!seed && hasHero, { seed });
game.scene.add('ui', UIScene, false);
game.scene.add('create', CreateScene, !!seed && !hasHero, { seed });
game.scene.add('title', TitleScene, !seed);
document.title = GAME_TITLE;
