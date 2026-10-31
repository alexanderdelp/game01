import Phaser from 'phaser';
import { buildCharacter } from '../character/CharacterFactory';
import { DEFAULT_APPEARANCE, type Appearance } from '../character/lpc';
import { load, save } from '../game/save';
import { ATLAS } from '../render/textures';
import { generateItem, rollDrops, type Drop, type Item, type Slot } from '../rpg/items';
import { newQuestLog, onCollect, onKill, questDropFor, type Quest, type QuestLog } from '../quests/quests';
import {
  addItem, discard, drinkPotion, equip, finalStats, gainXp, newHero, spendTalent, unequip, xpForKill,
  type Hero, type Talent,
} from '../rpg/progression';
import { hash2, mulberry32 } from '../world/rng';
import type { Actor } from './Actor';
import type { Enemy } from './Enemy';
import type { PlayerCombat } from './PlayerCombat';

interface Pickup {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  drop: Drop;
  age: number;
}

const BASE_SPEED = 150;

/** Held: Fortschritt, Beute, Ausrüstung, Speichern. Verbindet die reine RPG-Logik mit Szene und Figur. */
export class HeroController {
  hero: Hero;
  private readonly pickups: Pickup[] = [];
  private dirty = false;
  private saveTimer = 0;
  private drops = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly seedName: string,
    private readonly actor: Actor,
    private readonly combat: PlayerCombat,
  ) {
    this.hero = load<Hero>(this.key) ?? newHero();
    this.hero.quests ??= newQuestLog();
    this.refresh(true);
  }

  private get key(): string {
    return `hero:${this.seedName}`;
  }

  get quests(): QuestLog {
    return this.hero.quests!;
  }

  /** Belohnung einer Quest auszahlen. */
  reward(r: Quest['reward']): string {
    const ups = gainXp(this.hero, r.xp);
    this.hero.shards += r.shards;
    let text = `+${r.xp} EP, +${r.shards} Splitter`;
    if (r.item) {
      const it = generateItem(this.hero.level, Math.random);
      if (addItem(this.hero, it)) text += `, ${it.name}`;
    }
    if (ups > 0) {
      this.refresh();
      this.combat.heal(this.combat.stats.maxHp);
      this.scene.events.emit('level-up', this.hero.level);
    }
    this.dirty = true;
    this.scene.events.emit('hero-changed');
    this.scene.events.emit('quests-changed');
    return text;
  }

  /** Aussehen der Figur abhängig von der Rüstung. */
  appearance(): Appearance {
    const armor = this.hero.equipped.armor;
    return { ...DEFAULT_APPEARANCE, ...this.hero.appearance, weapon: 'dagger', torso: armor?.base === 'leather' ? 'leather' : 'longsleeve' };
  }

  /** Endwerte und Aussehen neu anwenden. */
  refresh(initial = false): void {
    const s = finalStats(this.hero);
    this.combat.applyStats(s);
    if (initial) this.combat.heal(s.maxHp);
    this.actor.baseSpeed = BASE_SPEED * s.speed;
    this.actor.setPrefix(buildCharacter(this.scene, this.appearance()));
    this.dirty = true;
    this.scene.events.emit('hero-changed');
  }

  /** Gruppenerfahrung: ein Mitspieler hat in der Nähe einen Gegner besiegt. */
  shareXp(e: Enemy): void {
    const xp = xpForKill(e.def.kind, e.spawn.level, this.hero.race);
    const ups = gainXp(this.hero, xp);
    this.scene.events.emit('float', { x: this.actor.x, y: this.actor.y - 60, text: `+${xp} EP (Gruppe)`, color: '#ffd84a' });
    if (ups > 0) {
      this.refresh();
      this.combat.heal(this.combat.stats.maxHp);
      this.scene.events.emit('level-up', this.hero.level);
    }
    this.dirty = true;
  }

  onDefeated(e: Enemy): void {
    const xp = xpForKill(e.def.kind, e.spawn.level, this.hero.race);
    const ups = gainXp(this.hero, xp);
    this.scene.events.emit('float', { x: e.x, y: e.body.y - 10, text: `+${xp} EP`, color: '#ffd84a' });
    if (ups > 0) {
      this.refresh();
      this.combat.heal(this.combat.stats.maxHp);
      this.scene.events.emit('level-up', this.hero.level);
    }
    const rnd = mulberry32(hash2(Date.now() >>> 0, this.drops++, e.spawn.level, 5));
    const drops = rollDrops(e.spawn.level, rnd);
    if (onKill(this.quests, e.def.kind).length) this.scene.events.emit('quests-changed');
    const qd = questDropFor(this.quests, e.def.kind, rnd());
    if (qd && qd.objective.type === 'collect') drops.push({ type: 'quest', questId: qd.id, name: qd.objective.item });
    drops.forEach((d, i) => this.spawnPickup(e.x + (i - 1) * 14 + (rnd() - 0.5) * 8, e.y - 2 + (rnd() - 0.5) * 8, d));
    this.dirty = true;
  }

  private spawnPickup(x: number, y: number, drop: Drop): void {
    const icon = drop.type === 'shards' ? 'shards' : drop.type === 'potion' ? 'potion' : drop.type === 'quest' ? 'questitem' : iconFor(drop.item);
    const sprite = this.scene.add.image(x, y, ATLAS, `icon:${icon}`).setOrigin(0.5, 1).setDepth(y);
    this.scene.tweens.add({ targets: sprite, y: y - 10, duration: 180, yoyo: true, ease: 'Quad.easeOut' });
    this.pickups.push({ sprite, x, y, drop, age: 0 });
  }

  update(dt: number): void {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.age += dt;
      if (p.age < 0.35) continue;
      if (Math.hypot(p.x - this.actor.x, p.y - this.actor.y) > 22) {
        if (p.age > 120) {
          p.sprite.destroy();
          this.pickups.splice(i, 1);
        }
        continue;
      }
      if (!this.collect(p.drop)) continue;
      p.sprite.destroy();
      this.pickups.splice(i, 1);
    }
    this.saveTimer += dt;
    if (this.dirty && this.saveTimer > 1.5) this.persist();
  }

  private collect(d: Drop): boolean {
    let text = '';
    let color = '#f4f0e8';
    if (d.type === 'shards') {
      this.hero.shards += d.amount;
      text = `+${d.amount} Splitter`;
      color = '#3fc4d4';
    } else if (d.type === 'potion') {
      this.hero.potions++;
      text = '+1 Heiltrank';
      color = '#ff7080';
    } else if (d.type === 'quest') {
      const q = onCollect(this.quests, d.questId);
      text = q ? `${d.name} (${q.objective.done}/${q.objective.count})` : d.name;
      color = '#ffd84a';
      this.scene.events.emit('quests-changed');
    } else {
      if (!addItem(this.hero, d.item)) return false;
      text = d.item.name;
      color = { common: '#f4f0e8', rare: '#5aa8ff', epic: '#c47aff' }[d.item.rarity];
    }
    this.scene.events.emit('float', { x: this.actor.x, y: this.actor.y - 50, text, color });
    this.dirty = true;
    this.scene.events.emit('hero-changed');
    return true;
  }

  /** Beute einer Truhe: Splitter, Trank und garantiert ein Gegenstand. */
  lootChest(x: number, y: number): void {
    const rnd = mulberry32(hash2(Date.now() >>> 0, this.drops++, 77, 5));
    const lvl = this.hero.level + 1;
    const drops: Drop[] = [{ type: 'shards', amount: 8 + Math.floor(rnd() * 6 * lvl) }, { type: 'item', item: generateItem(lvl, rnd) }];
    if (rnd() < 0.5) drops.push({ type: 'potion' });
    drops.forEach((d, i) => this.spawnPickup(x + (i - 1) * 16, y + (rnd() - 0.5) * 6, d));
  }

  persist(): void {
    save(this.key, this.hero);
    this.dirty = false;
    this.saveTimer = 0;
  }

  // Aktionen aus dem Heldenfenster
  equip(id: string): void {
    if (equip(this.hero, id)) this.refresh();
  }
  unequip(slot: Slot): void {
    if (unequip(this.hero, slot)) this.refresh();
  }
  discard(id: string): void {
    if (discard(this.hero, id)) this.refresh();
  }
  spend(t: Talent): void {
    if (spendTalent(this.hero, t)) this.refresh();
  }
  drink(): void {
    const before = this.combat.stats.hp;
    const hp = drinkPotion(this.hero, before, this.combat.stats.maxHp);
    if (hp === before) return;
    this.combat.heal(hp);
    this.scene.events.emit('float', { x: this.actor.x, y: this.actor.y - 50, text: `+${Math.round(hp - before)} LP`, color: '#4cb53e' });
    this.dirty = true;
    this.scene.events.emit('hero-changed');
  }

  pickupPositions(): { x: number; y: number }[] {
    return this.pickups.map((p) => ({ x: p.x, y: p.y }));
  }

  /** Für Tests: Anzahl liegender Beutestücke. */
  get pickupCount(): number {
    return this.pickups.length;
  }
}

export function iconFor(item: Item): string {
  return item.slot === 'weapon' ? 'dagger' : item.slot === 'armor' ? item.base : 'amulet';
}
