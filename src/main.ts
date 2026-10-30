import Phaser from 'phaser';
import { load } from './game/save';
import type { Hero } from './rpg/progression';
import { CreateScene } from './scenes/CreateScene';
import { UIScene } from './scenes/UIScene';
import { WorldScene } from './scenes/WorldScene';
import { randomSeedName } from './world/rng';
import './debug';

const params = new URLSearchParams(location.search);
let seed = params.get('seed')?.trim();
if (!seed) {
  seed = randomSeedName();
  params.set('seed', seed);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  backgroundColor: '#0b0b14',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [],
});

const hasHero = !!load<Hero>(`hero:${seed}`)?.appearance;
game.scene.add('world', WorldScene, hasHero, { seed });
game.scene.add('ui', UIScene, false);
game.scene.add('create', CreateScene, !hasHero, { seed });
