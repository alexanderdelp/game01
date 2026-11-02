/**
 * Werkstatt des Legenden-Modus: alle Einstellungen der Vorgeschichte als Formular. Einfache Felder kommen aus dem
 * Schema (`history/schema.ts`), die Tabellen aus den Registern (Systeme, Weltereignisse) – Neues erscheint von selbst.
 * Die Konfiguration steht als `hc` in der URL: Link teilen, im Spiel öffnen, neu erzeugen.
 */
import { DEFAULT_CONFIG, PRESETS, encodeConfig, resolveConfig, totalYears, type HistoryConfig } from '../history/config';
import { SECTIONS, getPath, setPath, type Field } from '../history/schema';
import { SYSTEMS } from '../history/systems';
import { RACE_NAMES, type History, type Race } from '../history/types';
import { MOD_LABELS, WORLD_EVENTS, type ModKey } from '../history/worldEvents';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const DETAILS = ['0 Sage', '1 Chronik', '2 voll', '3 lebende Familien'];

/** Eingabefeld, das in `data-p` seinen Pfad trägt. */
const num = (path: string, v: number, min?: number, max?: number, step?: number, w = 72) =>
  `<input type="number" data-p="${path}" value="${v}"${min !== undefined ? ` min="${min}"` : ''}${max !== undefined ? ` max="${max}"` : ''}${step !== undefined ? ` step="${step}"` : ''} style="width:${w}px">`;
const bool = (path: string, v: boolean) => `<input type="checkbox" data-p="${path}"${v ? ' checked' : ''}>`;
const text = (path: string, v: string, w = 110) => `<input data-p="${path}" value="${esc(v)}" style="width:${w}px">`;

function field(c: HistoryConfig, f: Field): string {
  const v = getPath(c, f.path);
  const def = getPath(DEFAULT_CONFIG, f.path);
  const changed = JSON.stringify(v) !== JSON.stringify(def) ? ' class="chg"' : '';
  const input = f.kind === 'bool' ? bool(f.path, Boolean(v)) : num(f.path, Number(v), f.min, f.max, f.step);
  return `<label${changed} title="${esc(f.help ?? '')}">${esc(f.label)} ${input}</label>`;
}

function table(c: HistoryConfig, kind: string): string {
  switch (kind) {
    case 'epochs':
      return `<table class="ws"><tr><th>Name</th><th>Jahre</th><th>Schritt</th><th>Detail</th><th>Mindestbedeutung</th><th>Klarheit</th><th></th></tr>
        ${c.epochs.map((e, i) => `<tr><td>${text(`epochs.${i}.label`, e.label)}</td><td>${num(`epochs.${i}.years`, e.years, 10, 20000, 50)}</td><td>${num(`epochs.${i}.step`, e.step, 1, 500, 1, 60)}</td>
          <td><select data-p="epochs.${i}.detail">${DETAILS.map((d, k) => `<option value="${k}"${k === e.detail ? ' selected' : ''}>${d}</option>`).join('')}</select></td>
          <td>${num(`epochs.${i}.minImportance`, e.minImportance, 0, 5, 1, 50)}</td><td>${num(`epochs.${i}.clarity`, e.clarity, 0, 1, 0.05, 60)}</td>
          <td><button data-act="del-epoch" data-i="${i}" title="Zeitalter entfernen">✕</button>${i > 0 ? `<button data-act="up-epoch" data-i="${i}" title="nach oben">↑</button>` : ''}</td></tr>`).join('')}
        </table><p><button data-act="add-epoch">+ Zeitalter</button> <span class="muted">Gesamt: <b id="ws-total">${totalYears(c).toLocaleString('de-DE')}</b> Jahre</span></p>`;
    case 'worldEvents':
      return `<table class="ws"><tr><th>an</th><th>Weltereignis</th><th>Gewicht</th><th>Dauer</th><th>Wirkung</th></tr>
        ${WORLD_EVENTS.map((d) => {
          const e = c.worldEvents.defs[d.id] ?? { on: true, weight: 1 };
          const mods = Object.entries(d.mods ?? {}).map(([k, v]) => `${MOD_LABELS[k as ModKey]} ×${v}`).join(', ');
          const dur = d.duration[1] ? `${d.duration[0]}–${d.duration[1]} J.` : 'Augenblick';
          return `<tr><td>${bool(`worldEvents.defs.${d.id}.on`, e.on)}</td><td><b>${esc(d.label)}</b><div class="muted">${esc(d.summary)}</div></td>
            <td>${d.fixedAgo ? '<span class="muted">fest</span>' : num(`worldEvents.defs.${d.id}.weight`, e.weight, 0, 10, 0.1, 60)}</td><td>${dur}</td><td class="muted">${mods}${d.darkAge ? `${mods ? ', ' : ''}Wissen geht verloren` : ''}</td></tr>`;
        }).join('')}</table>`;
    case 'systems':
      return `<table class="ws"><tr><th>an</th><th>System</th><th>Stärke</th></tr>
        ${SYSTEMS.map((s) => {
          const v = c.systems[s.id] ?? { on: true, rate: 1 };
          return `<tr><td>${bool(`systems.${s.id}.on`, v.on)}</td><td><b>${esc(s.label)}</b><div class="muted">${esc(s.summary)}</div></td><td>${num(`systems.${s.id}.rate`, v.rate, 0, 5, 0.1, 60)}</td></tr>`;
        }).join('')}</table>`;
    case 'races':
      return `<p>${(Object.keys(c.civs.races) as Race[]).map((r) => `<label>${bool(`civs.races.${r}`, c.civs.races[r])} ${RACE_NAMES[r].many}</label>`).join(' ')}</p>`;
    case 'tiers':
      return `<table class="ws"><tr><th>Stufe</th><th>Name</th><th>ab Einwohnern</th></tr>
        ${c.towns.tiers.map((t, i) => `<tr><td>${i}</td><td>${text(`towns.tiers.${i}.label`, t.label)}</td><td>${num(`towns.tiers.${i}.minPop`, t.minPop, 0, 1e6, 50, 90)}</td></tr>`).join('')}</table>`;
    case 'memory':
      return `<p>Gedächtnis je Volk: ${(Object.keys(c.knowledge.memory) as Race[]).map((r) => `<label>${RACE_NAMES[r].many} ${num(`knowledge.memory.${r}`, c.knowledge.memory[r], -1, 1, 0.05, 60)}</label>`).join(' ')}</p>`;
  }
  return '';
}

/** Kurzfassung der Abweichungen vom Standard. */
function summary(c: HistoryConfig): string {
  const d = encodeConfig(c);
  return d ? `${(d.length / 1024).toFixed(1)} KB Abweichungen vom Standard` : 'Standard-Einstellungen';
}

export function workshopView(main: HTMLElement, current: HistoryConfig, seed: string, h: History): void {
  let c = structuredClone(current);
  const url = (cfg: HistoryConfig, game = false) => {
    const hc = encodeConfig(cfg);
    return game ? `?seed=${encodeURIComponent(seed)}&vorgeschichte=1${hc ? `&hc=${hc}` : ''}&gm=1` : `?legends=1&seed=${encodeURIComponent(seed)}${hc ? `&hc=${hc}` : ''}`;
  };
  const render = () => {
    main.innerHTML = `
      <h2>Werkstatt</h2>
      <div class="sub">Einstellungen der Vorgeschichte für die Welt „${esc(seed)}“. Erzeugt wird erst mit „Erzeugen“ – die aktuelle Geschichte
        (${h.years.toLocaleString('de-DE')} Jahre, ${Math.round(h.ms)} ms) bleibt bis dahin sichtbar. Geänderte Felder sind markiert.</div>
      <div class="ws-bar">
        <label>Voreinstellung <select id="ws-preset"><option value="">–</option>${PRESETS.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}</select></label>
        <button id="ws-go" class="main">Erzeugen</button>
        <button id="ws-reset">Zurücksetzen</button>
        <button id="ws-copy">Link kopieren</button>
        <a id="ws-play" class="l" href="${url(c, true)}" target="_blank">Im Spiel öffnen ↗</a>
        <span class="muted" id="ws-sum">${summary(c)}</span>
      </div>
      ${SECTIONS.map((s) => `<section class="ws-sec"><h3>${esc(s.title)}</h3><p class="muted">${esc(s.help)}</p>
        ${s.fields.length ? `<div class="ws-fields">${s.fields.map((f) => field(c, f)).join('')}</div>` : ''}${s.table ? table(c, s.table) : ''}</section>`).join('')}
      <section class="ws-sec"><h3>Als JSON</h3><p class="muted">Alle Einstellungen zum direkten Bearbeiten (auch Felder ohne Formular). „Übernehmen“ prüft und begrenzt die Werte.</p>
        <textarea id="ws-json" rows="14" spellcheck="false">${esc(JSON.stringify(c, null, 2))}</textarea>
        <p><button id="ws-json-apply">Übernehmen</button> <span id="ws-json-err" class="muted"></span></p></section>`;
    const changed = () => {
      (document.getElementById('ws-sum') as HTMLElement).textContent = summary(c);
      (document.getElementById('ws-play') as HTMLAnchorElement).href = url(c, true);
      const total = document.getElementById('ws-total');
      if (total) total.textContent = totalYears(c).toLocaleString('de-DE');
      (document.getElementById('ws-json') as HTMLTextAreaElement).value = JSON.stringify(c, null, 2);
    };
    for (const el of Array.from(main.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-p]'))) {
      el.onchange = () => {
        const p = el.dataset.p!;
        const v = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el instanceof HTMLInputElement && el.type !== 'number' ? el.value : Number(el.value);
        setPath(c, p, v);
        el.closest('label')?.classList.add('chg');
        changed();
      };
    }
    for (const b of Array.from(main.querySelectorAll<HTMLButtonElement>('[data-act]'))) {
      b.onclick = () => {
        const i = Number(b.dataset.i);
        if (b.dataset.act === 'add-epoch') c.epochs.push({ id: `e${c.epochs.length}`, label: 'Neues Zeitalter', years: 500, step: 5, detail: 2, minImportance: 1, clarity: 0.6 });
        if (b.dataset.act === 'del-epoch' && c.epochs.length > 1) c.epochs.splice(i, 1);
        if (b.dataset.act === 'up-epoch') [c.epochs[i - 1], c.epochs[i]] = [c.epochs[i], c.epochs[i - 1]];
        render();
      };
    }
    (document.getElementById('ws-preset') as HTMLSelectElement).onchange = (ev) => {
      const p = PRESETS.find((x) => x.id === (ev.target as HTMLSelectElement).value);
      if (!p) return;
      c = resolveConfig(p.config);
      render();
    };
    document.getElementById('ws-reset')!.onclick = () => {
      c = resolveConfig({});
      render();
    };
    document.getElementById('ws-go')!.onclick = () => {
      c = resolveConfig(c);
      location.href = `${url(c)}#overview`;
    };
    document.getElementById('ws-copy')!.onclick = async () => {
      const link = new URL(url(resolveConfig(c)), location.href).href;
      try {
        await navigator.clipboard.writeText(link);
        (document.getElementById('ws-sum') as HTMLElement).textContent = 'Link kopiert.';
      } catch {
        prompt('Link zur Welt mit diesen Einstellungen:', link);
      }
    };
    document.getElementById('ws-json-apply')!.onclick = () => {
      const err = document.getElementById('ws-json-err')!;
      try {
        c = resolveConfig(JSON.parse((document.getElementById('ws-json') as HTMLTextAreaElement).value));
        render();
      } catch (e) {
        err.textContent = `Fehler: ${(e as Error).message}`;
      }
    };
  };
  render();
}
