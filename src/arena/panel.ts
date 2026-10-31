/** Bedienfeld der Kampf-Arena (HTML über dem Spiel): Gegner, Einstellungen, Regler für die Kampfwerte. */
import { ENEMIES, type EnemyKind } from '../combat/enemies';
import { TUNABLES } from '../combat/tuning';
import type { ArenaScene, SpawnPlace } from './ArenaScene';
import { LAYOUTS } from './layouts';
import { WEAPON_CHOICES, type WeaponChoice } from './weapons';

const CSS = `
#arena-panel { position: fixed; top: 8px; right: 8px; width: 270px; max-height: calc(100vh - 16px); overflow: auto;
  background: #0b0b14ee; color: #f4f0e8; font: 13px monospace; border: 1px solid #2fe0d8; padding: 10px; z-index: 10; }
#arena-panel h3 { margin: 10px 0 6px; color: #2fe0d8; font-size: 13px; }
#arena-panel button { font: 12px monospace; background: #2fe0d8; color: #0b0b14; border: 0; padding: 4px 7px; margin: 0 4px 4px 0; cursor: pointer; }
#arena-panel button.alt { background: #8a8aa0; }
#arena-panel button.opt { background: #2a2a3a; color: #f4f0e8; }
#arena-panel button.opt.on { background: #ffd84a; color: #0b0b14; }
#arena-panel select { font: 12px monospace; width: 100%; background: #14141f; color: #f4f0e8; border: 1px solid #2fe0d8; }
#arena-panel .row { margin: 4px 0; }
#arena-panel label { display: block; margin: 6px 0 2px; }
#arena-panel input[type=range] { width: 100%; }
#arena-panel .val { float: right; color: #ffd84a; }
#arena-stats { color: #f4f0e8; }
#arena-panel pre { white-space: pre-wrap; background: #14141f; padding: 6px; font-size: 11px; }
`;

export function buildPanel(scene: ArenaScene, changed: () => void): HTMLElement {
  if (!document.getElementById('arena-css')) {
    const style = document.createElement('style');
    style.id = 'arena-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const root = document.createElement('div');
  root.id = 'arena-panel';
  // Tastendrücke in Eingabefeldern nicht ans Spiel weiterreichen
  root.addEventListener('keydown', (e) => e.stopPropagation());
  const h = (text: string) => root.appendChild(Object.assign(document.createElement('h3'), { textContent: text }));
  const button = (text: string, fn: () => void, alt = false) => {
    const b = Object.assign(document.createElement('button'), { textContent: text });
    if (alt) b.className = 'alt';
    b.addEventListener('click', () => {
      fn();
      b.blur(); // Fokus zurück ans Spiel (Leertaste soll wieder zuschlagen)
    });
    root.appendChild(b);
    return b;
  };
  const check = (text: string, value: boolean, fn: (v: boolean) => void) => {
    const l = document.createElement('label');
    const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: value });
    c.addEventListener('change', () => {
      fn(c.checked);
      c.blur();
    });
    l.append(c, ` ${text}`);
    root.appendChild(l);
  };

  /** Gruppe von Auswahlknöpfen (einer ist aktiv). */
  const options = <T>(label: string, items: { id: T; name: string }[], current: T, fn: (id: T) => void) => {
    const row = Object.assign(document.createElement('div'), { className: 'row' });
    if (label) row.append(`${label} `);
    const bs = items.map((it) => {
      const b = Object.assign(document.createElement('button'), { textContent: it.name, className: `opt${it.id === current ? ' on' : ''}` });
      b.addEventListener('click', () => {
        bs.forEach((o) => o.classList.toggle('on', o === b));
        fn(it.id);
        b.blur();
      });
      row.appendChild(b);
      return b;
    });
    root.appendChild(row);
  };
  const range = (text: string, min: number, max: number, value: number, fn: (v: number) => void, id?: string) => {
    const l = document.createElement('label');
    const input = Object.assign(document.createElement('input'), { type: 'range', min: String(min), max: String(max), step: '1', value: String(value) });
    if (id) input.id = id;
    const val = Object.assign(document.createElement('span'), { className: 'val', textContent: String(value) });
    input.addEventListener('input', () => {
      val.textContent = input.value;
      fn(Number(input.value));
    });
    l.append(text, val, input);
    root.appendChild(l);
  };

  const stats = Object.assign(document.createElement('pre'), { id: 'arena-stats' });
  root.appendChild(stats);

  h('Gelände');
  options('', LAYOUTS, scene.layout.id, (id) => scene.setLayout(id));

  h('Waffe');
  const sel = Object.assign(document.createElement('select'), { id: 'arena-weapon' });
  sel.setAttribute('aria-label', 'Waffe');
  for (const c of WEAPON_CHOICES) sel.appendChild(Object.assign(document.createElement('option'), { value: c.id, textContent: c.name, selected: c.id === scene.weaponChoice }));
  root.appendChild(sel);
  const winfo = Object.assign(document.createElement('pre'), { id: 'arena-weapon-info' });
  const showWeapon = () => (winfo.textContent = scene.weaponInfo());
  sel.addEventListener('change', () => {
    scene.setWeapon(sel.value as WeaponChoice, scene.weaponLevel);
    showWeapon();
    sel.blur();
  });
  range('Stufe der Waffe', 1, 20, scene.weaponLevel, (v) => {
    scene.setWeapon(scene.weaponChoice, v);
    showWeapon();
  }, 'arena-weapon-level');
  root.appendChild(winfo);
  showWeapon();

  h('Gegner');
  options('Anzahl', [1, 3, 5].map((n) => ({ id: n, name: `${n}×` })), scene.count, (n) => scene.setSpawnOpts(n, scene.place));
  const places: { id: SpawnPlace; name: string }[] = [
    { id: 'random', name: 'zufällig' },
    { id: 'front', name: 'vor dem Helden' },
    { id: 'click', name: 'per Klick' },
  ];
  options('Ort', places, scene.place, (p) => scene.setSpawnOpts(scene.count, p));
  for (const k of Object.keys(ENEMIES) as EnemyKind[]) button(ENEMIES[k].name, () => scene.spawn(k));
  button('Welle (6 gemischt)', () => scene.spawn('wave'));
  button('Alle entfernen', () => scene.clearEnemies(), true);
  const lvl = document.createElement('label');
  const lvlIn = Object.assign(document.createElement('input'), { type: 'range', min: '1', max: '20', step: '1', value: String(scene.level) });
  const lvlVal = Object.assign(document.createElement('span'), { className: 'val', textContent: String(scene.level) });
  lvlIn.addEventListener('input', () => {
    scene.level = Number(lvlIn.value);
    lvlVal.textContent = lvlIn.value;
  });
  lvl.append('Stufe neuer Gegner', lvlVal, lvlIn);
  root.appendChild(lvl);
  check('Elite', scene.elite, (v) => (scene.elite = v));
  check('Gegner eingefroren', scene.frozen, (v) => (scene.frozen = v));
  check('Besiegte kommen wieder', scene.endless, (v) => (scene.endless = v));
  button('Statistik zurücksetzen', () => scene.resetStats(), true);

  h('Kampfwerte (live)');
  const inputs: { input: HTMLInputElement; val: HTMLSpanElement; t: (typeof TUNABLES)[number] }[] = [];
  for (const t of TUNABLES) {
    const l = document.createElement('label');
    const input = Object.assign(document.createElement('input'), { type: 'range', min: String(t.min), max: String(t.max), step: String(t.step), value: String(t.get()) });
    const val = Object.assign(document.createElement('span'), { className: 'val', textContent: String(t.get()) });
    input.dataset.id = t.id;
    input.addEventListener('input', () => {
      t.set(Number(input.value));
      val.textContent = input.value;
      changed();
    });
    l.append(t.label, val, input);
    root.appendChild(l);
    inputs.push({ input, val, t });
  }
  const sync = () => inputs.forEach(({ input, val, t }) => ((input.value = String(t.get())), (val.textContent = String(t.get()))));
  button('Zurücksetzen', () => {
    scene.resetTuning();
    sync();
  }, true);
  const pre = Object.assign(document.createElement('pre'), { id: 'arena-code' });
  button('Werte kopieren', () => (pre.textContent = `In die Zwischenablage kopiert (für src/combat/combat.ts):\n\n${scene.copyTuning()}`));
  root.appendChild(pre);
  const back = document.createElement('p');
  back.innerHTML = '<a href="./" style="color:#8a8aa0">← zum Spiel</a>';
  root.appendChild(back);
  document.body.appendChild(root);
  return root;
}
