/** Bedienfeld des Perspektive-Prototyps (HTML über dem Spiel), Stil wie in der Kampf-Arena. */
import type { PerspectiveScene } from './PerspectiveScene';
import { PLACES } from './places';
import type { PerspSettings } from './settings';

const CSS = `
#persp-panel { position: fixed; top: 8px; right: 8px; width: 260px; max-height: calc(100vh - 16px); overflow: auto;
  background: #0b0b14dd; color: #f4f0e8; font: 13px monospace; border: 1px solid #2fe0d8; padding: 10px; z-index: 10; }
#persp-panel h3 { margin: 10px 0 6px; color: #2fe0d8; font-size: 13px; }
#persp-panel button { font: 12px monospace; background: #2a2a3a; color: #f4f0e8; border: 0; padding: 4px 7px; margin: 0 4px 4px 0; cursor: pointer; }
#persp-panel button.on { background: #ffd84a; color: #0b0b14; }
#persp-panel input[type=text] { font: 12px monospace; width: 150px; background: #14141f; color: #f4f0e8; border: 1px solid #2fe0d8; }
#persp-panel label { display: block; margin: 6px 0 2px; }
#persp-panel input[type=range] { width: 100%; }
#persp-panel .val { float: right; color: #ffd84a; }
#persp-panel pre { white-space: pre-wrap; background: #14141f; padding: 6px; font-size: 11px; margin: 0; }
`;

type NumKey = 'tilt' | 'fov' | 'zoom' | 'sight' | 'pixel';

export function buildPanel(scene: PerspectiveScene): HTMLElement {
  const style = document.createElement('style');
  style.textContent = CSS;
  const root = document.createElement('div');
  root.id = 'persp-panel';
  root.appendChild(style);
  root.addEventListener('keydown', (e) => e.stopPropagation());
  const h = (t: string) => root.appendChild(Object.assign(document.createElement('h3'), { textContent: t }));
  root.appendChild(Object.assign(document.createElement('pre'), { id: 'persp-stats' }));

  const sliders: { key: NumKey; input: HTMLInputElement; val: HTMLSpanElement; fmt: (v: number) => string }[] = [];
  const range = (key: NumKey, text: string, min: number, max: number, step: number, fmt: (v: number) => string) => {
    const l = document.createElement('label');
    const input = Object.assign(document.createElement('input'), { type: 'range', min: String(min), max: String(max), step: String(step), value: String(scene.s[key]) });
    input.id = `persp-${key}`;
    const val = Object.assign(document.createElement('span'), { className: 'val', textContent: fmt(scene.s[key]) });
    input.addEventListener('input', () => scene.set({ [key]: Number(input.value) } as Partial<PerspSettings>));
    input.addEventListener('change', () => input.blur());
    l.append(text, val, input);
    root.appendChild(l);
    sliders.push({ key, input, val, fmt });
  };
  const options = <T extends string | number | boolean>(items: { id: T; name: string }[], current: () => T, fn: (id: T) => void) => {
    const row = document.createElement('div');
    const bs = items.map((it) => {
      const b = Object.assign(document.createElement('button'), { textContent: it.name });
      b.addEventListener('click', () => {
        fn(it.id);
        b.blur();
      });
      row.appendChild(b);
      return { b, it };
    });
    root.appendChild(row);
    const sync = () => bs.forEach(({ b, it }) => b.classList.toggle('on', current() === it.id));
    sync();
    scene.events.on('settings', sync);
  };

  h('Kamera');
  options([0, 30, 50].map((t) => ({ id: t, name: `${t}°` })), () => scene.s.tilt, (t) => scene.set({ tilt: t }));
  range('tilt', 'Neigung', 0, 70, 1, (v) => `${Math.round(v)}°`);
  range('fov', 'Blickwinkel (FOV)', 10, 90, 1, (v) => `${v}°`);
  range('zoom', 'Zoom', 1, 4, 0.25, (v) => `${v}×`);
  range('sight', 'Sichtweite (Kacheln)', 10, 60, 1, (v) => `${v}`);
  range('pixel', 'Bodenpixel (grob)', 1, 3, 1, (v) => `${v}`);
  h('Ferne');
  options([{ id: 'dunst' as const, name: 'Dunst' }, { id: 'dunkel' as const, name: 'Abdunkeln' }], () => scene.s.fog, (f) => scene.set({ fog: f }));
  h('Darstellung');
  options([{ id: true, name: 'Wände aufrecht' }, { id: false, name: 'Wände flach' }], () => scene.s.walls, (v) => scene.set({ walls: v }));
  options([{ id: true, name: 'Sprites nach Tiefe' }, { id: false, name: 'gleich groß' }], () => scene.s.depthScale, (v) => scene.set({ depthScale: v }));

  h('Welt');
  options(PLACES, () => scene.s.place, (id) => scene.goTo(id));
  const seed = Object.assign(document.createElement('input'), { type: 'text', value: scene.s.seed, id: 'persp-seed' });
  const go = Object.assign(document.createElement('button'), { textContent: 'Seed laden' });
  go.addEventListener('click', () => scene.setSeed(seed.value));
  seed.addEventListener('keydown', (e) => e.key === 'Enter' && scene.setSeed(seed.value));
  root.append(seed, ' ', go);
  const back = document.createElement('p');
  back.innerHTML = '<a href="./" style="color:#8a8aa0">← zum Spiel</a>';
  root.appendChild(back);

  scene.events.on('settings', () => {
    for (const s of sliders) {
      if (document.activeElement !== s.input) s.input.value = String(scene.s[s.key]);
      s.val.textContent = s.fmt(scene.s[s.key]);
    }
  });
  document.body.appendChild(root);
  return root;
}
