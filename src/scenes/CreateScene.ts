import Phaser from 'phaser';
import { buildCharacter, preloadAllParts } from '../character/CharacterFactory';
import { DEFAULT_APPEARANCE, EYE_COLORS, GLOW_COLORS, HAIR_STYLES, normalizeAppearance, type Appearance, type HairStyle, type Race } from '../character/lpc';
import { dress } from '../character/outfit';
import { starterKit, type Item, type Slot } from '../rpg/items';
import { debugState } from '../debug';
import { load, save } from '../game/save';
import { newHero, type Hero } from '../rpg/progression';
import { RACES, RACE_ORDER } from '../rpg/races';
import { npcName } from '../world/npcs';
import { mulberry32 } from '../world/rng';

const FONT = { fontFamily: 'monospace', fontSize: '15px', color: '#f4f0e8' };
const HAIR_COLORS = ['black', 'raven', 'dark_brown', 'chestnut', 'light_brown', 'blonde', 'ginger', 'red', 'platinum', 'white', 'rose', 'blue', 'green', 'violet'];
const HAIR_NAMES: Record<string, string> = {
  plain: 'Kurz', long: 'Lang', bob: 'Bob', spiked: 'Stachelig', messy1: 'Zerzaust', pixie: 'Pixie',
  ponytail: 'Pferdeschwanz', braid: 'Zopf', bangs_bun: 'Dutt', pigtails: 'Zöpfe', none: 'Glatze',
};
const COLOR_NAMES: Record<string, string> = { blue: 'blau', green: 'grün', purple: 'violett', red: 'rot', orange: 'orange', yellow: 'gelb', brown: 'braun', gray: 'grau' };

interface Row {
  label: string | (() => string);
  /** Zeile ausblenden (z. B. Körper beim Synth). */
  hidden?: () => boolean;
  /** Nur bei der Erschaffung änderbar (Volk, Körper, Haut), nicht beim Barbier. */
  fixed?: boolean;
  value: () => string;
  change: (dir: number) => void;
}

/** Erschaffungsbildschirm: Volk, Körper, Haut, Haare, Kleidung, Name. Beim Barbier nur Haare und Kleidung (gegen Splitter). */
export class CreateScene extends Phaser.Scene {
  private seed = '';
  private edit = false;
  /** Preis beim Barbier (Splitter); 0 = Erschaffung */
  private cost = 0;
  private before = '';
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

  init(data: { seed: string; edit?: boolean; cost?: number }): void {
    this.seed = data.seed;
    this.edit = !!data.edit;
    this.cost = data.cost ?? 0;
    this.hero = load<Hero>(`hero:${this.seed}`) ?? newHero();
    this.look = normalizeAppearance({ ...DEFAULT_APPEARANCE, race: 'human', ...this.hero.appearance });
    this.before = JSON.stringify(this.look);
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
    const synth = () => this.look.race === 'synth';
    const all: Row[] = [
      {
        label: 'Volk',
        fixed: true,
        value: () => race().name,
        change: (d) => {
          this.look.race = cycle(RACE_ORDER, this.look.race ?? 'human', d) as Race;
          if (!race().skins.includes(this.look.skin)) this.look.skin = race().skins[0];
        },
      },
      {
        label: 'Körper',
        fixed: true,
        // Synth haben kein Geschlecht
        hidden: () => synth(),
        value: () => (this.look.body === 'male' ? 'männlich' : 'weiblich'),
        change: () => (this.look.body = this.look.body === 'male' ? 'female' : 'male'),
      },
      { label: 'Haut', fixed: true, value: () => this.look.skin, change: (d) => (this.look.skin = cycle(race().skins, this.look.skin, d)) },
      { label: 'Frisur', value: () => HAIR_NAMES[this.look.hair], change: (d) => (this.look.hair = cycle([...HAIR_STYLES, 'none'] as HairStyle[], this.look.hair, d)) },
      { label: 'Haarfarbe', value: () => this.look.hairColor, change: (d) => (this.look.hairColor = cycle(HAIR_COLORS, this.look.hairColor, d)) },
      {
        // Volksmerkmal: Elf Augenfarbe, Synth Leuchtfarbe; Mensch und Ork (noch) keines
        label: () => (synth() ? 'Leuchtfarbe' : 'Augenfarbe'),
        fixed: true,
        hidden: () => this.look.race !== 'elf' && !synth(),
        value: () => COLOR_NAMES[(synth() ? this.look.glow : this.look.eyes) ?? 'blue'] ?? '',
        change: (d) => {
          if (synth()) this.look.glow = cycle(GLOW_COLORS, this.look.glow ?? GLOW_COLORS[0], d);
          else this.look.eyes = cycle(EYE_COLORS, this.look.eyes ?? EYE_COLORS[0], d);
        },
      },
    ];
    this.rows = this.cost ? all.filter((r) => !r.fixed) : all;
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
    const shown = this.visibleRows();
    this.rows[row].change(dir);
    this.look = normalizeAppearance(this.look);
    // Andere Zeilen sichtbar (z. B. Volk gewechselt)? Dann neu aufbauen
    if (this.visibleRows() !== shown) this.layout();
    else this.refresh();
  }

  private visibleRows(): string {
    return this.rows.map((r) => (r.hidden?.() ? 0 : 1)).join('');
  }

  private turn(): void {
    this.dirIndex = (this.dirIndex + 1) % 4;
    this.playPreview();
  }

  private playPreview(): void {
    if (!this.preview) return;
    // Vorschau mit der Startkleidung des Volks (Kleidung kommt im Spiel aus der Ausrüstung)
    const prefix = buildCharacter(this, dress(this.look, this.outfit()), ['walk']);
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
    this.rows.forEach((r, i) => {
      this.texts[i]?.setText(r.value());
      this.labels[i]?.setText(typeof r.label === 'function' ? r.label() : r.label);
    });
    this.priceText?.setText(this.cost ? (this.changed ? `Preis: ${this.cost} ◆ (du hast ${this.hero.shards})` : 'Wähle eine neue Frisur') : '');
    this.raceDesc?.setText(RACES[this.look.race ?? 'human'].desc);
    this.playPreview();
  }

  private raceDesc?: Phaser.GameObjects.Text;
  private labels: Phaser.GameObjects.Text[] = [];
  private priceText?: Phaser.GameObjects.Text;

  private layout(): void {
    this.children.removeAll(true);
    this.texts = [];
    this.labels = [];
    const { width, height } = this.scale;
    const narrow = width < 700;
    const title = this.cost ? 'Beim Barbier' : this.edit ? 'Aussehen ändern' : 'Erschaffe deinen Helden';
    this.add.text(width / 2, 24, title, { ...FONT, fontSize: '24px', color: '#2fe0d8' }).setOrigin(0.5, 0);
    const px = narrow ? width / 2 : width * 0.3;
    const py = narrow ? 200 : height / 2;
    const scale = narrow ? 2.5 : 3.5;
    this.add.ellipse(px, py + 28 * scale, 22 * scale, 6 * scale, 0x2fe0d8, 0.15);
    this.preview = this.add.sprite(px, py, '__DEFAULT').setScale(scale);
    this.raceDesc = this.add.text(px, py + 34 * scale, '', { ...FONT, fontSize: '13px', color: '#ffd84a' }).setOrigin(0.5, 0);

    const x0 = narrow ? 16 : width * 0.52;
    let y = narrow ? 300 : Math.max(70, height / 2 - 250);
    const rowH = narrow ? 36 : 40;
    const btn = (x: number, yy: number, label: string, cb: () => void, name?: string) => {
      const b = this.add
        .text(x, yy, label, { ...FONT, color: '#0b0b14', backgroundColor: '#2fe0d8', padding: { x: 10, y: 5 } })
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', cb);
      if (name) b.setName(name);
      return b;
    };
    this.rows.forEach((r, i) => {
      if (r.hidden?.()) return;
      this.labels[i] = this.add.text(x0, y + 5, '', { ...FONT, color: '#8a8aa0' });
      btn(x0 + 100, y, '◀', () => this.change(i, -1), `row${i}-prev`);
      this.texts[i] = this.add.text(x0 + 190, y + 5, '', FONT).setOrigin(0.5, 0);
      btn(x0 + 250, y, '▶', () => this.change(i, 1), `row${i}-next`);
      y += rowH;
    });
    this.nameInput?.remove();
    this.nameInput = undefined;
    if (this.cost) {
      this.priceText = this.add.text(x0, y + 8, '', { ...FONT, color: '#ffd84a' });
      y += rowH + 14;
      btn(x0, y, 'Abbrechen', () => this.scene.start('world', { seed: this.seed }), 'cancel');
      btn(x0 + 130, y, 'Bezahlen', () => this.confirm(), 'confirm');
      this.refresh();
      return;
    }
    // Name
    this.add.text(x0, y + 8, 'Name', { ...FONT, color: '#8a8aa0' });
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
      this.look = normalizeAppearance(this.look);
    }
    this.name = npcName(rnd);
    // Neu aufbauen: je nach Volk sind andere Zeilen sichtbar (das Namensfeld übernimmt this.name)
    this.layout();
  }

  /** Bei der Erschaffung die Startkleidung des Volks, sonst die angelegte Ausrüstung. */
  private outfit(): Partial<Record<Slot, Item>> {
    if (this.edit) return this.hero.equipped;
    return Object.fromEntries(starterKit(this.look.race ?? 'human', this.look.body).map((i) => [i.slot, i]));
  }

  private get changed(): boolean {
    return JSON.stringify(this.look) !== this.before;
  }

  private confirm(): void {
    const hero = load<Hero>(`hero:${this.seed}`) ?? newHero();
    if (this.cost) {
      if (!this.changed) {
        this.scene.start('world', { seed: this.seed });
        return;
      }
      if (hero.shards < this.cost) {
        this.priceText?.setText(`Zu wenig Splitter (${hero.shards}/${this.cost} ◆)`).setColor('#ff6070');
        return;
      }
      hero.shards -= this.cost;
    }
    hero.appearance = normalizeAppearance({ ...this.look });
    hero.race = this.look.race ?? 'human';
    // Neuer Held: Startkleidung des Volks anlegen (Kleidung kommt aus der Ausrüstung)
    if (!this.edit) {
      for (const it of starterKit(hero.race, hero.appearance.body)) if (!hero.equipped[it.slot]) hero.equipped[it.slot] = it;
      hero.kit = true;
    }
    hero.name = this.name.trim() || 'Namenlos';
    save(`hero:${this.seed}`, hero);
    this.scene.start('world', { seed: this.seed });
  }
}
