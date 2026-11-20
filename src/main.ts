import Phaser from 'phaser';
import { load } from './game/save';
import type { Hero } from './rpg/progression';
import { CreateScene } from './scenes/CreateScene';
import { GAME_TITLE, TitleScene } from './scenes/TitleScene';
import { UIScene } from './scenes/UIScene';
import { WorldScene } from './scenes/WorldScene';
import { ArenaScene } from './arena/ArenaScene';
import { PerspectiveScene } from './prototype/PerspectiveScene';
import { debugState } from './debug';
import { DAY_MS, EPOCH } from './sim/simulation';
import { mountBuildInfo } from './env';

const params = new URLSearchParams(location.search);
// Ohne Seed in der Adresse startet der Titelbildschirm (Weltauswahl)
const seed = params.get('seed')?.trim() ?? '';
// Testmodus: feste Weltzeit (Mittag) und keine Invasionen → reproduzierbare automatische Tests
if (params.get('test') === '1') {
  debugState.timeOffset = EPOCH + 1000 * DAY_MS + DAY_MS / 2 - Date.now();
  debugState.calm = true;
}

// Prototyp „Perspektive“: gekippte Bodenebene (eigener WebGL-Canvas unter dem dann durchsichtigen Phaser-Canvas)
const perspektive = params.get('perspektive') === '1';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  input: { gamepad: true },
  backgroundColor: '#0b0b14',
  transparent: perspektive,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [],
});

// Kampf-Arena: nur der Kampf, ohne Welt (zum Ausprobieren von Steuerung und Kampfgefühl)
const arena = params.get('arena') === '1' || perspektive;
const hasHero = !!seed && !!load<Hero>(`hero:${seed}`)?.appearance;
game.scene.add('world', WorldScene, !arena && !!seed && hasHero, { seed });
game.scene.add('ui', UIScene, false);
game.scene.add('create', CreateScene, !arena && !!seed && !hasHero, { seed });
game.scene.add('title', TitleScene, !arena && !seed);
game.scene.add('arena', ArenaScene, arena && !perspektive);
game.scene.add('perspektive', PerspectiveScene, perspektive);
document.title = GAME_TITLE;
mountBuildInfo();
