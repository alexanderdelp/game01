/** Bedienfeld des Bewegungslabors (HTML über dem Spiel): Ort, Laufen, Stimmung, Gegner, Kampfwerte. */
import { ENEMIES, type EnemyKind } from '../combat/enemies';
import { TUNABLES, type Tunable } from '../combat/tuning';
import type { LabScene } from './LabScene';
import { MOOD_TUNABLES, MOVE_TUNABLES } from './labTuning';
import { PLACES } from './places';

const CSS = `
#labor-panel { position: fixed; top: 8px; right: 8px; width: 280px; max-height: calc(100vh - 16px); overflow: auto;
  background: #0b0b14ee; color: #f4f0e8; font: 13px monospace; border: 1px solid #9fd4ff; padding: 10px; z-index: 10; }
#labor-panel h3 { margin: 10px 0 6px; color: #9fd4ff; font-size: 13px; }
#labor-panel button { font: 12px monospace; background: #9fd4ff; color: #0b0b14; border: 0; padding: 4px 7px; margin: 0 4px 4px 0; cursor: pointer; }
#labor-panel button.alt { background: #8a8aa0; }
#labor-panel select, #labor-panel input[type=text] { font: 12px monospace; width: 100%; box-sizing: border-box; background: #14141f; color: #f4f0e8; border: 1px solid #9fd4ff; }
#labor-panel label { display: block; margin: 6px 0 2px; }
#labor-panel input[type=range] { width: 100%; }
#labor-panel .val { float: right; color: #ffd84a; }
#labor-panel pre { white-space: pre-wrap; background: #14141f; padding: 6px; font-size: 11px; }
#labor-panel details summary { cursor: pointer; color: #9fd4ff; margin: 10px 0 4px; }
`;

export function buildLabPanel(scene: LabScene): HTMLElement {
  if (!document.getElementById('labor-css')) {
    const style = document.createElement('style');
    style.id = 'labor-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const root = document.createElement('div');
  root.id = 'labor-panel';
  root.addEventListener('keydown', (e) => e.stopPropagation());
  const add = <T extends HTMLElement>(el: T, parent: HTMLElement = root) => (parent.appendChild(el), el);
  const h = (text: string) => add(Object.assign(document.createElement('h3'), { textContent: text }));
  const button = (text: string, fn: () => void, alt = false, parent: HTMLElement = root) => {
    const b = Object.assign(document.createElement('button'), { textContent: text, className: alt ? 'alt' : '' });
    b.addEventListener('click', () => {
      fn();
      b.blur();
    });
    return add(b, parent);
  };
  const sliders: { input: HTMLInputElement; val: HTMLSpanElement; t: Tunable }[] = [];
  const slider = (t: Tunable, parent: HTMLElement = root) => {
    const l = document.createElement('label');
    const input = Object.assign(document.createElement('input'), { type: 'range', min: String(t.min), max: String(t.max), step: String(t.step), value: String(t.get()) });
    const val = Object.assign(document.createElement('span'), { className: 'val', textContent: String(t.get()) });
    input.dataset.id = t.id;
    input.addEventListener('input', () => {
      t.set(Number(input.value));
      val.textContent = input.value;
      scene.saveTuning();
    });
    l.append(t.label, val, input);
    add(l, parent);
    sliders.push({ input, val, t });
  };
  const sync = () => sliders.forEach(({ input, val, t }) => ((input.value = String(t.get())), (val.textContent = String(t.get()))));

  add(Object.assign(document.createElement('pre'), { id: 'labor-stats' }));

  h('Ort');
  const sel = add(Object.assign(document.createElement('select'), { id: 'labor-place' }));
  sel.setAttribute('aria-label', 'Ort');
  for (const p of PLACES) sel.appendChild(Object.assign(document.createElement('option'), { value: p.id, textContent: p.name, selected: p.id === scene.place.id }));
  if (scene.place.id === 'eigen') sel.appendChild(Object.assign(document.createElement('option'), { value: 'eigen', textContent: scene.place.name, selected: true }));
  sel.addEventListener('change', () => scene.setPlace(sel.value));
  const own = add(Object.assign(document.createElement('input'), { type: 'text', placeholder: 'eigener Ort: seed,x,y', id: 'labor-own' }));
  own.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && /^[^,]+,\d+,\d+$/.test(own.value.trim())) scene.setPlace(own.value.trim());
  });

  h('Laufen');
  MOVE_TUNABLES.forEach((t) => slider(t));
  h('Stimmung & Kamera');
  MOOD_TUNABLES.forEach((t) => slider(t));

  h('Gegner (vor dem Helden)');
  for (const k of Object.keys(ENEMIES) as EnemyKind[]) button(ENEMIES[k].name, () => scene.spawn(k));
  button('Welle (6)', () => scene.spawn('wave'));
  button('Alle entfernen', () => scene.clearEnemies(), true);
  const lvl = document.createElement('label');
  const lvlIn = Object.assign(document.createElement('input'), { type: 'range', min: '1', max: '20', step: '1', value: String(scene.level) });
  const lvlVal = Object.assign(document.createElement('span'), { className: 'val', textContent: String(scene.level) });
  lvlIn.addEventListener('input', () => {
    scene.level = Number(lvlIn.value);
    lvlVal.textContent = lvlIn.value;
  });
  lvl.append('Stufe neuer Gegner', lvlVal, lvlIn);
  add(lvl);

  const more = add(document.createElement('details'));
  more.appendChild(Object.assign(document.createElement('summary'), { textContent: 'Kampfwerte (wie Arena)' }));
  TUNABLES.filter((t) => t.id !== 'move.speed').forEach((t) => slider(t, more));

  h('Werte');
  button('Zurücksetzen', () => {
    scene.resetTuning();
    sync();
  }, true);
  const pre = Object.assign(document.createElement('pre'), { id: 'labor-code' });
  button('Werte kopieren', () => (pre.textContent = `In die Zwischenablage kopiert:\n\n${scene.copyTuning()}`));
  add(pre);
  const back = document.createElement('p');
  back.innerHTML = '<a href="./?arena=1" style="color:#8a8aa0">Kampf-Arena</a> · <a href="./" style="color:#8a8aa0">zum Spiel</a>';
  add(back);
  document.body.appendChild(root);
  return root;
}
