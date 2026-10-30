import Phaser from 'phaser';
import { buildCharacter, preloadAllParts } from '../character/CharacterFactory';
import { DEFAULT_APPEARANCE, HAIR_STYLES, type Appearance, type HairStyle, type Race } from '../character/lpc';
import { debugState } from '../debug';
import { load, save } from '../game/save';
import { newHero, type Hero } from '../rpg/progression';
import { RACES, RACE_ORDER } from '../rpg/races';
import { npcName } from '../world/npcs';
import { mulberry32 } from '../world/rng';

const FONT = { fontFamily: 'monospace', fontSize: '15px', color: '#f4f0e8' };
const HAIR_COLORS = ['black', 'raven', 'dark_brown', 'chestnut', 'light_brown', 'blonde', 'ginger', 'red', 'platinum', 'white', 'rose', 'blue', 'green', 'violet'];
const CLOTH = ['teal', 'blue', 'navy', 'sky', 'forest', 'green', 'maroon', 'red', 'rose', 'purple', 'lavender', 'yellow', 'orange', 'brown', 'tan', 'white', 'gray', 'charcoal', 'black'];
const HAIR_NAMES: Record<string, string> = { plain: 'Kurz', long: 'Lang', bob: 'Bob', spiked: 'Stachelig', messy1: 'Zerzaust', pixie: 'Pixie', none: 'Glatze' };

interface Row {
  label: string;
  value: () => string;
  change: (dir: number) => void;
}

/** Erschaffungsbildschirm: Volk, Körper, Haut, Haare, Kleidung, Name. */
export class CreateScene extends Phaser.Scene {
  private seed = '';
  private edit = false;
  private hero!: Hero;
  private look!: Appearance;
  private name = '';
  private preview?: Phaser.GameObjects.Sprite;
  private texts: Phaser.GameObjects.Text[] = [];
  private rows: Row[] = [];
  private nameInput?: HTMLInputElement;
  private dirIndex = 2;
  private builtKeys: string[] = [];

  constructor() {
    super('create');
  }

  init(data: { seed: string; edit?: boolean }): void {
    this.seed = data.seed;
    this.edit = !!data.edit;
    this.hero = load<Hero>(`hero:${this.seed}`) ?? newHero();
    this.look = { ...DEFAULT_APPEARANCE, race: 'human', ...this.hero.appearance };
    this.name = this.hero.name ?? npcName(Math.random);
  }

  preload(): void {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height / 2, 'Lade Figuren …', FONT).setOrigin(0.5);
    this.load.on('complete', () => t.destroy());
    preloadAllParts(this);
  }

  create(): void {
    debugState.scene = 'create';
    this.cameras.main.setBackgroundColor(0x0b0b14);
    const cycle = <T>(arr: readonly T[], cur: T, dir: number) => arr[(arr.indexOf(cur) + dir + arr.length) % arr.length];
    const race = () => RACES[this.look.race ?? 'human'];
    this.rows = [
      {
        label: 'Volk',
        value: () => race().name,
        change: (d) => {
          this.look.race = cycle(RACE_ORDER, this.look.race ?? 'human', d) as Race;
          if (!race().skins.includes(this.look.skin)) this.look.skin = race().skins[0];
        },
      },
      { label: 'Körper', value: () => (this.look.body === 'male' ? 'männlich' : 'weiblich'), change: () => (this.look.body = this.look.body === 'male' ? 'female' : 'male') },
      { label: 'Haut', value: () => this.look.skin, change: (d) => (this.look.skin = cycle(race().skins, this.look.skin, d)) },
      { label: 'Frisur', value: () => HAIR_NAMES[this.look.hair], change: (d) => (this.look.hair = cycle([...HAIR_STYLES, 'none'] as HairStyle[], this.look.hair, d)) },
      { label: 'Haarfarbe', value: () => this.look.hairColor, change: (d) => (this.look.hairColor = cycle(HAIR_COLORS, this.look.hairColor, d)) },
      { label: 'Oberteil', value: () => this.look.torsoColor, change: (d) => (this.look.torsoColor = cycle(CLOTH, this.look.torsoColor, d)) },
      { label: 'Hose', value: () => this.look.legsColor, change: (d) => (this.look.legsColor = cycle(CLOTH, this.look.legsColor, d)) },
      { label: 'Stiefel', value: () => this.look.feetColor, change: (d) => (this.look.feetColor = cycle(['brown', 'black', 'charcoal', 'walnut', 'leather', 'tan', 'maroon'], this.look.feetColor, d)) },
    ];
    this.layout();
    const onResize = () => this.layout();
    this.scale.on('resize', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize));
    this.time.addEvent({ delay: 1500, loop: true, callback: () => this.turn() });
    debugState.createChange = (row: number, dir: number) => this.change(row, dir);
    debugState.createConfirm = (name?: string) => {
      if (name !== undefined) this.name = name;
      this.confirm();
    };
    debugState.createLook = () => ({ ...this.look, name: this.name });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.nameInput?.remove();
      this.nameInput = undefined;
    });
  }

  private change(row: number, dir: number): void {
    this.rows[row].change(dir);
    this.refresh();
  }

  private turn(): void {
    this.dirIndex = (this.dirIndex + 1) % 4;
    this.playPreview();
  }

  private playPreview(): void {
    if (!this.preview) return;
    const prefix = buildCharacter(this, { ...this.look, weapon: 'dagger', torso: 'longsleeve' }, ['walk']);
    if (!this.builtKeys.includes(prefix)) this.builtKeys.push(prefix);
    // Alte Vorschau-Texturen begrenzen
    while (this.builtKeys.length > 12) {
      const old = this.builtKeys.shift()!;
      for (const d of ['up', 'left', 'down', 'right']) this.anims.remove(`${old}:walk:${d}`);
      if (this.textures.exists(`${old}:walk`)) this.textures.remove(`${old}:walk`);
    }
    this.preview.play(`${prefix}:walk:${['up', 'left', 'down', 'right'][this.dirIndex]}`);
  }

  private refresh(): void {
    this.rows.forEach((r, i) => this.texts[i]?.setText(r.value()));
    this.raceDesc?.setText(RACES[this.look.race ?? 'human'].desc);
    this.playPreview();
  }

  private raceDesc?: Phaser.GameObjects.Text;

  private layout(): void {
    this.children.removeAll(true);
    this.texts = [];
    const { width, height } = this.scale;
    const narrow = width < 700;
    const title = this.edit ? 'Aussehen ändern' : 'Erschaffe deinen Helden';
    this.add.text(width / 2, 24, title, { ...FONT, fontSize: '24px', color: '#2fe0d8' }).setOrigin(0.5, 0);
    const px = narrow ? width / 2 : width * 0.3;
    const py = narrow ? 200 : height / 2;
    const scale = narrow ? 2.5 : 3.5;
    this.add.ellipse(px, py + 28 * scale, 22 * scale, 6 * scale, 0x2fe0d8, 0.15);
    this.preview = this.add.sprite(px, py, '__DEFAULT').setScale(scale);
    this.raceDesc = this.add.text(px, py + 34 * scale, '', { ...FONT, fontSize: '13px', color: '#ffd84a' }).setOrigin(0.5, 0);

    const x0 = narrow ? 16 : width * 0.52;
    let y = narrow ? 320 : Math.max(80, height / 2 - 210);
    const rowH = narrow ? 38 : 40;
    const btn = (x: number, yy: number, label: string, cb: () => void, name?: string) => {
      const b = this.add
        .text(x, yy, label, { ...FONT, color: '#0b0b14', backgroundColor: '#2fe0d8', padding: { x: 10, y: 5 } })
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', cb);
      if (name) b.setName(name);
      return b;
    };
    this.rows.forEach((r, i) => {
      this.add.text(x0, y + 5, r.label, { ...FONT, color: '#8a8aa0' });
      btn(x0 + 100, y, '◀', () => this.change(i, -1), `row${i}-prev`);
      this.texts[i] = this.add.text(x0 + 190, y + 5, '', FONT).setOrigin(0.5, 0);
      btn(x0 + 250, y, '▶', () => this.change(i, 1), `row${i}-next`);
      y += rowH;
    });
    // Name
    this.add.text(x0, y + 8, 'Name', { ...FONT, color: '#8a8aa0' });
    this.nameInput?.remove();
    const input = document.createElement('input');
    input.value = this.name;
    input.maxLength = 20;
    input.setAttribute('aria-label', 'Name');
    const rect = this.game.canvas.getBoundingClientRect();
    const sx = rect.width / width;
    Object.assign(input.style, {
      position: 'absolute', left: `${rect.left + (x0 + 100) * sx}px`, top: `${rect.top + y * sx}px`, width: `${150 * sx}px`,
      font: '15px monospace', padding: '6px', background: '#14141f', color: '#f4f0e8', border: '1px solid #2fe0d8',
    });
    input.addEventListener('input', () => (this.name = input.value));
    input.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.appendChild(input);
    this.nameInput = input;
    btn(x0 + 270, y, '🎲', () => {
      this.name = npcName(Math.random);
      input.value = this.name;
    });
    y += rowH + 14;
    btn(x0, y, 'Zufällig', () => this.randomize(), 'random');
    btn(x0 + 120, y, this.edit ? 'Übernehmen' : "Los geht's!", () => this.confirm(), 'confirm');
    this.refresh();
  }

  private randomize(): void {
    const rnd = mulberry32((Math.random() * 2 ** 32) >>> 0);
    for (let i = 0; i < this.rows.length; i++) {
      const n = Math.floor(rnd() * 12);
      for (let k = 0; k < n; k++) this.rows[i].change(1);
    }
    this.name = npcName(rnd);
    if (this.nameInput) this.nameInput.value = this.name;
    this.refresh();
  }

  private confirm(): void {
    const hero = load<Hero>(`hero:${this.seed}`) ?? newHero();
    hero.appearance = { ...this.look };
    hero.race = this.look.race ?? 'human';
    hero.name = this.name.trim() || 'Namenlos';
    save(`hero:${this.seed}`, hero);
    this.scene.start('world', { seed: this.seed });
  }
}
