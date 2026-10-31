import { describe, expect, it } from 'vitest';
import { BANNER_MS, BannerQueue } from '../../src/ui/bannerQueue';
import { areaText } from '../../src/quests/quests';

describe('M16 – Banner-Warteschlange', () => {
  it('zeigt Banner nacheinander, jedes mindestens 5 s, ohne Dubletten', () => {
    const q = new BannerQueue();
    q.push({ title: 'A', sub: '' });
    q.push({ title: 'B', sub: '' });
    q.push({ title: 'B', sub: 'doppelt' });
    expect(q.step(0)).toEqual({ show: { title: 'A', sub: '' } });
    q.push({ title: 'A', sub: 'läuft gerade' });
    expect(q.pending).toBe(1);
    expect(q.step(BANNER_MS - 1)).toBeNull();
    expect(q.step(BANNER_MS)).toEqual({ show: { title: 'B', sub: '' } });
    expect(q.step(2 * BANNER_MS - 1)).toBeNull();
    expect(q.step(2 * BANNER_MS)).toBe('hide');
    expect(q.step(3 * BANNER_MS)).toBeNull();
  });

  it('Hinweise bleiben, bis man klickt oder (nach 5 s) losläuft', () => {
    const q = new BannerQueue();
    q.push({ title: 'Tipp', sub: '', sticky: true });
    q.step(0);
    expect(q.step(60_000)).toBeNull();
    q.noteMoved();
    expect(q.step(60_001)).toBe('hide');

    q.push({ title: 'Tipp 2', sub: '', sticky: true });
    q.step(70_000);
    q.noteMoved();
    expect(q.step(70_000 + BANNER_MS - 1)).toBeNull();
    q.push({ title: 'Tipp 3', sub: '', sticky: true });
    q.step(70_100);
    q.noteClicked();
    expect(q.step(70_200)).toEqual({ show: { title: 'Tipp 3', sub: '', sticky: true } });
  });
});

describe('M16 – ungefähres Zielgebiet', () => {
  const places = [{ name: 'Altmoor', tx: 100, ty: 100 }];
  it('nennt den nächsten Ort, Richtung und Entfernung', () => {
    expect(areaText(places, { tx: 110, ty: 95 }, { tx: 0, ty: 95 })).toBe('bei Altmoor (Osten, 110)');
  });
  it('ohne Ort in der Nähe nur Richtung', () => {
    expect(areaText(places, { tx: 500, ty: 0 }, { tx: 500, ty: 300 })).toBe('im Norden · 300');
  });
});
