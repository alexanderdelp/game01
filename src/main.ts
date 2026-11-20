import Phaser from 'phaser';
import { CreateScene } from './scenes/CreateScene';
import { GAME_TITLE, TitleScene } from './scenes/TitleScene';
import { UIScene } from './scenes/UIScene';
import { WorldScene } from './scenes/WorldScene';
import { ArenaScene } from './arena/ArenaScene';
import { LabScene } from './lab/LabScene';
import { debugState } from './debug';
import { DAY_MS, EPOCH } from './sim/simulation';
import { mountBuildInfo } from './env';
import { enabledFeatures } from './game/features';
import { ensureHero } from './game/defaultHero';

const params = new URLSearchParams(location.search);
debugState.features = enabledFeatures();
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

// Kampf-Arena: nur der Kampf, ohne Welt (zum Ausprobieren von Steuerung und Kampfgefühl)
// Bewegungslabor (M33): Ausschnitt der echten Welt ohne Weltsysteme
const labor = params.get('labor') === '1';
const arena = params.get('arena') === '1' || labor;
const hasHero = !!seed && !arena && ensureHero(seed);
game.scene.add('world', WorldScene, !arena && !!seed && hasHero, { seed });
game.scene.add('ui', UIScene, false);
game.scene.add('create', CreateScene, !arena && !!seed && !hasHero, { seed });
game.scene.add('title', TitleScene, !arena && !seed);
game.scene.add('arena', ArenaScene, arena && !labor);
game.scene.add('labor', LabScene, labor);
document.title = GAME_TITLE;
mountBuildInfo();
