import { describe, expect, it } from 'vitest';
import { Dodge, PLAYER_BLOCK, PLAYER_DODGE, guardAgainst, inFront } from '../../src/combat/combat';
import { TUNABLES, exportCode } from '../../src/combat/tuning';
import { moveBox, type Box } from '../../src/world/collision';

const S = Math.SQRT1_2;
const B = { ...PLAYER_BLOCK, damageFactor: 0.2, halfAngle: 70, parryWindow: 0.15, knockFactor: 0.35 };
const D = { speed: 400, duration: 0.2, invuln: 0.15, cooldown: 0.3 };

describe('M31 R1 – Blocken und Parieren', () => {
  it('Abwehrwinkel: vorn und schräg vorn ja, seitlich und hinten nein (auch diagonal gezielt)', () => {
    const right = { x: 1, y: 0 };
    expect(inFront(right, 0, 0, 40, 0, 70)).toBe(true);
    expect(inFront(right, 0, 0, 40, 30, 70)).toBe(true); // ~37°
    expect(inFront(right, 0, 0, 0, 40, 70)).toBe(false); // 90°
    expect(inFront(right, 0, 0, -40, 0, 70)).toBe(false);
    const downRight = { x: S, y: S };
    expect(inFront(downRight, 0, 0, 30, 30, 70)).toBe(true);
    expect(inFront(downRight, 0, 0, 0, 40, 70)).toBe(true); // 45°
    expect(inFront(downRight, 0, 0, -30, -30, 70)).toBe(false);
    expect(inFront(right, 0, 0, 0, 0, 70)).toBe(false);
  });

  it('Block verringert Schaden und Rückstoß von vorn, von hinten nicht, ohne Block nie', () => {
    const aim = { x: 0, y: 1 };
    expect(guardAgainst(aim, 0, 0, 0, 40, 0.5, B)).toEqual({ kind: 'block', damageFactor: 0.2, knockFactor: 0.35 });
    expect(guardAgainst(aim, 0, 0, 0, -40, 0.5, B).kind).toBe('hit');
    expect(guardAgainst(aim, 0, 0, 0, 40, null, B).kind).toBe('hit');
  });

  it('Parade nur im Zeitfenster und nur von vorn: kein Schaden', () => {
    const aim = { x: -1, y: 0 };
    expect(guardAgainst(aim, 0, 0, -40, 0, 0, B)).toEqual({ kind: 'parry', damageFactor: 0, knockFactor: 0 });
    expect(guardAgainst(aim, 0, 0, -40, 0, 0.15, B).kind).toBe('parry');
    expect(guardAgainst(aim, 0, 0, -40, 0, 0.16, B).kind).toBe('block');
    expect(guardAgainst(aim, 0, 0, 40, 0, 0.05, B).kind).toBe('hit');
  });
});

describe('M31 R2 – Ausweichen', () => {
  it('bewegt schnell um Tempo × Dauer, dann Abklingzeit, erst danach wieder', () => {
    const d = new Dodge();
    expect(d.start({ x: 1, y: 0 }, D)).toBe(true);
    let x = 0;
    for (let i = 0; i < 30 && d.active; i++) x += d.step(1 / 60, D).x;
    expect(x).toBeCloseTo(80, 5); // 400 px/s × 0,2 s – 2,5 Kacheln, schneller als Sprinten (240 px/s)
    expect(d.active).toBe(false);
    expect(d.start({ x: 1, y: 0 }, D)).toBe(false); // Abklingzeit
    for (let i = 0; i < 17; i++) d.step(1 / 60, D);
    expect(d.ready).toBe(false);
    d.step(1 / 60, D);
    expect(d.ready).toBe(true);
    expect(d.start({ x: 0, y: -1 }, D)).toBe(true);
  });

  it('nicht während eines Sprungs neu starten, diagonal normiert', () => {
    const d = new Dodge();
    d.start({ x: 1, y: 1 }, D);
    expect(d.start({ x: -1, y: 0 }, D)).toBe(false);
    const s = d.step(0.1, D);
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(40, 5);
    expect(s.x).toBeCloseTo(s.y, 5);
  });

  it('unverwundbar nur im vorderen Teil des Sprungs', () => {
    const d = new Dodge();
    expect(d.invulnerable(D)).toBe(false);
    d.start({ x: 0, y: 1 }, D);
    expect(d.invulnerable(D)).toBe(true);
    d.step(0.1, D);
    expect(d.invulnerable(D)).toBe(true);
    d.step(0.06, D);
    expect(d.invulnerable(D)).toBe(false); // 0,16 s > 0,15 s
    expect(d.active).toBe(true);
  });

  it('der Weg geht über moveBox: eine Wand hält den Sprung auf', () => {
    const d = new Dodge();
    d.start({ x: 1, y: 0 }, D);
    const wall = (b: Box) => b.x + b.w > 50;
    let box: Box = { x: 0, y: 0, w: 16, h: 8 };
    while (d.active) {
      const s = d.step(1 / 60, D);
      const m = moveBox(box, s.x, s.y, wall);
      box = { ...box, x: m.x, y: m.y };
    }
    expect(box.x + box.w).toBeLessThanOrEqual(50);
    expect(box.x + box.w).toBeGreaterThan(44);
  });
});

describe('M31 R3 – Regler', () => {
  it('alle neuen Werte haben Regler und stehen im kopierten Code', () => {
    const ids = TUNABLES.map((t) => t.id);
    for (const k of Object.keys(PLAYER_BLOCK)) expect(ids).toContain(`block.${k}`);
    for (const k of Object.keys(PLAYER_DODGE)) expect(ids).toContain(`dodge.${k}`);
    const code = exportCode();
    expect(code).toContain('export const PLAYER_BLOCK = {');
    expect(code).toContain('export const PLAYER_DODGE = {');
    expect(code).toContain(`parryWindow: ${PLAYER_BLOCK.parryWindow},`);
  });
});
