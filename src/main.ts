import Phaser from 'phaser';
import { load } from './game/save';
import type { Hero } from './rpg/progression';
import { CreateScene } from './scenes/CreateScene';
import { GAME_TITLE, TitleScene } from './scenes/TitleScene';
import { UIScene } from './scenes/UIScene';
import { WorldScene } from './scenes/WorldScene';
import './debug';

const params = new URLSearchParams(location.search);
// Ohne Seed in der Adresse startet der Titelbildschirm (Weltauswahl)
const seed = params.get('seed')?.trim() ?? '';

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
