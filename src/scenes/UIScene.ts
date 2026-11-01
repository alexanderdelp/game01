import Phaser from 'phaser';
import { debugState } from '../debug';
import { TILE_PX } from '../render/chunkPixels';
import { touchInput } from '../game/input';
import { xpToNext } from '../rpg/progression';
import { MAX_ACTIVE, abandon, areaText, isReady, progressText, questTarget, type QuestTarget } from '../quests/quests';
import { BannerQueue, type BannerItem } from '../ui/bannerQueue';
import { WorldMap } from '../ui/WorldMap';
import { HeroPanel } from '../ui/HeroPanel';
import { worldNow } from '../sim/LiveWorld';
import { clockText, daylight, type News } from '../sim/simulation';
import { audio } from '../audio/audio';
import { load, save } from '../game/save';
import { BIOMES } from '../world/biomes';
import { randomSeedName } from '../world/rng';
import type { WorldScene } from './WorldScene';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#f4f0e8' };

/** HUD und Weltkarte, gezeichnet ohne Kamera-Zoom über der Welt. */
export class UIScene extends Phaser.Scene {
  private hud!: Phaser.GameObjects.Text;
  private help!: Phaser.GameObjects.Text;
  /** Weltkarte und Minimap (src/ui/WorldMap.ts) */
  private worldMap!: WorldMap;
  private seed = '';

  constructor() {
    super('ui');
  }

  init(data: { seed: string }): void {
    this.seed = data.seed;
    // Szene kann neu gestartet werden: Verweise auf alte (zerstörte) Objekte verwerfen.
    this.hpText = undefined;
    this.xpText = undefined;
    this.dialog = undefined;
    this.attackButton = undefined;
    this.attackLabel = undefined;
    this.touchButtons = [];
    this.questLog = undefined;
    this.remoteTexts = [];
    this.bubbleTexts = [];
    this.chronicle = undefined;
    this.newsPanel = undefined;
    this.sharePanel = undefined;
    this.menu = undefined;
    this.actionButton = undefined;
    this.potionButton = undefined;
    this.spellButton = undefined;
    this.drops = [];
    this.bannerObj = undefined;
    this.banners = new BannerQueue();
    this.lastPos = null;
    this.markerTexts = [];
    debugState.panelOpen = false;
    debugState.tipsShown = 0;
    debugState.menuOpen = false;
  }

  create(): void {
    this.heroPanel = new HeroPanel(this);
    debugState.clickPanel = (name: string) => this.clickPanel(name);
    this.createAtmosphere();
    this.hud = this.add.text(8, 8, '', { ...FONT, backgroundColor: '#0b0b14cc', padding: { x: 6, y: 4 } });
    this.help = this.add
      .text(8, 0, this.sys.game.device.input.touch ? 'Ziehen: laufen' : 'WASD laufen · Leertaste Angriff · K Zauber · E reden/benutzen · Q Trank · M Karte · H Menü', {
        ...FONT,
        fontSize: '12px',
        backgroundColor: '#0b0b14cc',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0, 1);

    const kb = this.input.keyboard!;
    kb.on('keydown-M', () => this.worldMap.toggle());
    kb.on('keydown-N', () => {
      const url = new URL(location.href);
      url.searchParams.set('seed', randomSeedName());
      location.href = url.toString();
    });

    this.createTouchControls();
    this.nameTag = this.add
      .text(0, 0, '', { ...FONT, fontSize: '12px', backgroundColor: '#0b0b14aa', padding: { x: 4, y: 2 } })
      .setOrigin(0.5, 1)
      .setDepth(5)
      .setVisible(false);
    this.hpBar = this.add.graphics().setDepth(6);
    const ws = this.scene.get('world') as WorldScene;
    const onDamage = (d: { x: number; y: number; amount: number; color: string }) => this.floatText({ ...d, text: String(d.amount) });
    const onFloat = (d: { x: number; y: number; text: string; color: string }) => this.floatText({ ...d, small: true });
    const onLevel = (lvl: number) => this.banner(`Stufe ${lvl}!`, 'Talentpunkt erhalten – C: Heldenfenster');
    const onHero = () => this.panel && this.heroPanel.build();
    ws.events.on('damage', onDamage);
    ws.events.on('float', onFloat);
    ws.events.on('level-up', onLevel);
    ws.events.on('hero-changed', onHero);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ws.events.off('damage', onDamage);
      ws.events.off('float', onFloat);
      ws.events.off('level-up', onLevel);
      ws.events.off('hero-changed', onHero);
    });
    kb.on('keydown-C', () => this.togglePanel());
    kb.on('keydown-L', () => this.toggleQuestLog());
    kb.on('keydown-B', () => this.toggleChronicle());
    kb.on('keydown-U', () => this.toggleNews());
    kb.on('keydown-G', () => this.toggleShare());
    kb.on('keydown-H', () => this.toggleMenu());
    const onSummary = (d: { hours: number; news: News[]; title?: string }) => this.showNews(d.title ?? `Während du weg warst (${d.hours} Std.) …`, d.news);
    ws.events.on('news-summary', onSummary);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ws.events.off('news-summary', onSummary));
    const onBanner = (b: { title: string; sub: string }) => this.banner(b.title, b.sub, true);
    // Klänge
    const onSfx = (n: Parameters<typeof audio.sfx>[0]) => audio.sfx(n);
    const onAtk = () => audio.sfx('attack');
    const onDmg = (d: { color: string }) => audio.sfx(d.color === '#ff6070' ? 'hurt' : 'hit');
    const onLvl = () => audio.sfx('levelup');
    ws.events.on('sfx', onSfx);
    ws.events.on('player-attack', onAtk);
    ws.events.on('damage', onDmg);
    ws.events.on('level-up', onLvl);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ws.events.off('sfx', onSfx);
      ws.events.off('player-attack', onAtk);
      ws.events.off('damage', onDmg);
      ws.events.off('level-up', onLvl);
    });
    this.input.on('pointerdown', () => {
      audio.unlock();
      this.banners.noteClicked();
    });
    kb.on('keydown', () => audio.unlock());
    this.startTips(ws);
    const onChron = () => this.chronicle && this.buildChronicle();
    ws.events.on('banner', onBanner);
    ws.events.on('chronicle-changed', onChron);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ws.events.off('banner', onBanner);
      ws.events.off('chronicle-changed', onChron);
    });
    const onQuests = () => this.questLog && this.buildQuestLog();
    ws.events.on('quests-changed', onQuests);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ws.events.off('quests-changed', onQuests));
    this.tracker = this.add.text(0, 0, '', { ...FONT, fontSize: '13px', backgroundColor: '#0b0b14cc', padding: { x: 6, y: 4 }, align: 'right' }).setOrigin(1, 0).setDepth(6);
    this.arrow = this.add.graphics().setDepth(6);
    this.arrowLabel = this.add.text(0, 0, '', { ...FONT, fontSize: '13px', stroke: '#0b0b14', strokeThickness: 4 }).setOrigin(0.5).setDepth(6);
    this.markerTexts = [];
    kb.on('keydown-I', () => this.togglePanel());
    kb.on('keydown-ESC', () => {
      if (this.panel) this.togglePanel();
      else if (this.worldMap.isOpen) this.worldMap.close();
    });
    const onDied = () => {
      const t = this.add.text(this.scale.width / 2, this.scale.height / 2, 'Du bist gefallen …', { ...FONT, fontSize: '22px' }).setOrigin(0.5).setDepth(40);
      ws.events.once('player-respawned', () => t.destroy());
    };
    ws.events.on('player-died', onDied);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ws.events.off('player-died', onDied));
    const onTalk = (d: { name: string; role: string; text: string; choices?: string[] } | null) => this.showDialog(d);
    ws.events.on('talk', onTalk);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ws.events.off('talk', onTalk));

    this.worldMap = new WorldMap(this, this.seed, () => 8 + (this.touchButtons.length ? Math.ceil(this.touchButtons.length / 3) * 40 : 0));

    // M29: Abzeichen im HUD, solange der Spielleiter-Modus an ist; offene Karte neu zeichnen
    this.gmBadge = this.add
      .text(0, 8, 'GM', { ...FONT, fontSize: '16px', color: '#0b0b14', backgroundColor: '#ff3355', padding: { x: 8, y: 3 }, fontStyle: 'bold' })
      .setDepth(45)
      .setName('gm-badge')
      .setVisible(ws.gm);
    debugState.gmBadge = ws.gm;
    const onGm = (on: boolean) => {
      this.gmBadge.setVisible(on);
      debugState.gmBadge = on;
      this.worldMap.refresh();
    };
    ws.events.on('gm-changed', onGm);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ws.events.off('gm-changed', onGm));
  }

  private gmBadge!: Phaser.GameObjects.Text;

  /** Virtueller Stick (Ziehen irgendwo auf dem Bildschirm) und Buttons für Touch-Geräte. */
  private createTouchControls(): void {
    const base = this.add.circle(0, 0, 34, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.35).setVisible(false).setDepth(20);
    const knob = this.add.circle(0, 0, 14, 0xffffff, 0.4).setVisible(false).setDepth(21);
    let pointerId = -1;
    const onButton = (p: Phaser.Input.Pointer) => this.input.hitTestPointer(p).length > 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (pointerId !== -1 || onButton(p) || this.worldMap.isOpen || this.panel || this.questLog || this.chronicle || this.newsPanel || this.sharePanel || this.menu) return;
      pointerId = p.id;
      base.setPosition(p.x, p.y).setVisible(true);
      knob.setPosition(p.x, p.y).setVisible(true);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== pointerId) return;
      const dx = p.x - base.x;
      const dy = p.y - base.y;
      const len = Math.hypot(dx, dy);
      const max = 34;
      const k = len > max ? max / len : 1;
      knob.setPosition(base.x + dx * k, base.y + dy * k);
      touchInput.x = len < 6 ? 0 : (dx * k) / max;
      touchInput.y = len < 6 ? 0 : (dy * k) / max;
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== pointerId) return;
      pointerId = -1;
      base.setVisible(false);
      knob.setVisible(false);
      touchInput.x = 0;
      touchInput.y = 0;
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    if (!this.sys.game.device.input.touch) return;
    const ws = () => this.scene.get('world') as WorldScene;
    // Großer Angriffsbutton unten rechts
    this.attackButton = this.add.circle(0, 0, 36, 0xe04a5a, 0.45).setStrokeStyle(3, 0xffffff, 0.6).setDepth(30).setInteractive();
    this.attackButton.on('pointerdown', () => ws().attack());
    this.attackLabel = this.add.text(0, 0, '⚔', { ...FONT, fontSize: '26px' }).setOrigin(0.5).setDepth(31);
    // Aktionsknopf (Reden/Benutzen) und Trank links daneben
    this.actionButton = this.add.circle(0, 0, 26, 0x2fe0d8, 0.4).setStrokeStyle(3, 0xffffff, 0.6).setDepth(30).setInteractive().setName('action');
    this.actionButton.on('pointerdown', () => ws().interact());
    this.actionLabel = this.add.text(0, 0, 'E', { ...FONT, fontSize: '22px' }).setOrigin(0.5).setDepth(31);
    this.spellButton = this.add.circle(0, 0, 24, 0x9b6af0, 0.45).setStrokeStyle(2, 0xffffff, 0.6).setDepth(30).setInteractive().setName('spell');
    this.spellButton.on('pointerdown', () => ws().cast());
    this.spellLabel = this.add.text(0, 0, '✦', { ...FONT, fontSize: '20px' }).setOrigin(0.5).setDepth(31);
    this.potionButton = this.add.circle(0, 0, 20, 0xe04a5a, 0.35).setStrokeStyle(2, 0xffffff, 0.5).setDepth(30).setInteractive();
    this.potionButton.on('pointerdown', () => ws().hero.drink());
    this.potionLabel = this.add.text(0, 0, '♥', { ...FONT, fontSize: '16px' }).setOrigin(0.5).setDepth(31);
    const buttons: [string, () => void][] = [
      ['Karte', () => this.worldMap.toggle()],
      ['☰', () => this.toggleMenu()],
    ];
    buttons.forEach(([label, fn], i) => {
      const b = this.add
        .text(0, 0, label, { ...FONT, fontSize: '18px', backgroundColor: '#0b0b14cc', padding: { x: 10, y: 6 } })
        .setOrigin(1, 0)
        .setDepth(30)
        .setInteractive({ useHandCursor: true });
      b.on('pointerdown', fn);
      this.touchButtons.push({ b, i });
    });
  }

  private touchButtons: { b: Phaser.GameObjects.Text; i: number }[] = [];
  private actionButton?: Phaser.GameObjects.Arc;
  private actionLabel?: Phaser.GameObjects.Text;
  private potionButton?: Phaser.GameObjects.Arc;
  private spellButton?: Phaser.GameObjects.Arc;
  private spellLabel?: Phaser.GameObjects.Text;
  private potionLabel?: Phaser.GameObjects.Text;
  menu?: Phaser.GameObjects.Container;

  /** Menü mit allen Fenstern und Einstellungen (Handy: ☰, Desktop: H). */
  toggleMenu(): void {
    if (this.menu) {
      this.menu.destroy();
      this.menu = undefined;
      debugState.menuOpen = false;
      return;
    }
    debugState.menuOpen = true;
    const ws = this.scene.get('world') as WorldScene;
    const close = (fn: () => void) => () => {
      this.toggleMenu();
      fn();
    };
    const entries: [string, () => void][] = [
      ['Held (C)', close(() => this.togglePanel())],
      ['Quests (L)', close(() => this.toggleQuestLog())],
      ['Chronik (B)', close(() => this.toggleChronicle())],
      ['Neuigkeiten (U)', close(() => this.toggleNews())],
      ['Karte (M)', close(() => this.worldMap.toggle())],
      ['Teilen (G)', close(() => this.toggleShare())],
      ['Schild (T)', close(() => ws.placeSign())],
      ['Chat (Enter)', close(() => ws.chat())],
      ['Zoom +', () => ws.zoom(1)],
      ['Zoom −', () => ws.zoom(-1)],
      [`Musik: ${audio.enabled ? 'an' : 'aus'}`, close(() => audio.toggle())],
      ['Titelbildschirm', close(() => ws.toTitle())],
    ];
    // M29: nur mit ?gm=1; am Ende, damit die Nummern der übrigen Einträge bleiben
    if (ws.gmAllowed) entries.push([`Spielleiter-Modus: ${ws.gm ? 'an' : 'aus'}`, close(() => ws.setGm(!ws.gm))]);
    const cols = this.scale.width < 500 ? 2 : 3;
    const bw = Math.min(170, Math.floor((this.scale.width - 40) / cols) - 8);
    const W = cols * (bw + 8) + 16;
    const rows = Math.ceil(entries.length / cols);
    const c = this.add.container(Math.round((this.scale.width - W) / 2), 60).setDepth(60);
    c.add(this.add.rectangle(0, 0, W, rows * 44 + 56, 0x0b0b14, 0.95).setOrigin(0).setStrokeStyle(2, 0x2fe0d8, 0.9).setInteractive());
    c.add(this.add.text(12, 10, 'Menü', { ...FONT, fontSize: '17px', color: '#2fe0d8' }));
    const x = this.add.text(W - 34, 8, '✕', { ...FONT, color: '#0b0b14', backgroundColor: '#2fe0d8', padding: { x: 6, y: 3 } }).setInteractive({ useHandCursor: true });
    x.on('pointerdown', () => this.toggleMenu());
    c.add(x);
    entries.forEach(([label, fn], i) => {
      const bx = 8 + (i % cols) * (bw + 8);
      const by = 44 + Math.floor(i / cols) * 44;
      const r = this.add.rectangle(bx + 4, by, bw, 36, 0x1c1c2a, 1).setOrigin(0).setStrokeStyle(1, 0x2fe0d8, 0.5).setInteractive({ useHandCursor: true }).setName(`menu-${i}`);
      r.on('pointerdown', fn);
      c.add(r);
      c.add(this.add.text(bx + 4 + bw / 2, by + 18, label, { ...FONT, fontSize: '13px' }).setOrigin(0.5));
    });
    this.menu = c;
  }
  private hpBar!: Phaser.GameObjects.Graphics;
  private attackButton?: Phaser.GameObjects.Arc;

  /** Aufsteigender Text (Schaden, EP, Beute) an einer Weltposition. */
  private floatText(d: { x: number; y: number; text: string; color: string; small?: boolean }): void {
    const ws = this.scene.get('world') as WorldScene;
    const cam = ws.cameras.main;
    const sx = (d.x - cam.worldView.x) * cam.zoom;
    const sy = (d.y - cam.worldView.y) * cam.zoom;
    const t = this.add
      .text(sx, sy, d.text, { fontFamily: 'monospace', fontSize: d.small ? '14px' : '18px', color: d.color, stroke: '#0b0b14', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(8);
    this.tweens.add({ targets: t, y: sy - 34, alpha: 0, duration: 750, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  private banner(title: string, sub: string, small = false, sticky = false): void {
    this.banners.push({ title, sub, small, sticky });
  }

  /** Warteschlange abarbeiten; Loslaufen und Klicks beenden Einstiegshinweise. */
  private stepBanners(ws: WorldScene): void {
    const p = { x: ws.player.x, y: ws.player.y };
    if (this.lastPos && Math.hypot(p.x - this.lastPos.x, p.y - this.lastPos.y) > 0.5) this.banners.noteMoved();
    this.lastPos = p;
    const r = this.banners.step(this.time.now);
    if (!r) return;
    const old = this.bannerObj;
    if (old) this.tweens.add({ targets: old, alpha: 0, duration: r === 'hide' ? 500 : 150, onComplete: () => old.destroy() });
    this.bannerObj = undefined;
    debugState.bannerTitle = '';
    if (r !== 'hide') this.showBanner(r.show);
  }

  private showBanner(b: BannerItem): void {
    const c = this.add.container(this.scale.width / 2, this.scale.height * (b.small ? 0.2 : 0.28)).setDepth(35);
    this.bannerObj = c;
    debugState.bannerTitle = b.title;
    if (b.sticky) debugState.tipsShown++;
    const size = b.small ? (this.scale.width < 500 ? '18px' : '24px') : '32px';
    c.add(this.add.text(0, 0, b.title, { fontFamily: 'monospace', fontSize: size, color: b.small ? '#f4f0e8' : '#ffd84a', stroke: '#0b0b14', strokeThickness: 6 }).setOrigin(0.5));
    c.add(this.add.text(0, 32, b.sub, { ...FONT, fontSize: '13px', stroke: '#0b0b14', strokeThickness: 4, align: 'center', wordWrap: { width: this.scale.width - 32 } }).setOrigin(0.5, 0.2));
    if (b.sticky) c.add(this.add.text(0, 58, this.sys.game.device.input.touch ? '(antippen oder loslaufen)' : '(klicken oder loslaufen)', { ...FONT, fontSize: '11px', color: '#8a8aa0', stroke: '#0b0b14', strokeThickness: 3 }).setOrigin(0.5));
    c.setScale(0.6);
    this.tweens.add({ targets: c, scale: 1, duration: 250, ease: 'Back.easeOut' });
  }

  private drawHp(): void {
    const ws = this.scene.get('world') as WorldScene;
    const s = ws.combat.stats;
    const x = 8;
    const y = this.hud.y + this.hud.height + 6;
    const w = 160;
    const g = this.hpBar.clear();
    g.fillStyle(0x0b0b14, 0.85).fillRect(x, y, w + 4, 14);
    const f = Math.max(0, s.hp) / s.maxHp;
    g.fillStyle(f > 0.5 ? 0x4cb53e : f > 0.25 ? 0xe0b030 : 0xe04a5a, 1).fillRect(x + 2, y + 2, w * f, 10);
    this.hpText ??= this.add.text(0, 0, '', { ...FONT, fontSize: '11px' }).setDepth(7);
    this.hpText.setText(`LP ${Math.ceil(s.hp)}/${s.maxHp}`).setPosition(x + 6, y + 1);
    // EP-Leiste und Vorräte
    const h = ws.hero.hero;
    const need = xpToNext(h.level);
    g.fillStyle(0x0b0b14, 0.85).fillRect(x, y + 15, w + 4, 6);
    g.fillStyle(0xffd84a, 1).fillRect(x + 2, y + 16, (w * h.xp) / need, 4);
    this.xpText ??= this.add.text(0, 0, '', { ...FONT, fontSize: '12px', backgroundColor: '#0b0b14cc', padding: { x: 4, y: 2 } }).setDepth(7);
    const tp = h.talentPoints > 0 ? `  ★${h.talentPoints}` : '';
    this.xpText.setText(`Stufe ${h.level}  ◆${h.shards}  Tränke ${h.potions}${tp}`).setPosition(x, y + 24);
  }

  private xpText?: Phaser.GameObjects.Text;
  newsPanel?: Phaser.GameObjects.Container;
  private nightRect!: Phaser.GameObjects.Rectangle;
  private fogRect!: Phaser.GameObjects.Rectangle;
  private lightImg!: Phaser.GameObjects.Image;
  private weatherG!: Phaser.GameObjects.Graphics;
  private drops: { x: number; y: number; s: number }[] = [];
  private flash = 0;

  /** Einstiegshinweise beim allerersten Spielen (danach nie wieder). */
  private startTips(ws: WorldScene): void {
    if (load<boolean>('tips')) return;
    save('tips', true);
    const touch = this.sys.game.device.input.touch;
    const tips: [string, string][] = [
      [`Willkommen in ${ws.world.meta.lore.worldName}!`, touch ? 'Ziehen = laufen · ⚔ = angreifen · E = reden/benutzen' : 'WASD = laufen · Leertaste = angreifen · E = reden/benutzen'],
      ['Gelbes ! über einem Kopf', 'Diese Person hat einen Auftrag für dich.'],
      ['Folge dem gelben Pfeil', 'Er führt zu Quests und Orten. Gelbe Kreise auf der Minimap: ungefähres Gebiet.'],
      ['Alles wird gespeichert', `Kurz spielen, jederzeit aufhören. ${touch ? '☰' : 'H'} öffnet das Menü.`],
    ];
    debugState.tipsShown = 0;
    this.time.delayedCall(1200, () => tips.forEach(([t, s]) => this.banner(t, s, true, true)));
  }
  private moodAt = 0;

  /** Nachtdunkel, Lichtschein um die Figur, Wetter-Ebene (unter allen Anzeigen). */
  private createAtmosphere(): void {
    if (!this.textures.exists('light')) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grd.addColorStop(0, 'rgba(255,220,150,0.55)');
      grd.addColorStop(0.5, 'rgba(255,200,120,0.18)');
      grd.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
      this.textures.addCanvas('light', c);
    }
    this.nightRect = this.add.rectangle(0, 0, 10, 10, 0x0a0a32, 0).setOrigin(0).setDepth(-20);
    this.lightImg = this.add.image(0, 0, 'light').setBlendMode(Phaser.BlendModes.ADD).setDepth(-19).setAlpha(0);
    this.fogRect = this.add.rectangle(0, 0, 10, 10, 0xd8e0e8, 0).setOrigin(0).setDepth(-18);
    this.weatherG = this.add.graphics().setDepth(-17);
  }

  private drawAtmosphere(ws: WorldScene, dt: number): void {
    const { width, height } = this.scale;
    const light = daylight(worldNow());
    const weather = ws.live.weather;
    const dark = (1 - light) * 0.55 + (weather === 'sturm' ? 0.15 : weather === 'regen' ? 0.06 : 0);
    this.nightRect.setSize(width, height).setFillStyle(0x0a0a32, dark);
    this.lightImg.setPosition(width / 2, height / 2 - 20).setScale((ws.cameras.main.zoom * 2.2) / 2).setAlpha((1 - light) * 0.9);
    this.fogRect.setSize(width, height).setFillStyle(0xd8e0e8, weather === 'nebel' ? 0.22 + Math.sin(this.time.now / 1500) * 0.04 : 0);
    const g = this.weatherG.clear();
    const want = weather === 'regen' ? 140 : weather === 'sturm' ? 260 : weather === 'schnee' ? 110 : 0;
    while (this.drops.length < want) this.drops.push({ x: Math.random() * width, y: Math.random() * height, s: 0.6 + Math.random() * 0.6 });
    if (this.drops.length > want) this.drops.length = want;
    const snow = weather === 'schnee';
    g.lineStyle(1, 0xb8d0f0, 0.55);
    g.fillStyle(0xffffff, 0.85);
    const wind = weather === 'sturm' ? 7 : 2;
    for (const d of this.drops) {
      if (snow) {
        d.y += 40 * d.s * dt;
        d.x += Math.sin((this.time.now / 600 + d.s * 10)) * 12 * dt;
        g.fillRect(d.x, d.y, 2, 2);
      } else {
        d.y += 600 * d.s * dt;
        d.x += wind * 40 * dt;
        g.lineBetween(d.x, d.y, d.x - wind, d.y - 10 * d.s);
      }
      if (d.y > height) {
        d.y = -10;
        d.x = Math.random() * width;
      }
      if (d.x > width) d.x = 0;
    }
    if (weather === 'sturm') {
      this.flash -= dt;
      if (this.flash < -4 - Math.random() * 6) this.flash = 0.12;
      if (this.flash > 0) g.fillStyle(0xffffff, 0.35).fillRect(0, 0, width, height);
    }
  }

  sharePanel?: Phaser.GameObjects.Container;

  toggleShare(): void {
    if (this.sharePanel) {
      this.sharePanel.destroy();
      this.sharePanel = undefined;
      debugState.shareOpen = false;
      return;
    }
    this.buildShare();
  }

  /** Teilen-Fenster: Link, Datei, Sync, Mitspieler. */
  private buildShare(note = ''): void {
    this.sharePanel?.destroy();
    debugState.shareOpen = true;
    const ws = this.scene.get('world') as WorldScene;
    const W = Math.min(this.scale.width - 16, 480);
    const c = this.add.container(Math.round((this.scale.width - W) / 2), 40).setDepth(56);
    const bg = this.add.rectangle(0, 0, W, 300, 0x0b0b14, 0.95).setOrigin(0).setStrokeStyle(2, 0xffd84a, 0.9).setInteractive();
    c.add(bg);
    const txt = (y: number, s: string, color = '#c0c0cc', size = 12) => {
      const t = this.add.text(12, y, s, { ...FONT, fontSize: `${size}px`, color, wordWrap: { width: W - 24 } });
      c.add(t);
      return t;
    };
    const btn = (x: number, y: number, label: string, cb: () => void, name: string) => {
      const b = this.add.text(x, y, label, { ...FONT, fontSize: '13px', color: '#0b0b14', backgroundColor: '#ffd84a', padding: { x: 6, y: 4 } }).setInteractive({ useHandCursor: true }).setName(name);
      b.on('pointerdown', cb);
      c.add(b);
      return b;
    };
    txt(10, `Welt „${this.seed}“ gemeinsam spielen`, '#ffd84a', 16);
    const close = this.add.text(W - 34, 8, '✕', { ...FONT, color: '#0b0b14', backgroundColor: '#ffd84a', padding: { x: 6, y: 3 } }).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleShare());
    c.add(close);
    let y = 40;
    y += txt(y, 'Schicke Freunden den Link: Sie spielen dieselbe Welt und sehen deine Taten (offene Truhen, Orte, Statuen, Botschaften). Schicken sie dir ihren Link zurück, siehst du ihre.').height + 10;
    const b1 = btn(12, y, 'Link kopieren', async () => {
      const link = await ws.shareLink();
      debugState.lastShareLink = link;
      try {
        await navigator.clipboard.writeText(link);
        this.buildShare('Link kopiert – z. B. per Messenger verschicken.');
      } catch {
        window.prompt('Link kopieren:', link);
      }
    }, 'share-link');
    const b2 = btn(12 + b1.width + 8, y, 'Datei speichern', () => ws.exportFile(), 'share-export');
    btn(12 + b1.width + b2.width + 16, y, 'Datei laden', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return;
        const n = await ws.importFile(f);
        this.buildShare(n < 0 ? 'Datei passt nicht zu dieser Welt.' : `${n} neue Ereignisse übernommen.`);
      };
      input.click();
    }, 'share-import');
    y += 36;
    if (note) y += txt(y, note, '#4cb53e').height + 6;
    const liveN = ws.remote.remotes.size;
    const st = ws.sync ? `Automatischer Abgleich: ${ws.sync.status} (${ws.sync.url}) · Live: ${ws.live2?.connected ? `verbunden, ${liveN} Mitspieler online` : 'getrennt'}` : 'Automatischer Abgleich: aus (mit ?sync=<Server> aktivierbar, siehe server/sync-server.mjs)';
    y += txt(y, st, ws.sync?.status === 'verbunden' ? '#2fe0d8' : '#8a8aa0', 11).height + 10;
    txt(y, 'Spieler in dieser Welt:', '#f4f0e8', 13);
    y += 20;
    for (const p of ws.players().slice(0, 6)) {
      txt(y, `• ${p.name}${p.pid === ws.state.pid ? ' (du)' : ''} – ${p.events} ${p.events === 1 ? 'Tat' : 'Taten'}`);
      y += 17;
    }
    bg.setSize(W, y + 12);
    this.sharePanel = c;
  }

  toggleNews(): void {
    if (this.newsPanel) {
      this.newsPanel.destroy();
      this.newsPanel = undefined;
      debugState.newsOpen = false;
      return;
    }
    const ws = this.scene.get('world') as WorldScene;
    this.showNews('Neuigkeiten der letzten 24 Stunden', ws.news);
  }

  /** Nachrichtenfenster (auch für „Während du weg warst …“). */
  showNews(title: string, news: News[]): void {
    this.newsPanel?.destroy();
    debugState.newsOpen = true;
    const W = Math.min(this.scale.width - 16, 520);
    const H = Math.min(this.scale.height - 16, 420);
    const c = this.add.container(Math.round((this.scale.width - W) / 2), 40).setDepth(55);
    const bg = this.add.rectangle(0, 0, W, H, 0x0b0b14, 0.95).setOrigin(0).setStrokeStyle(2, 0x2fe0d8, 0.9).setInteractive();
    c.add(bg);
    c.add(this.add.text(12, 10, title, { ...FONT, fontSize: '16px', color: '#2fe0d8' }));
    const close = this.add.text(W - 34, 8, '✕', { ...FONT, color: '#0b0b14', backgroundColor: '#2fe0d8', padding: { x: 6, y: 3 } }).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleNews());
    c.add(close);
    let y = 40;
    const shown = news.slice(-14).reverse();
    if (!shown.length) c.add(this.add.text(12, y, 'Ruhige Zeiten – nichts Besonderes ist geschehen.', { ...FONT, fontSize: '13px', color: '#8a8aa0' }));
    for (const n of shown) {
      const t = this.add.text(12, y, `• ${n.text}`, { ...FONT, fontSize: '12px', color: '#c0c0cc', wordWrap: { width: W - 24 } });
      c.add(t);
      y += t.height + 4;
      if (y > H - 20) break;
    }
    bg.setSize(W, Math.min(H, Math.max(80, y + 10)));
    this.newsPanel = c;
  }
  private bannerObj?: Phaser.GameObjects.Container;
  private banners = new BannerQueue();
  private lastPos: { x: number; y: number } | null = null;
  chronicle?: Phaser.GameObjects.Container;

  toggleChronicle(): void {
    if (this.chronicle) {
      this.chronicle.destroy();
      this.chronicle = undefined;
      debugState.chronicleOpen = false;
      return;
    }
    if (this.panel) this.togglePanel();
    if (this.questLog) this.toggleQuestLog();
    this.buildChronicle();
  }

  /** Chronik der Welt: gefundene Fragmente in der richtigen Reihenfolge. */
  buildChronicle(): void {
    this.chronicle?.destroy();
    debugState.chronicleOpen = true;
    const ws = this.scene.get('world') as WorldScene;
    const lore = ws.world.meta.lore;
    const found = new Set(ws.hero.hero.chronicle ?? []);
    const W = Math.min(this.scale.width - 16, 560);
    const H = this.scale.height - 16;
    const c = this.add.container(Math.round((this.scale.width - W) / 2), 8).setDepth(50);
    c.add(this.add.rectangle(0, 0, W, H, 0x0b0b14, 0.95).setOrigin(0).setStrokeStyle(2, 0x9b6af0, 0.9).setInteractive());
    c.add(this.add.text(12, 10, `Chronik von ${lore.worldName}  ${found.size}/${lore.fragments.length}`, { ...FONT, fontSize: '17px', color: '#c4a8ff' }));
    const close = this.add.text(W - 34, 8, '✕', { ...FONT, color: '#0b0b14', backgroundColor: '#9b6af0', padding: { x: 6, y: 3 } }).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleChronicle());
    c.add(close);
    let y = 40;
    const small = this.scale.width < 500;
    lore.fragments.forEach((f, i) => {
      const known = found.has(i);
      const t1 = this.add.text(12, y, known ? f.title : `${'I II III IV V VI VII VIII'.split(' ')[i]}. ???`, { ...FONT, fontSize: '13px', color: known ? '#ffd84a' : '#6a6a7a' });
      c.add(t1);
      y += 17;
      if (known) {
        const t = this.add.text(12, y, f.text, { ...FONT, fontSize: small ? '11px' : '12px', color: '#c0c0cc', wordWrap: { width: W - 24 } });
        c.add(t);
        y += t.height + 6;
      } else {
        const t = this.add.text(12, y, 'Ein Obelisk irgendwo in der Welt kennt diesen Teil.', { ...FONT, fontSize: '11px', color: '#4a4a5a' });
        c.add(t);
        y += 18;
      }
    });
    this.chronicle = c;
  }

  private tracker!: Phaser.GameObjects.Text;
  private arrow!: Phaser.GameObjects.Graphics;
  private arrowLabel!: Phaser.GameObjects.Text;
  private markerTexts: Phaser.GameObjects.Text[] = [];
  private remoteTexts: Phaser.GameObjects.Text[] = [];
  private bubbleTexts: Phaser.GameObjects.Text[] = [];
  questLog?: Phaser.GameObjects.Container;

  toggleQuestLog(): void {
    if (this.questLog) {
      this.questLog.destroy();
      this.questLog = undefined;
      debugState.questLogOpen = false;
      return;
    }
    if (this.panel) this.togglePanel();
    this.buildQuestLog();
  }

  buildQuestLog(): void {
    this.questLog?.destroy();
    debugState.questLogOpen = true;
    const ws = this.scene.get('world') as WorldScene;
    const log = ws.hero.quests;
    const W = Math.min(this.scale.width - 16, 460);
    const c = this.add.container(Math.round((this.scale.width - W) / 2), 8).setDepth(50);
    const H = Math.min(this.scale.height - 16, 120 + log.active.length * 96);
    c.add(this.add.rectangle(0, 0, W, H, 0x0b0b14, 0.94).setOrigin(0).setStrokeStyle(2, 0xffd84a, 0.8).setInteractive());
    c.add(this.add.text(12, 10, `Quests ${log.active.length}/${MAX_ACTIVE}`, { ...FONT, fontSize: '17px', color: '#ffd84a' }));
    const close = this.add.text(W - 34, 8, '✕', { ...FONT, color: '#0b0b14', backgroundColor: '#ffd84a', padding: { x: 6, y: 3 } }).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleQuestLog());
    c.add(close);
    let y = 44;
    if (!log.active.length) c.add(this.add.text(12, y, 'Keine aktiven Quests. NPCs mit gelbem ! haben Aufträge.', { ...FONT, fontSize: '13px', color: '#8a8aa0', wordWrap: { width: W - 24 } }));
    log.active.forEach((q, i) => {
      c.add(this.add.text(12, y, q.title, { ...FONT, fontSize: '14px', color: isReady(q) ? '#4cb53e' : '#f4f0e8' }));
      c.add(this.add.text(12, y + 18, `von ${q.giverName} · ${progressText(q)}`, { ...FONT, fontSize: '12px', color: '#ffd84a' }));
      c.add(this.add.text(12, y + 36, q.text, { ...FONT, fontSize: '12px', color: '#a0a0b0', wordWrap: { width: W - 110 } }));
      const ab = this.add
        .text(W - 12, y, 'Abbrechen', { ...FONT, fontSize: '12px', color: '#0b0b14', backgroundColor: '#8a8aa0', padding: { x: 5, y: 2 } })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true })
        .setName(`abandon-${i}`);
      ab.on('pointerdown', () => {
        abandon(log, q.id);
        ws.hero.persist();
        ws.events.emit('quests-changed');
      });
      c.add(ab);
      y += 96;
    });
    this.questLog = c;
  }

  /** Tracker (oben rechts), Richtungspfeil zum Questziel und !/? über NPCs. */
  private drawQuests(ws: WorldScene): void {
    const log = ws.hero.quests;
    const q = log.active.find((a) => isReady(a)) ?? log.active[0];
    const cam = ws.cameras.main;
    const top = this.worldMap.miniBottom() + 6;
    this.tracker.setPosition(this.scale.width - 8, top).setVisible(!!q && !this.panel && !this.questLog);
    this.arrow.clear();
    this.arrowLabel.setVisible(false);
    this.worldMap.miniTarget = null;
    debugState.questPointer = 'none';
    const guide = q ? null : this.guideTarget(ws);
    const t = q ? questTarget(q) : guide;
    let trackerText = q ? `${q.title}\n${progressText(q)}${log.active.length > 1 ? `  (+${log.active.length - 1})` : ''}` : '';
    if (t) {
      // NPC-Ziele: Pfeil nur auf den NPC selbst; ist er nicht geladen, nur ein ungefähres Gebiet (Feedback Punkt 2).
      const npc = t.npcId ? ws.npcs.npcs.get(t.npcId) : undefined;
      const area = !!t.npcId && !npc;
      this.worldMap.miniTarget = { tx: t.tx, ty: t.ty, area };
      if (area) {
        debugState.questPointer = 'area';
        trackerText += `\n${areaText(ws.world.meta.settlements, t, ws.player.tile)}`;
      } else if (!this.worldMap.isOpen && !this.panel && !this.questLog) {
        debugState.questPointer = npc ? 'npc' : 'place';
        const wx = npc ? npc.actor.x : t.tx * TILE_PX + TILE_PX / 2;
        const wy = npc ? npc.actor.y - 20 : t.ty * TILE_PX + TILE_PX / 2;
        this.drawArrow(ws, wx, wy, t.label);
      }
    }
    if (q) this.tracker.setText(trackerText);
    // Live-Mitspieler: Name, Lebensleiste, Sprechblasen
    const nowMs = Date.now();
    let ri = 0;
    const bubbles: { x: number; y: number; text: string; color: string }[] = [];
    for (const r of ws.remote.remotes.values()) {
      const sx = (r.x - cam.worldView.x) * cam.zoom;
      const sy = (r.y - 56 - cam.worldView.y) * cam.zoom;
      const t = (this.remoteTexts[ri] ??= this.add.text(0, 0, '', { ...FONT, fontSize: '12px', color: '#2fe0d8', backgroundColor: '#0b0b14aa', padding: { x: 4, y: 2 } }).setOrigin(0.5, 1).setDepth(5));
      t.setText(`${r.name}  ${Math.round((r.hp / r.maxHp) * 100)}%`).setPosition(Math.round(sx), Math.round(sy)).setVisible(!this.worldMap.isOpen);
      ri++;
      if (r.chat && r.chat.until > nowMs) bubbles.push({ x: sx, y: sy - 22, text: r.chat.text, color: '#f4f0e8' });
    }
    for (; ri < this.remoteTexts.length; ri++) this.remoteTexts[ri].setVisible(false);
    if (ws.myChat && ws.myChat.until > nowMs) bubbles.push({ x: (ws.player.x - cam.worldView.x) * cam.zoom, y: (ws.player.y - 66 - cam.worldView.y) * cam.zoom, text: ws.myChat.text, color: '#ffd84a' });
    let bi = 0;
    for (const b of bubbles) {
      const t = (this.bubbleTexts[bi] ??= this.add.text(0, 0, '', { ...FONT, fontSize: '13px', backgroundColor: '#f4f0e8', padding: { x: 6, y: 3 } }).setOrigin(0.5, 1).setDepth(6));
      t.setText(b.text).setColor('#0b0b14').setBackgroundColor(b.color).setPosition(Math.round(b.x), Math.round(b.y)).setVisible(!this.worldMap.isOpen);
      bi++;
    }
    for (; bi < this.bubbleTexts.length; bi++) this.bubbleTexts[bi].setVisible(false);

    // !/? über NPCs
    let i = 0;
    for (const n of ws.npcs.npcs.values()) {
      const m = ws.markers.get(n.spawn.id);
      if (!m || this.worldMap.isOpen || !n.seen) continue;
      const t = (this.markerTexts[i] ??= this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '22px', stroke: '#0b0b14', strokeThickness: 5 }).setOrigin(0.5, 1).setDepth(5));
      const bob = Math.sin(this.time.now / 200) * 3;
      t.setText(m).setColor(m === '!' ? '#ffd84a' : '#4cb53e').setPosition((n.actor.x - cam.worldView.x) * cam.zoom, (n.actor.y - 66 - cam.worldView.y) * cam.zoom + bob).setVisible(true);
      i++;
    }
    for (; i < this.markerTexts.length; i++) this.markerTexts[i].setVisible(false);
  }

  /** Pfeil am Ziel (auf dem Bildschirm) oder auf einem Kreis um die Figur in Zielrichtung. */
  private drawArrow(ws: WorldScene, wx: number, wy: number, label: string): void {
    const cam = ws.cameras.main;
    const sx = (wx - cam.worldView.x) * cam.zoom;
    const sy = (wy - cam.worldView.y) * cam.zoom;
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const dist = Math.round(Math.hypot(wx - ws.player.x, wy - ws.player.y) / TILE_PX);
    const onScreen = sx > 20 && sy > 20 && sx < this.scale.width - 20 && sy < this.scale.height - 20;
    let ax = sx;
    let ay = sy;
    let ang = Math.PI / 2;
    if (!onScreen) {
      // Pfeil auf einem Kreis um die Figur (Bildschirmmitte), überdeckt so keine HUD-Elemente
      ang = Math.atan2(sy - cy, sx - cx);
      const k = Math.min(this.scale.width, this.scale.height) * 0.3;
      ax = cx + Math.cos(ang) * k;
      ay = cy + Math.sin(ang) * k;
    } else {
      ay -= 26;
    }
    // Spitze in Zielrichtung, zwei Ecken schräg dahinter
    const pts = [
      [0, 22],
      [2.5, 15],
      [-2.5, 15],
    ].map(([da, r]) => new Phaser.Math.Vector2(ax + Math.cos(ang + da) * r, ay + Math.sin(ang + da) * r));
    this.arrow.fillStyle(0xffd84a, 0.95).fillTriangle(pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y);
    this.arrow.lineStyle(2, 0x0b0b14, 1).strokeTriangle(pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y);
    this.arrowLabel.setText(onScreen ? label : `${label} · ${dist}`).setPosition(ax - Math.cos(ang) * 30, ay - Math.sin(ang) * 30).setVisible(true);
  }



  /** Ohne Quest: nächster noch nicht besuchter Ort (Wegstein) als Ziel. */
  private guideTarget(ws: WorldScene): QuestTarget | null {
    const { tx, ty } = ws.player.tile;
    let best: QuestTarget | null = null;
    let bd = 700;
    for (const s of ws.world.meta.settlements) {
      if (ws.state.d.discovered.has(`town:${s.id}`)) continue;
      const d = Math.hypot(s.tx - tx, s.ty - ty);
      if (d < bd) {
        bd = d;
        best = { tx: s.tx, ty: s.ty, label: `Ort: ${s.name}` };
      }
    }
    return best;
  }

  /** Für Tests: löst den Klick auf ein benanntes Element im Heldenfenster (oder der Karte) aus. */
  clickPanel(name: string): boolean {
    const o = (this.panel?.getByName(name) ?? this.worldMap.find(name) ?? this.sharePanel?.getByName(name) ?? this.menu?.getByName(name) ?? this.children.getByName(name)) as Phaser.GameObjects.GameObject | null;
    if (!o) return false;
    o.emit('pointerdown');
    return true;
  }

  /** Für Gamepad-Steuerung aus der Welt-Szene. */
  toggleMapPublic(): void {
    this.worldMap.toggle();
  }

  /** Heldenfenster (src/ui/HeroPanel.ts) */
  private heroPanel!: HeroPanel;
  get panel(): Phaser.GameObjects.Container | undefined {
    return this.heroPanel?.container;
  }

  togglePanel(): void {
    if (this.panel) return this.heroPanel.close();
    if (this.worldMap.isOpen) this.worldMap.close();
    this.heroPanel.build();
  }


  private hpText?: Phaser.GameObjects.Text;
  private attackLabel?: Phaser.GameObjects.Text;
  private dialog?: Phaser.GameObjects.Container;
  private nameTag!: Phaser.GameObjects.Text;

  /** Dialogfenster unten am Bildschirm. */
  private showDialog(d: { name: string; role: string; text: string; choices?: string[] } | null): void {
    this.dialog?.destroy();
    this.dialog = undefined;
    if (!d) return;
    const w = Math.min(this.scale.width - 24, 640);
    const x = (this.scale.width - w) / 2;
    const y = this.scale.height - 130;
    const c = this.add.container(x, y).setDepth(15);
    const bg = this.add.rectangle(0, 0, w, 96, 0x0b0b14, 0.9).setOrigin(0).setStrokeStyle(2, 0x2fe0d8, 0.8);
    const title = this.add.text(12, 8, `${d.name} · ${d.role}`, { ...FONT, fontSize: '15px', color: '#2fe0d8' });
    const text = this.add.text(12, 32, `„${d.text}“`, { ...FONT, fontSize: '15px', wordWrap: { width: w - 24 } });
    const hint = this.add
      .text(w - 10, 88, d.choices ? '' : this.sys.game.device.input.touch ? 'Reden: weiter' : 'E: schließen', { ...FONT, fontSize: '11px', color: '#8a8aa0' })
      .setOrigin(1, 1);
    c.add([bg, title, text, hint]);
    text.setWordWrapWidth(w - 24);
    if (d.choices) {
      bg.setSize(w, 96 + 34);
      bg.setPosition(0, -34);
      title.setY(-26);
      text.setY(-2);
      let bx = 12;
      let by = 92;
      const rows = d.choices.length > 2 || w < 420;
      if (rows) {
        const extra = (d.choices.length - 1) * 30;
        bg.setSize(w, 96 + 34 + extra);
        bg.setPosition(0, -34 - extra);
        title.setY(-26 - extra);
        text.setY(-2 - extra);
      }
      d.choices.forEach((label, i) => {
        if (rows) {
          bx = 12;
          by = 92 - (d.choices!.length - 1 - i) * 30;
        }
        const b = this.add
          .text(bx, by, `[${i + 1}] ${label}`, { ...FONT, fontSize: '14px', color: '#0b0b14', backgroundColor: i === 0 ? '#ffd84a' : '#8a8aa0', padding: { x: 8, y: 4 } })
          .setOrigin(0, 1)
          .setInteractive({ useHandCursor: true })
          .setName(`choice-${i}`);
        b.on('pointerdown', () => (this.scene.get('world') as WorldScene).choose(i));
        c.add(b);
        bx += b.width + 10;
      });
    }
    this.dialog = c;
  }


  update(): void {
    const ws = this.scene.get('world') as WorldScene;
    const { tx, ty } = ws.focusTile;
    const b = ws.chunks.biomeAt(tx, ty);
    const biomeName = b === undefined ? '…' : BIOMES[b].name;
    debugState.biome = biomeName;
    const narrow = this.scale.width < 500;
    const lines = [`${ws.hero.hero.name ?? 'Held'} · ${narrow ? '' : 'Welt: '}${this.seed}`, `${clockText(worldNow())} Uhr · ${ws.live.weather}`, `Gebiet: ${biomeName}`];
    if (!narrow) lines.push(`Position: ${tx}, ${ty}`, `FPS: ${Math.round(this.game.loop.actualFps)}`);
    this.hud.setText(lines.join('\n'));
    this.help.setY(this.scale.height - 6);
    // rechts neben dem HUD-Text (oben rechts liegen Minimap und Handy-Knöpfe)
    this.gmBadge.setX(this.hud.x + this.hud.width + 6);
    this.drawAtmosphere(ws, Math.min(0.05, this.game.loop.delta / 1000));
    if (this.time.now - this.moodAt > 1000) {
      this.moodAt = this.time.now;
      const realm = ws.world.meta.realmAt(tx, ty);
      audio.setMood(daylight(worldNow()) < 0.35 ? 'night' : realm.faction === 'techno' ? 'cyber' : 'day');
    }
    this.drawHp();
    this.stepBanners(ws);
    this.drawQuests(ws);
    this.worldMap.drawMinimap(ws, !this.panel && !this.questLog);
    this.worldMap.updateMarker(ws);
    if (this.attackButton) {
      const ax = this.scale.width - 60;
      const ay = this.scale.height - 90;
      this.attackButton.setPosition(ax, ay);
      this.attackLabel!.setPosition(ax, ay);
      this.actionButton!.setPosition(ax - 74, ay + 14);
      this.actionLabel!.setPosition(ax - 74, ay + 14);
      this.potionButton!.setPosition(ax - 18, ay - 66);
      const ready = ws.combat.spellCooldown <= 0;
      this.spellButton!.setPosition(ax + 18, ay - 74).setAlpha(ready ? 1 : 0.35);
      this.spellLabel!.setPosition(ax + 18, ay - 74).setAlpha(ready ? 1 : 0.4);
      this.potionLabel!.setText(`♥${ws.hero.hero.potions}`).setPosition(ax - 18, ay - 66);
    }
    let bx = this.scale.width - 8;
    let by = 8;
    for (const { b } of this.touchButtons) {
      if (bx - b.width < 200) {
        bx = this.scale.width - 8;
        by += 40;
      }
      b.setPosition(bx, by);
      bx -= b.width + 8;
    }

    // Namensschild über dem nächsten ansprechbaren NPC
    const near = ws.talkingTo ?? ws.npcs.nearest(ws.player, 80);
    if (near && !this.worldMap.isOpen) {
      const cam = ws.cameras.main;
      const sx = (near.actor.x - cam.worldView.x) * cam.zoom;
      const sy = (near.actor.y - 52 - cam.worldView.y) * cam.zoom;
      const hint = ws.talkingTo || this.sys.game.device.input.touch ? '' : '  [E]';
      this.nameTag.setText(`${near.spawn.name}${hint}`).setPosition(Math.round(sx), Math.round(sy)).setVisible(true);
    } else {
      this.nameTag.setVisible(false);
    }

  }
}
