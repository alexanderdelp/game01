import Phaser from 'phaser';
import { debugState } from '../debug';
import { TILE_PX } from '../render/chunkPixels';
import type { ChunkRequest, OverviewResult } from '../render/chunkProtocol';
import { touchInput } from '../game/input';
import { iconFor } from '../entities/HeroController';
import { ATLAS } from '../render/textures';
import { RARITY_COLOR, RARITY_NAME, describeBonus, type Slot } from '../rpg/items';
import { INVENTORY_SIZE, TALENTS, finalStats, xpToNext, type Talent } from '../rpg/progression';
import { RACES } from '../rpg/races';
import { MAX_ACTIVE, abandon, isReady, progressText, questTarget } from '../quests/quests';
import { BIOMES } from '../world/biomes';
import { randomSeedName } from '../world/rng';
import { WORLD_TILES } from '../world/WorldGen';
import type { WorldScene } from './WorldScene';

const MAP_STEP = 8;
const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#f4f0e8' };

/** HUD und Weltkarte, gezeichnet ohne Kamera-Zoom über der Welt. */
export class UIScene extends Phaser.Scene {
  private hud!: Phaser.GameObjects.Text;
  private help!: Phaser.GameObjects.Text;
  private map?: Phaser.GameObjects.Container;
  private mapImage?: Phaser.GameObjects.Image;
  private marker?: Phaser.GameObjects.Rectangle;
  private mapWorker?: Worker;
  private mapTex = '';
  private mapSize = 0;
  private seed = '';

  constructor() {
    super('ui');
  }

  init(data: { seed: string }): void {
    this.seed = data.seed;
    // Szene kann neu gestartet werden: Verweise auf alte (zerstörte) Objekte verwerfen.
    this.hpText = undefined;
    this.xpText = undefined;
    this.panel = undefined;
    this.map = undefined;
    this.mapImage = undefined;
    this.marker = undefined;
    this.dialog = undefined;
    this.attackButton = undefined;
    this.attackLabel = undefined;
    this.touchButtons = [];
    this.questLog = undefined;
    this.markerTexts = [];
    this.mapSize = 0;
    this.selected = null;
    debugState.mapOpen = false;
    debugState.mapReady = false;
    debugState.panelOpen = false;
  }

  create(): void {
    debugState.clickPanel = (name: string) => this.clickPanel(name);
    this.hud = this.add.text(8, 8, '', { ...FONT, backgroundColor: '#0b0b14cc', padding: { x: 6, y: 4 } });
    this.help = this.add
      .text(8, 0, this.sys.game.device.input.touch ? 'Ziehen: laufen' : 'WASD: laufen  Leertaste: angreifen  E: reden  Q: Trank  C: Held  L: Quests  M: Karte  Shift: rennen  N: neue Welt', {
        ...FONT,
        fontSize: '12px',
        backgroundColor: '#0b0b14cc',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0, 1);

    const kb = this.input.keyboard!;
    kb.on('keydown-M', () => this.toggleMap());
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
    const onHero = () => this.panel && this.buildPanel();
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
      else if (this.map) this.closeMap();
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

    // Übersichtskarte im Hintergrund erzeugen.
    this.mapWorker = new Worker(new URL('../render/chunkWorker.ts', import.meta.url), { type: 'module' });
    this.mapWorker.onmessage = (ev: MessageEvent<OverviewResult>) => this.buildMap(ev.data);
    this.mapWorker.postMessage({ type: 'init', seed: this.seed } satisfies ChunkRequest);
    this.mapWorker.postMessage({ type: 'overview', step: MAP_STEP } satisfies ChunkRequest);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.mapWorker?.terminate());
  }

  /** Virtueller Stick (Ziehen irgendwo auf dem Bildschirm) und Buttons für Touch-Geräte. */
  private createTouchControls(): void {
    const base = this.add.circle(0, 0, 34, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.35).setVisible(false).setDepth(20);
    const knob = this.add.circle(0, 0, 14, 0xffffff, 0.4).setVisible(false).setDepth(21);
    let pointerId = -1;
    const onButton = (p: Phaser.Input.Pointer) => this.input.hitTestPointer(p).length > 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (pointerId !== -1 || onButton(p) || this.map || this.panel || this.questLog) return;
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
    const buttons: [string, () => void][] = [
      ['Karte', () => this.toggleMap()],
      ['Reden', () => ws().interact()],
      ['Held', () => this.togglePanel()],
      ['Quests', () => this.toggleQuestLog()],
      ['Trank', () => ws().hero.drink()],
      ['+', () => ws().zoom(1)],
      ['−', () => ws().zoom(-1)],
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

  private banner(title: string, sub: string): void {
    const c = this.add.container(this.scale.width / 2, this.scale.height * 0.28).setDepth(35);
    c.add(this.add.text(0, 0, title, { fontFamily: 'monospace', fontSize: '32px', color: '#ffd84a', stroke: '#0b0b14', strokeThickness: 6 }).setOrigin(0.5));
    c.add(this.add.text(0, 32, sub, { ...FONT, fontSize: '13px', stroke: '#0b0b14', strokeThickness: 4 }).setOrigin(0.5));
    c.setScale(0.6);
    this.tweens.add({ targets: c, scale: 1, duration: 250, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: 2200, duration: 600, onComplete: () => c.destroy() });
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
  panel?: Phaser.GameObjects.Container;
  private selected: string | null = null;

  private tracker!: Phaser.GameObjects.Text;
  private arrow!: Phaser.GameObjects.Graphics;
  private arrowLabel!: Phaser.GameObjects.Text;
  private markerTexts: Phaser.GameObjects.Text[] = [];
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
    const top = 8 + (this.touchButtons.length ? Math.ceil(this.touchButtons.length / 3) * 40 : 0);
    this.tracker.setPosition(this.scale.width - 8, top).setVisible(!!q && !this.panel && !this.questLog);
    this.arrow.clear();
    this.arrowLabel.setVisible(false);
    if (q) {
      this.tracker.setText(`${q.title}\n${progressText(q)}${log.active.length > 1 ? `  (+${log.active.length - 1})` : ''}`);
      const t = questTarget(q);
      if (t && !this.map && !this.panel && !this.questLog) {
        const wx = t.tx * TILE_PX + TILE_PX / 2;
        const wy = t.ty * TILE_PX + TILE_PX / 2;
        const sx = (wx - cam.worldView.x) * cam.zoom;
        const sy = (wy - cam.worldView.y) * cam.zoom;
        const cx = this.scale.width / 2;
        const cy = this.scale.height / 2;
        const dist = Math.round(Math.hypot(t.tx - ws.player.tile.tx, t.ty - ws.player.tile.ty));
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
        this.arrowLabel.setText(onScreen ? t.label : `${t.label} · ${dist}`).setPosition(ax - Math.cos(ang) * 30, ay - Math.sin(ang) * 30).setVisible(true);
      }
    }
    // !/? über NPCs
    let i = 0;
    for (const n of ws.npcs.npcs.values()) {
      const m = ws.markers.get(n.spawn.id);
      if (!m || this.map) continue;
      const t = (this.markerTexts[i] ??= this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '22px', stroke: '#0b0b14', strokeThickness: 5 }).setOrigin(0.5, 1).setDepth(5));
      const bob = Math.sin(this.time.now / 200) * 3;
      t.setText(m).setColor(m === '!' ? '#ffd84a' : '#4cb53e').setPosition((n.actor.x - cam.worldView.x) * cam.zoom, (n.actor.y - 66 - cam.worldView.y) * cam.zoom + bob).setVisible(true);
      i++;
    }
    for (; i < this.markerTexts.length; i++) this.markerTexts[i].setVisible(false);
  }

  /** Für Tests: löst den Klick auf ein benanntes Element im Heldenfenster aus. */
  clickPanel(name: string): boolean {
    const o = this.panel?.getByName(name) as Phaser.GameObjects.GameObject | null;
    if (!o) return false;
    o.emit('pointerdown');
    return true;
  }

  togglePanel(): void {
    if (this.panel) {
      this.panel.destroy();
      this.panel = undefined;
      debugState.panelOpen = false;
      return;
    }
    if (this.map) this.closeMap();
    this.buildPanel();
  }

  /** Heldenfenster: Werte, Talente, Ausrüstung, Inventar. Wird bei jeder Änderung neu aufgebaut. */
  buildPanel(): void {
    this.panel?.destroy();
    debugState.panelOpen = true;
    const ws = this.scene.get('world') as WorldScene;
    const hc = ws.hero;
    const h = hc.hero;
    const fs = finalStats(h);
    const W = Math.min(this.scale.width - 16, 400);
    const x0 = Math.round((this.scale.width - W) / 2);
    const c = this.add.container(x0, 8).setDepth(50);
    const H = Math.min(this.scale.height - 16, 600);
    c.add(this.add.rectangle(0, 0, W, H, 0x0b0b14, 0.94).setOrigin(0).setStrokeStyle(2, 0x2fe0d8, 0.8).setInteractive());
    const txt = (x: number, y: number, s: string, color = '#f4f0e8', size = 13) => {
      const t = this.add.text(x, y, s, { ...FONT, fontSize: `${size}px`, color });
      c.add(t);
      return t;
    };
    const button = (x: number, y: number, label: string, cb: () => void, enabled = true, name?: string) => {
      const b = this.add
        .text(x, y, label, { ...FONT, fontSize: '13px', color: enabled ? '#0b0b14' : '#6a6a7a', backgroundColor: enabled ? '#2fe0d8' : '#2a2a36', padding: { x: 6, y: 3 } })
        .setInteractive({ useHandCursor: enabled });
      if (name) b.setName(name);
      if (enabled) b.on('pointerdown', cb);
      c.add(b);
      return b;
    };
    let y = 10;
    txt(12, y, `${h.name ?? 'Held'} · ${RACES[h.race ?? 'human'].name} · Stufe ${h.level}`, '#2fe0d8', 17);
    button(W - 34, 8, '✕', () => this.togglePanel(), true, 'close');
    button(W - 104, 8, 'Aussehen', () => ws.editAppearance(), true, 'appearance');
    y += 26;
    txt(12, y, `EP ${h.xp}/${xpToNext(h.level)}   ◆ ${h.shards} Splitter   Tränke ${h.potions}`, '#ffd84a');
    y += 22;
    txt(12, y, `LP ${fs.maxHp}   Angriff ${fs.attack}   Vert. ${fs.defense}`);
    y += 18;
    txt(12, y, `Tempo ${Math.round(fs.speed * 100)} %   Regeneration ${fs.regen.toFixed(1)} LP/s`);
    y += 26;
    txt(12, y, `Talentpunkte: ${h.talentPoints}`, h.talentPoints ? '#ffd84a' : '#8a8aa0');
    y += 20;
    let bx = 12;
    for (const t of Object.keys(TALENTS) as Talent[]) {
      const b = button(bx, y, `+ ${TALENTS[t].name} (${h.talents[t]})`, () => hc.spend(t), h.talentPoints > 0, `talent-${t}`);
      bx += b.width + 6;
    }
    y += 34;
    txt(12, y, 'Ausrüstung (antippen = ablegen)', '#8a8aa0', 12);
    y += 18;
    const slots: [Slot, string][] = [['weapon', 'Waffe'], ['armor', 'Rüstung'], ['amulet', 'Amulett']];
    for (const [slot, label] of slots) {
      const it = h.equipped[slot];
      const row = this.add.rectangle(12, y, W - 24, 24, 0xffffff, 0.04).setOrigin(0).setInteractive({ useHandCursor: !!it }).setName(`slot-${slot}`);
      if (it) row.on('pointerdown', () => hc.unequip(slot));
      c.add(row);
      if (it) c.add(this.add.image(24, y + 12, ATLAS, `icon:${iconFor(it)}`));
      txt(38, y + 5, it ? `${it.name}` : `${label}: –`, it ? RARITY_COLOR[it.rarity] : '#6a6a7a', 12);
      if (it) txt(W - 16, y + 5, describeBonus(it.bonus), '#8a8aa0', 11).setOrigin(1, 0);
      y += 26;
    }
    y += 8;
    txt(12, y, `Inventar ${h.inventory.length}/${INVENTORY_SIZE}`, '#8a8aa0', 12);
    y += 18;
    const cell = Math.min(44, Math.floor((W - 24) / 6));
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const cx = 12 + (i % 6) * cell;
      const cy = y + Math.floor(i / 6) * cell;
      const it = h.inventory[i];
      const sel = it && it.id === this.selected;
      const r = this.add
        .rectangle(cx, cy, cell - 4, cell - 4, 0xffffff, sel ? 0.18 : 0.05)
        .setOrigin(0)
        .setStrokeStyle(1, it ? Phaser.Display.Color.HexStringToColor(RARITY_COLOR[it.rarity]).color : 0x2a2a36, it ? 0.9 : 0.6)
        .setName(`inv-${i}`);
      c.add(r);
      if (it) {
        r.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this.selected = it.id;
          this.buildPanel();
        });
        c.add(this.add.image(cx + (cell - 4) / 2, cy + (cell - 4) / 2, ATLAS, `icon:${iconFor(it)}`).setScale(2));
      }
    }
    y += 4 * cell + 6;
    const sel = h.inventory.find((i) => i.id === this.selected);
    if (sel) {
      txt(12, y, sel.name, RARITY_COLOR[sel.rarity], 14);
      y += 18;
      txt(12, y, `Stufe ${sel.level} · ${RARITY_NAME[sel.rarity]} · ${describeBonus(sel.bonus)}`, '#c0c0cc', 12);
      y += 20;
      const b = button(12, y, 'Anlegen', () => {
        hc.equip(sel.id);
        this.selected = null;
      }, true, 'equip');
      button(12 + b.width + 8, y, 'Wegwerfen', () => {
        hc.discard(sel.id);
        this.selected = null;
      }, true, 'discard');
    } else {
      txt(12, y, h.inventory.length ? 'Gegenstand antippen für Details.' : 'Besiege Gegner, um Beute zu finden.', '#6a6a7a', 12);
    }
    this.panel = c;
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
      d.choices.forEach((label, i) => {
        const b = this.add
          .text(bx, 92, `[${i + 1}] ${label}`, { ...FONT, fontSize: '14px', color: '#0b0b14', backgroundColor: i === 0 ? '#ffd84a' : '#8a8aa0', padding: { x: 8, y: 4 } })
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

  private buildMap(o: OverviewResult): void {
    this.mapWorker?.terminate();
    this.mapWorker = undefined;
    const biomes = new Uint8Array(o.biomes);
    const canvas = document.createElement('canvas');
    canvas.width = o.size;
    canvas.height = o.size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(o.size, o.size);
    for (let i = 0; i < biomes.length; i++) {
      const c = BIOMES[biomes[i]].mapColor;
      img.data[i * 4] = c >> 16;
      img.data[i * 4 + 1] = (c >> 8) & 255;
      img.data[i * 4 + 2] = c & 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mapTex = `map:${this.seed}`;
    if (this.textures.exists(this.mapTex)) this.textures.remove(this.mapTex);
    this.textures.addCanvas(this.mapTex, canvas);
    this.mapSize = o.size;
    debugState.mapReady = true;
    if (debugState.mapOpen) {
      this.closeMap();
      this.openMap();
    }
  }

  private toggleMap(): void {
    if (this.map) this.closeMap();
    else this.openMap();
  }

  private openMap(): void {
    debugState.mapOpen = true;
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setDepth(10);
    c.add(this.add.rectangle(0, 0, width, height, 0x05050c, 0.82).setOrigin(0));
    if (!this.mapSize) {
      c.add(this.add.text(width / 2, height / 2, 'Karte wird gezeichnet …', FONT).setOrigin(0.5));
      this.map = c;
      return;
    }
    const side = Math.min(width, height) - 80;
    this.mapImage = this.add.image(width / 2, height / 2 + 10, this.mapTex).setDisplaySize(side, side);
    c.add(this.mapImage);
    c.add(this.add.text(width / 2, height / 2 - side / 2 - 18, `Weltkarte – ${this.seed}`, { ...FONT, fontSize: '16px' }).setOrigin(0.5));
    this.marker = this.add.rectangle(0, 0, 8, 8).setStrokeStyle(2, 0xff3355);
    c.add(this.marker);
    this.map = c;
  }

  private closeMap(): void {
    debugState.mapOpen = false;
    this.map?.destroy();
    this.map = undefined;
    this.mapImage = undefined;
    this.marker = undefined;
  }

  update(): void {
    const ws = this.scene.get('world') as WorldScene;
    const { tx, ty } = ws.focusTile;
    const b = ws.chunks.biomeAt(tx, ty);
    const biomeName = b === undefined ? '…' : BIOMES[b].name;
    debugState.biome = biomeName;
    this.hud.setText(
      [`${ws.hero.hero.name ?? 'Held'} · Welt: ${this.seed}`, `Position: ${tx}, ${ty}`, `Gebiet: ${biomeName}`, `FPS: ${Math.round(this.game.loop.actualFps)}`].join('\n'),
    );
    this.help.setY(this.scale.height - 6);
    this.drawHp();
    this.drawQuests(ws);
    if (this.attackButton) {
      const ax = this.scale.width - 60;
      const ay = this.scale.height - 90;
      this.attackButton.setPosition(ax, ay);
      this.attackLabel!.setPosition(ax, ay);
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
    if (near && !this.map) {
      const cam = ws.cameras.main;
      const sx = (near.actor.x - cam.worldView.x) * cam.zoom;
      const sy = (near.actor.y - 52 - cam.worldView.y) * cam.zoom;
      const hint = ws.talkingTo || this.sys.game.device.input.touch ? '' : '  [E]';
      this.nameTag.setText(`${near.spawn.name}${hint}`).setPosition(Math.round(sx), Math.round(sy)).setVisible(true);
    } else {
      this.nameTag.setVisible(false);
    }

    if (this.marker && this.mapImage) {
      const side = this.mapImage.displayWidth;
      const scale = side / (WORLD_TILES * TILE_PX);
      const v = ws.cameras.main.worldView;
      this.marker.setPosition(this.mapImage.x - side / 2 + v.centerX * scale, this.mapImage.y - side / 2 + v.centerY * scale);
      this.marker.setSize(Math.max(6, v.width * scale), Math.max(6, v.height * scale));
    }
  }
}
