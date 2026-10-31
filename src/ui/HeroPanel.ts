import Phaser from 'phaser';
import { debugState } from '../debug';
import { iconFor } from '../entities/HeroController';
import { ATLAS } from '../render/textures';
import { RARITY_COLOR, RARITY_NAME, SLOTS, SLOT_NAME, describeBonus, type Item } from '../rpg/items';
import { INVENTORY_SIZE, TALENTS, finalStats, xpToNext, type Talent } from '../rpg/progression';
import { RACES } from '../rpg/races';
import { reputationRank } from '../state/worldState';
import type { WorldScene } from '../scenes/WorldScene';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#f4f0e8' };

/** Heldenfenster (Taste C/I): Werte, Talente, Ansehen, Ausrüstung und Inventar (M5, M23). */
export class HeroPanel {
  /** Geöffnetes Fenster (oder undefined). */
  container?: Phaser.GameObjects.Container;
  private selected: string | null = null;
  private lastItemClick = 0;

  constructor(private readonly ui: Phaser.Scene) {
    debugState.panelOpen = false;
  }

  close(): void {
    this.container?.destroy();
    this.container = undefined;
    debugState.panelOpen = false;
  }

  /** Symbol eines Gegenstands, Kleidung in ihrer Farbe getönt. */
  private itemIcon(it: Item, x: number, y: number): Phaser.GameObjects.Image {
    const img = this.ui.add.image(x, y, ATLAS, `icon:${iconFor(it)}`);
    const pal = this.ui.cache.json.get('lpc-palettes') as Record<string, Record<string, string[]>> | undefined;
    const tintable = it.slot === 'legs' || it.slot === 'feet' || (it.slot === 'armor' && it.base !== 'leather' && it.base !== 'plate');
    const hex = it.color && pal?.cloth[it.color]?.[4];
    if (tintable && hex) img.setTint(parseInt(hex.slice(1), 16));
    return img;
  }

  /** Heldenfenster: Werte, Talente, Ausrüstung, Inventar. Wird bei jeder Änderung neu aufgebaut. */
  build(): void {
    this.container?.destroy();
    debugState.panelOpen = true;
    const ws = this.ui.scene.get('world') as WorldScene;
    const hc = ws.hero;
    const h = hc.hero;
    const fs = finalStats(h);
    const W = Math.min(this.ui.scale.width - 16, 400);
    const x0 = Math.round((this.ui.scale.width - W) / 2);
    const c = this.ui.add.container(x0, 8).setDepth(50);
    const H = Math.min(this.ui.scale.height - 16, 660);
    c.add(this.ui.add.rectangle(0, 0, W, H, 0x0b0b14, 0.94).setOrigin(0).setStrokeStyle(2, 0x2fe0d8, 0.8).setInteractive());
    const txt = (x: number, y: number, s: string, color = '#f4f0e8', size = 13) => {
      const t = this.ui.add.text(x, y, s, { ...FONT, fontSize: `${size}px`, color });
      c.add(t);
      return t;
    };
    const button = (x: number, y: number, label: string, cb: () => void, enabled = true, name?: string) => {
      const b = this.ui.add
        .text(x, y, label, { ...FONT, fontSize: '13px', color: enabled ? '#0b0b14' : '#6a6a7a', backgroundColor: enabled ? '#2fe0d8' : '#2a2a36', padding: { x: 6, y: 3 } })
        .setInteractive({ useHandCursor: enabled });
      if (name) b.setName(name);
      if (enabled) b.on('pointerdown', cb);
      c.add(b);
      return b;
    };
    let y = 10;
    txt(12, y, `${h.name ?? 'Held'} · ${RACES[h.race ?? 'human'].name} · Stufe ${h.level}`, '#2fe0d8', 17);
    button(W - 34, 8, '✕', () => this.close(), true, 'close');
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
    y += 30;
    const pl = ws.myPledge();
    if (pl !== null) {
      const m = ws.world.meta;
      txt(12, y, `Gefolgsmann von ${m.realms[pl].name} · Feind von ${m.realms[m.rivals[pl]].name}`, '#ffd84a', 12);
      y += 18;
    }
    const reps = ws.world.meta.realms.map((r) => ({ r, v: ws.state.d.reputation.get(r.id) ?? 0 })).filter((x) => x.v > 0);
    if (reps.length) {
      txt(12, y, `Ansehen: ${reps.map((x) => `${x.r.name} ${reputationRank(x.v).title} (${x.v})`).join(' · ')}`, '#c4a8ff', 11).setWordWrapWidth(W - 24);
      y += reps.length > 2 ? 30 : 18;
    }
    y += 4;
    txt(12, y, 'Ausrüstung (antippen = ablegen)', '#8a8aa0', 12);
    y += 18;
    for (const slot of SLOTS) {
      const label = SLOT_NAME[slot];
      const it = h.equipped[slot];
      const row = this.ui.add.rectangle(12, y, W - 24, 24, 0xffffff, 0.04).setOrigin(0).setInteractive({ useHandCursor: !!it }).setName(`slot-${slot}`);
      if (it) row.on('pointerdown', () => hc.unequip(slot));
      c.add(row);
      if (it) c.add(this.itemIcon(it, 24, y + 12));
      txt(38, y + 5, it ? `${it.name}` : `${label}: –`, it ? RARITY_COLOR[it.rarity] : '#6a6a7a', 12);
      if (it) txt(W - 16, y + 5, describeBonus(it.bonus), '#8a8aa0', 11).setOrigin(1, 0);
      y += 26;
    }
    y += 8;
    txt(12, y, `Inventar ${h.inventory.length}/${INVENTORY_SIZE}`, '#8a8aa0', 12);
    y += 18;
    // Raster passt sich der Höhe an, damit Details und „Anlegen“ immer im Fenster bleiben (niedrige Laptop-Fenster)
    const cell = Math.max(24, Math.min(44, Math.floor((W - 24) / 6), Math.floor((H - y - 72) / 4)));
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const cx = 12 + (i % 6) * cell;
      const cy = y + Math.floor(i / 6) * cell;
      const it = h.inventory[i];
      const sel = it && it.id === this.selected;
      const r = this.ui.add
        .rectangle(cx, cy, cell - 4, cell - 4, 0xffffff, sel ? 0.18 : 0.05)
        .setOrigin(0)
        .setStrokeStyle(1, it ? Phaser.Display.Color.HexStringToColor(RARITY_COLOR[it.rarity]).color : 0x2a2a36, it ? 0.9 : 0.6)
        .setName(`inv-${i}`);
      c.add(r);
      if (it) {
        r.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          // Doppelklick/-tipp legt direkt an
          const now = this.ui.time.now;
          if (this.selected === it.id && now - this.lastItemClick < 400) {
            hc.equip(it.id);
            this.selected = null;
            return;
          }
          this.lastItemClick = now;
          this.selected = it.id;
          this.build();
        });
        c.add(this.itemIcon(it, cx + (cell - 4) / 2, cy + (cell - 4) / 2).setScale(cell >= 40 ? 2 : 1.5));
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
      txt(12, y, h.inventory.length ? 'Antippen: Details · doppelt: anlegen' : 'Besiege Gegner, um Beute zu finden.', '#6a6a7a', 12);
    }
    this.container = c;
  }
}
