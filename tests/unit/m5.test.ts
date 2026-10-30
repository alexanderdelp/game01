import { describe, expect, it } from 'vitest';
import { generateItem, rollDrops } from '../../src/rpg/items';
import { INVENTORY_SIZE, addItem, discard, drinkPotion, equip, finalStats, gainXp, newHero, spendTalent, unequip, xpForKill, xpToNext } from '../../src/rpg/progression';
import { mulberry32 } from '../../src/world/rng';

describe('Progression (R1)', () => {
  it('EP-Kurve steigt, Aufstieg gibt Talentpunkt und Werte', () => {
    expect(xpToNext(1)).toBe(20);
    expect(xpToNext(5)).toBeGreaterThan(xpToNext(4));
    const h = newHero();
    const before = finalStats(h);
    expect(gainXp(h, 19)).toBe(0);
    expect(gainXp(h, 1)).toBe(1);
    expect(h.level).toBe(2);
    expect(h.xp).toBe(0);
    expect(h.talentPoints).toBe(1);
    const after = finalStats(h);
    expect(after.maxHp).toBe(before.maxHp + 8);
    expect(after.attack).toBe(before.attack + 2);
    expect(gainXp(h, 10_000)).toBeGreaterThan(3);
  });

  it('stärkere Gegner geben mehr EP', () => {
    expect(xpForKill('bandit', 1)).toBeGreaterThan(xpForKill('slime', 1));
    expect(xpForKill('slime', 3)).toBeGreaterThan(xpForKill('slime', 1));
  });
});

describe('Talente und Ausrüstung (R2)', () => {
  it('Talente wirken, nur mit Punkten', () => {
    const h = newHero();
    expect(spendTalent(h, 'strength')).toBe(false);
    h.talentPoints = 3;
    spendTalent(h, 'strength');
    spendTalent(h, 'toughness');
    spendTalent(h, 'agility');
    const s = finalStats(h);
    expect(s.attack).toBe(14 + 3);
    expect(s.maxHp).toBe(100 + 15);
    expect(s.speed).toBeCloseTo(1.06);
  });

  it('Anlegen, Tauschen, Ablegen, Wegwerfen', () => {
    const h = newHero();
    const rnd = mulberry32(5);
    const w1 = generateItem(1, rnd, 'weapon');
    const w2 = generateItem(3, rnd, 'weapon');
    addItem(h, w1);
    addItem(h, w2);
    expect(equip(h, w1.id)).toBe(true);
    expect(finalStats(h).attack).toBe(14 + w1.bonus.attack!);
    expect(equip(h, w2.id)).toBe(true);
    expect(h.inventory.map((i) => i.id)).toEqual([w1.id]);
    expect(unequip(h, 'weapon')).toBe(true);
    expect(finalStats(h).attack).toBe(14);
    expect(discard(h, w1.id)).toBe(true);
    expect(h.inventory).toHaveLength(1);
    for (let i = 0; i < 40; i++) addItem(h, generateItem(1, rnd));
    expect(h.inventory).toHaveLength(INVENTORY_SIZE);
  });
});

describe('Beute (R3)', () => {
  it('Seltenheit und Stufe heben die Werte, Namen entstehen', () => {
    const rnd = mulberry32(42);
    const items = Array.from({ length: 600 }, (_, i) => generateItem(1 + (i % 10), rnd));
    const rarities = new Set(items.map((i) => i.rarity));
    expect(rarities).toEqual(new Set(['common', 'rare', 'epic']));
    const avg = (lvl: number) => {
      const w = items.filter((i) => i.slot === 'weapon' && i.level === lvl && i.rarity === 'common');
      return w.reduce((s, i) => s + i.bonus.attack!, 0) / w.length;
    };
    expect(avg(9)).toBeGreaterThan(avg(1));
    expect(items.some((i) => i.name.includes('-') && i.rarity !== 'common')).toBe(true);
    expect(items.some((i) => i.name.split(' ').length > 2 && i.rarity === 'epic')).toBe(true);
  });

  it('Beute fällt mit Splittern, gelegentlich Tränke und Gegenstände', () => {
    const rnd = mulberry32(7);
    const all = Array.from({ length: 400 }, () => rollDrops(2, rnd)).flat();
    expect(all.filter((d) => d.type === 'shards').length).toBeGreaterThan(300);
    expect(all.some((d) => d.type === 'potion')).toBe(true);
    expect(all.some((d) => d.type === 'item')).toBe(true);
  });
});

describe('Heiltrank (R8)', () => {
  it('heilt 50 % und verbraucht einen Trank', () => {
    const h = newHero();
    expect(drinkPotion(h, 20, 100)).toBe(70);
    expect(h.potions).toBe(0);
    expect(drinkPotion(h, 20, 100)).toBe(20);
  });
});
