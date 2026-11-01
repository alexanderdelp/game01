/**
 * Legenden-Modus (`?legends=1&seed=…&jahre=…`): die erzeugte Vorgeschichte zum Durchstöbern. Eigene HTML-Seite
 * ohne Phaser (Lesbarkeit). Listen, Detailseiten, Zeitleiste und Karte mit Reichsgrenzen im Zeitverlauf.
 */
import './legends.css';
import { BIOMES } from '../world/biomes';
import { FACTIONS } from '../world/meta';
import { DEFAULT_YEARS, INHABITED, RACE_NAMES, type Artifact, type Civ, type EventKind, type Figure, type HEvent, type History, type Site } from '../history';
import { ARTIFACT_KINDS } from '../history/names';
import { ROLE, SITE_KIND, artifactText, civText, eventText, figureText, raceName, roleName, siteText, yearText, type Linker } from '../history/narrate';
import { civsAt, existsAt, ownerAt, territory } from '../history/query';
import { HISTORY_GRID } from '../history/types';
import type { LegendsRequest } from './legendsWorker';

let h: History;
let seed = '';
let mapSize = 512;
let base: HTMLCanvasElement;
const WORLD = 8192;
const main = document.createElement('main');
const tip = document.createElement('div');

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Wichtige Ereignisse (fett in Listen, Zeitleiste „nur wichtige“). */
const MAJOR = new Set<EventKind>(['prehistory', 'civ_found', 'awaken', 'war', 'battle', 'conquest', 'raze', 'split', 'civ_fall', 'plague', 'famine', 'shattering', 'beast_arrive', 'beast_slain', 'hero_falls', 'artifact_made', 'betrayal', 'alliance', 'artifact_lost']);
const KIND_LABEL: Record<EventKind, string> = {
  prehistory: 'Vorzeit', awaken: 'Erwachen', civ_found: 'Reichsgründung', site_found: 'Gründung', ruler: 'Herrscherwechsel', death: 'Tod', birth: 'Geburt',
  war: 'Krieg', peace: 'Frieden', alliance: 'Bündnis', battle: 'Schlacht', conquest: 'Eroberung', raze: 'Zerstörung', betrayal: 'Verrat', split: 'Spaltung',
  civ_fall: 'Untergang', plague: 'Seuche', famine: 'Hungersnot', abandon: 'Aufgabe', beast_arrive: 'Bestie', beast_raid: 'Überfall', beast_slain: 'Bestie erschlagen',
  hero_falls: 'Held gefallen', artifact_made: 'Artefakt', artifact_lost: 'Artefakt verloren', artifact_loot: 'Beute', burial: 'Bestattung', trade: 'Handel',
  shattering: 'Zersplitterung', hero_rise: 'Held',
};

const L: Linker = {
  civ: (id) => {
    const c = h.civs[id];
    return c ? `<a class="l civ" href="#civ/${id}" style="color:${hex(c.color)}">${esc(c.name)}</a>` : 'niemand';
  },
  fig: (id) => {
    const f = h.figures[id];
    return f ? `<a class="l fig" href="#fig/${id}">${esc(f.name)}</a>` : 'jemand';
  },
  site: (id) => {
    const s = h.sites[id];
    return s ? `<a class="l site${s.destroyed !== undefined ? ' dead' : ''}" href="#site/${id}">${esc(s.name)}</a>` : 'irgendwo';
  },
  art: (id) => {
    const a = h.artifacts[id];
    return a ? `<a class="l art" href="#art/${id}">»${esc(a.name)}«</a>` : 'ein Artefakt';
  },
};

const evRow = (e: HEvent) => `<div class="ev${MAJOR.has(e.k) ? ' major' : ''}"><div class="y">${yearText(e.y)}</div><div class="t">${eventText(h, e, L)}</div></div>`;
const evList = (ids: number[]) => ids.map((i) => evRow(h.events[i])).join('') || '<p class="muted">Keine Ereignisse.</p>';

// ------------------------------------------------------------ Start

export function startLegends(seedName: string, years: number): void {
  seed = seedName;
  document.title = 'Legenden – Splitterwelten';
  document.body.classList.add('legends');
  const head = document.createElement('header');
  head.className = 'lg-head';
  head.innerHTML = `
    <h1 id="lg-title">Legenden <small>Welt „${esc(seed)}“</small></h1>
    <nav class="lg-nav">${[['overview', 'Übersicht'], ['map', 'Karte'], ['timeline', 'Zeitleiste'], ['civs', 'Reiche'], ['figs', 'Figuren'], ['sites', 'Orte'], ['arts', 'Artefakte'], ['events', 'Ereignisse']]
      .map(([k, t]) => `<a href="#${k}" data-v="${k}">${t}</a>`).join('')}</nav>
    <div class="lg-tools">
      <input id="lg-q" type="search" placeholder="Suche: Name …" size="16">
      <label>Seed <input id="lg-seed" value="${esc(seed)}" size="16"></label>
      <label>Jahre <input id="lg-years" type="number" min="300" max="1000" step="50" value="${years}" style="width:64px"></label>
      <button id="lg-go">Neu erzeugen</button>
      <a id="lg-play" class="l" href="#">Spielen</a>
    </div>`;
  document.body.prepend(head);
  main.className = 'lg';
  head.after(main);
  tip.className = 'lg-tip';
  document.body.append(tip);
  const go = () => {
    const s = (document.getElementById('lg-seed') as HTMLInputElement).value.trim() || seed;
    const y = Number((document.getElementById('lg-years') as HTMLInputElement).value) || DEFAULT_YEARS;
    location.href = `?legends=1&seed=${encodeURIComponent(s)}&jahre=${y}`;
  };
  document.getElementById('lg-go')!.onclick = go;
  (document.getElementById('lg-play') as HTMLAnchorElement).href = `?seed=${encodeURIComponent(seed)}&vorgeschichte=1${years !== DEFAULT_YEARS ? `&jahre=${years}` : ''}&gm=1`;
  const q = document.getElementById('lg-q') as HTMLInputElement;
  q.onkeydown = (e) => {
    if (e.key === 'Enter') location.hash = `#search?q=${encodeURIComponent(q.value)}`;
  };
  main.innerHTML = `<div class="busy">Die Geschichte von ${years} Jahren wird geschrieben …</div>`;
  const w = new Worker(new URL('./legendsWorker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (ev: MessageEvent<{ history: History; size: number; biomes: ArrayBuffer }>) => {
    h = ev.data.history;
    mapSize = ev.data.size;
    base = baseMap(new Uint8Array(ev.data.biomes));
    document.getElementById('lg-title')!.innerHTML = `Legenden von ${esc(h.worldName)} <small>Welt „${esc(seed)}“ · ${h.years} Jahre · erzeugt in ${Math.round(h.ms)} ms</small>`;
    (window as unknown as { __legends: unknown }).__legends = { ready: true, history: h };
    w.terminate();
    route();
  };
  w.postMessage({ seed, years } satisfies LegendsRequest);
  window.addEventListener('hashchange', route);
}

function route(): void {
  if (!h) return;
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const [view, id] = path.split('/');
  const params = new URLSearchParams(query ?? '');
  for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('.lg-nav a'))) a.classList.toggle('on', a.dataset.v === (view || 'overview'));
  tip.style.display = 'none';
  const n = Number(id);
  switch (view) {
    case 'map': return mapView(Number(params.get('y') ?? h.years), params.has('s') ? Number(params.get('s')) : undefined);
    case 'timeline': return timelineView();
    case 'civs': return civsView();
    case 'figs': return figsView();
    case 'sites': return sitesView();
    case 'arts': return artsView();
    case 'events': return eventsView();
    case 'search': return searchView(params.get('q') ?? '');
    case 'civ': return h.civs[n] ? civView(h.civs[n]) : overview();
    case 'fig': return h.figures[n] ? figView(h.figures[n]) : overview();
    case 'site': return h.sites[n] ? siteView(h.sites[n]) : overview();
    case 'art': return h.artifacts[n] ? artView(h.artifacts[n]) : overview();
    default: return overview();
  }
}

function page(html: string): void {
  main.innerHTML = html;
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------ Übersicht

function overview(): void {
  const alive = h.civs.filter((c) => c.fell === undefined);
  const living = h.sites.filter((s) => INHABITED.has(s.kind) && s.destroyed === undefined);
  const ruins = h.sites.filter((s) => s.destroyed !== undefined);
  const lost = h.artifacts.filter((a) => a.site !== undefined);
  const shatter = h.events.find((e) => e.k === 'shattering');
  const famous = [...h.figures].filter((f) => f.race !== 'beast').sort((a, b) => b.events.length - a.events.length).slice(0, 8);
  const beasts = h.figures.filter((f) => f.race === 'beast').sort((a, b) => b.kills - a.kills).slice(0, 6);
  const sizeOf = (c: Civ) => living.filter((s) => s.owners[s.owners.length - 1].civ === c.id).length;
  page(`
    <h2>${esc(h.worldName)}</h2>
    <div class="sub">${h.years} Jahre Geschichte seit dem Erwachen der Völker</div>
    <div class="cards">
      <div class="card"><div class="n">${h.civs.length}</div>Reiche, davon ${alive.length} bis heute</div>
      <div class="card"><div class="n">${living.length}</div>bewohnte Orte · ${ruins.length} Ruinen</div>
      <div class="card"><div class="n">${h.figures.length}</div>historische Figuren</div>
      <div class="card"><div class="n">${h.artifacts.length}</div>Artefakte, ${lost.length} verschollen</div>
      <div class="card"><div class="n">${h.events.length}</div>Ereignisse</div>
    </div>
    ${shatter ? `<h3>Die Zersplitterung (Jahr ${shatter.y})</h3><p class="story">${eventText(h, shatter, L)}</p>` : ''}
    <h3>Die Reiche von heute</h3>
    <table><tr><th>Reich</th><th>Volk</th><th>Fraktion</th><th>Orte</th><th>Gegründet</th></tr>
    ${alive.sort((a, b) => sizeOf(b) - sizeOf(a)).map((c) => `<tr><td><span class="swatch" style="background:${hex(c.color)}"></span>${L.civ(c.id)}</td><td>${RACE_NAMES[c.race].many}</td><td>${FACTIONS[c.faction].name}</td><td>${sizeOf(c)}</td><td>${c.founded}</td></tr>`).join('')}
    </table>
    <h3>Berühmte Figuren</h3>
    <p>${famous.map((f) => `${L.fig(f.id)} <span class="muted">(${roleName(f)})</span>`).join(' · ')}</p>
    <h3>Großbestien</h3>
    <p>${beasts.map((f) => `${L.fig(f.id)} <span class="muted">(${roleName(f)}, ${f.died === undefined ? 'lebt' : `† ${f.died}`})</span>`).join(' · ') || '<span class="muted">keine</span>'}</p>
    <h3>Verschollene Artefakte</h3>
    <p>${lost.map((a) => `${L.art(a.id)} <span class="muted">in</span> ${L.site(a.site!)}`).join(' · ')}</p>
    <h3>Die ersten Jahre</h3>
    ${h.events.filter((e) => MAJOR.has(e.k)).slice(0, 14).map(evRow).join('')}
    <p><a class="l" href="#timeline">Zur Zeitleiste →</a></p>`);
}

// ------------------------------------------------------------ Karte

function baseMap(biomes: Uint8Array): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = mapSize;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(mapSize, mapSize);
  for (let i = 0; i < biomes.length; i++) {
    const col = BIOMES[biomes[i]].mapColor;
    img.data[i * 4] = col >> 16;
    img.data[i * 4 + 1] = (col >> 8) & 255;
    img.data[i * 4 + 2] = col & 255;
    img.data[i * 4 + 3] = 255;
  }
  const k = mapSize / WORLD;
  for (const key of h.rivers) {
    const x = Math.floor(Math.floor(key / 65536) * k);
    const y = Math.floor((key % 65536) * k);
    const i = (y * mapSize + x) * 4;
    img.data[i] = 0x3a;
    img.data[i + 1] = 0x78;
    img.data[i + 2] = 0xc0;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const SYMBOL: Record<Site['kind'], { color: string; shape: 'sq' | 'dot' | 'tri' | 'dia' | 'x' | 'cross' | 'ring' }> = {
  city: { color: '#ffffff', shape: 'sq' }, village: { color: '#f4ecd8', shape: 'dot' }, fortress: { color: '#e0b030', shape: 'tri' },
  tower: { color: '#c47aff', shape: 'tri' }, lab: { color: '#2fe0d8', shape: 'dia' }, temple: { color: '#fff0a0', shape: 'cross' },
  mine: { color: '#c08040', shape: 'dot' }, tomb: { color: '#b0b0c0', shape: 'cross' }, battlefield: { color: '#ff5050', shape: 'x' },
  lair: { color: '#ff9030', shape: 'ring' }, crater: { color: '#c47aff', shape: 'ring' }, relic: { color: '#2fe0d8', shape: 'dia' },
};

function symbol(ctx: CanvasRenderingContext2D, x: number, y: number, s: Site, ruin: boolean, r: number): void {
  const sym = SYMBOL[s.kind];
  ctx.fillStyle = ruin ? '#77737f' : sym.color;
  ctx.strokeStyle = ruin ? '#77737f' : sym.color;
  ctx.lineWidth = Math.max(1.5, r / 2.5);
  ctx.beginPath();
  switch (ruin ? 'x' : sym.shape) {
    case 'sq': ctx.rect(x - r, y - r, r * 2, r * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); return;
    case 'dot': ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); return;
    case 'tri': ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); return;
    case 'dia': ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); return;
    case 'x': ctx.moveTo(x - r * 0.8, y - r * 0.8); ctx.lineTo(x + r * 0.8, y + r * 0.8); ctx.moveTo(x + r * 0.8, y - r * 0.8); ctx.lineTo(x - r * 0.8, y + r * 0.8); ctx.stroke(); return;
    case 'cross': ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.moveTo(x - r * 0.7, y - r * 0.3); ctx.lineTo(x + r * 0.7, y - r * 0.3); ctx.stroke(); return;
    case 'ring': ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); return;
  }
}

/** Sichtbare Orte in einem Jahr (Ruinen bleiben als Ruinen stehen). */
function sitesAt(year: number): { s: Site; ruin: boolean }[] {
  return h.sites.filter((s) => s.founded <= year || s.kind === 'relic').map((s) => ({ s, ruin: s.destroyed !== undefined && s.destroyed <= year }));
}

/** Zeichnet die Karte in einem Jahr. `px` = Breite in Pixeln. */
function drawMap(canvas: HTMLCanvasElement, year: number, highlight?: number, px = 1024): void {
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 0, 0, px, px);
  const own = territory(h, year);
  const N = HISTORY_GRID;
  const cpx = px / N;
  for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
    const o = own[cy * N + cx];
    if (o < 0) continue;
    ctx.fillStyle = hex(h.civs[o].color) + '55';
    ctx.fillRect(cx * cpx, cy * cpx, cpx + 0.5, cpx + 0.5);
  }
  ctx.lineWidth = Math.max(1, cpx / 4);
  for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
    const o = own[cy * N + cx];
    if (o < 0) continue;
    ctx.strokeStyle = hex(h.civs[o].color);
    ctx.beginPath();
    if (cx + 1 < N && own[cy * N + cx + 1] !== o) { ctx.moveTo((cx + 1) * cpx, cy * cpx); ctx.lineTo((cx + 1) * cpx, (cy + 1) * cpx); }
    if (cx > 0 && own[cy * N + cx - 1] !== o) { ctx.moveTo(cx * cpx, cy * cpx); ctx.lineTo(cx * cpx, (cy + 1) * cpx); }
    if (cy + 1 < N && own[(cy + 1) * N + cx] !== o) { ctx.moveTo(cx * cpx, (cy + 1) * cpx); ctx.lineTo((cx + 1) * cpx, (cy + 1) * cpx); }
    if (cy > 0 && own[(cy - 1) * N + cx] !== o) { ctx.moveTo(cx * cpx, cy * cpx); ctx.lineTo((cx + 1) * cpx, cy * cpx); }
    ctx.stroke();
  }
  const k = px / WORLD;
  const r = Math.max(2.5, px / 300);
  // Handelswege bis zu diesem Jahr
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = '#f0d89088';
  ctx.lineWidth = 1;
  for (const e of h.events) {
    if (e.y > year) break;
    if (e.k !== 'trade') continue;
    const [a, b] = e.sites.map((i) => h.sites[i]);
    if (!existsAt(a, year) || !existsAt(b, year)) continue;
    ctx.beginPath();
    ctx.moveTo(a.tx * k, a.ty * k);
    ctx.lineTo(b.tx * k, b.ty * k);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const { s, ruin } of sitesAt(year)) symbol(ctx, s.tx * k, s.ty * k, s, ruin, s.kind === 'city' ? r * 1.2 : r);
  // Reichsnamen in der Mitte ihres Gebiets
  ctx.font = `bold ${Math.round(px / 70)}px Georgia, serif`;
  ctx.textAlign = 'center';
  for (const id of civsAt(h, year)) {
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < own.length; i++) if (own[i] === id) { sx += i % N; sy += Math.floor(i / N); n++; }
    if (n < 12) continue;
    const x = (sx / n + 0.5) * cpx;
    const y = (sy / n + 0.5) * cpx;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000a';
    ctx.strokeText(h.civs[id].name, x, y);
    ctx.fillStyle = hex(h.civs[id].color);
    ctx.fillText(h.civs[id].name, x, y);
  }
  if (highlight !== undefined) {
    const s = h.sites[highlight];
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.tx * k, s.ty * k, r * 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Nächster Ort zu einer Mausposition (in Kartenpixeln), sichtbar im Jahr. */
function siteAtMouse(canvas: HTMLCanvasElement, ev: MouseEvent, year: number): Site | null {
  const rect = canvas.getBoundingClientRect();
  const tx = ((ev.clientX - rect.left) / rect.width) * WORLD;
  const ty = ((ev.clientY - rect.top) / rect.height) * WORLD;
  let best: Site | null = null;
  let bd = (14 / rect.width) * WORLD;
  for (const { s } of sitesAt(year)) {
    const d = Math.hypot(s.tx - tx, s.ty - ty);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

function hookMap(canvas: HTMLCanvasElement, year: () => number): void {
  canvas.onmousemove = (ev) => {
    const s = siteAtMouse(canvas, ev, year());
    if (!s) {
      tip.style.display = 'none';
      return;
    }
    const y = year();
    const civ = ownerAt(s, y);
    const ruin = s.destroyed !== undefined && s.destroyed <= y;
    tip.innerHTML = `<b>${esc(s.name)}</b> · ${ruin ? 'Ruine' : SITE_KIND[s.kind]}${civ >= 0 && !ruin ? ` · ${esc(h.civs[civ].name)}` : ''}`;
    tip.style.display = 'block';
    tip.style.left = `${ev.clientX + 14}px`;
    tip.style.top = `${ev.clientY + 10}px`;
  };
  canvas.onmouseleave = () => (tip.style.display = 'none');
  canvas.onclick = (ev) => {
    const s = siteAtMouse(canvas, ev, year());
    if (s) location.hash = `#site/${s.id}`;
  };
}

function mapView(year0: number, highlight?: number): void {
  let year = Math.max(0, Math.min(h.years, year0));
  page(`
    <h2>Karte von ${esc(h.worldName)}</h2>
    <div class="lg-year"><button class="play" id="lg-anim">▶ Abspielen</button><span class="yv" id="lg-yv"></span><input type="range" id="lg-y" min="0" max="${h.years}" value="${year}"></div>
    <div class="lg-map"><canvas id="lg-map"></canvas><div class="side" id="lg-side"></div></div>
    <p class="muted">■ Stadt ● Dorf ▲ Festung/Turm ◆ Labor/Relikt ✚ Tempel/Grabmal ✕ Schlachtfeld (grau: Ruine) ○ Hort/Krater · gestrichelt: Handelswege. Klick auf einen Ort öffnet seine Geschichte.</p>`);
  const canvas = document.getElementById('lg-map') as HTMLCanvasElement;
  const slider = document.getElementById('lg-y') as HTMLInputElement;
  const side = document.getElementById('lg-side')!;
  const draw = () => {
    drawMap(canvas, year, highlight);
    document.getElementById('lg-yv')!.textContent = `Jahr ${year}`;
    const own = territory(h, year);
    const count = new Map<number, number>();
    for (const o of own) if (o >= 0) count.set(o, (count.get(o) ?? 0) + 1);
    const civs = civsAt(h, year).sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0));
    const recent = h.events.filter((e) => e.y <= year && e.y > year - 25 && MAJOR.has(e.k)).slice(-8).reverse();
    side.innerHTML = `<b>Reiche im Jahr ${year}</b>${civs.map((c) => `<div class="row"><span class="swatch" style="background:${hex(h.civs[c].color)}"></span>${L.civ(c)} <span class="muted">${count.get(c) ?? 0} Felder</span></div>`).join('')}
      <br><b>Zuletzt geschehen</b>${recent.map(evRow).join('') || '<div class="muted">nichts Großes</div>'}`;
  };
  hookMap(canvas, () => year);
  slider.oninput = () => {
    year = Number(slider.value);
    draw();
    history.replaceState(null, '', `#map?y=${year}${highlight !== undefined ? `&s=${highlight}` : ''}`);
  };
  let timer = 0;
  const anim = document.getElementById('lg-anim') as HTMLButtonElement;
  anim.onclick = () => {
    if (timer) {
      clearInterval(timer);
      timer = 0;
      anim.textContent = '▶ Abspielen';
      return;
    }
    if (year >= h.years) year = 0;
    anim.textContent = '❚❚ Anhalten';
    timer = window.setInterval(() => {
      if (!document.body.contains(canvas)) return clearInterval(timer);
      year = Math.min(h.years, year + 5);
      slider.value = String(year);
      draw();
      if (year >= h.years) anim.click();
    }, 80);
  };
  draw();
}

// ------------------------------------------------------------ Zeitleiste

function timelineView(): void {
  const civs = [...h.civs].sort((a, b) => a.founded - b.founded || a.id - b.id);
  const W = 100 / h.years;
  const rows = civs.map((c, i) => {
    const end = c.fell ?? h.years;
    return `<a class="bar" href="#civ/${c.id}" title="${esc(c.name)} ${c.founded}–${c.fell ?? 'heute'}" style="top:${i * 19 + 18}px;left:${c.founded * W}%;width:${Math.max(0.6, (end - c.founded) * W)}%;background:${hex(c.color)}">${esc(c.name)}</a>`;
  }).join('');
  const axis = Array.from({ length: Math.floor(h.years / 100) + 1 }, (_, i) => `<div class="axis" style="left:${i * 100 * W}%">${i * 100}</div>`).join('');
  const shatter = h.shattering;
  const centuries = Array.from({ length: Math.floor(h.years / 100) + 1 }, (_, i) => i);
  page(`
    <h2>Zeitleiste</h2>
    <div class="sub">Lebensdauer der Reiche (Klick öffnet das Reich) · violette Linie: Zersplitterung im Jahr ${shatter}</div>
    <div class="gantt" style="height:${civs.length * 19 + 24}px">${axis}<div class="axis" style="left:${shatter * W}%;border-left:2px solid #c47aff"></div>${rows}</div>
    <div class="lg-filter"><label><input type="checkbox" id="lg-major" checked> nur wichtige Ereignisse</label></div>
    <div id="lg-tl"></div>`);
  const box = document.getElementById('lg-tl')!;
  const cb = document.getElementById('lg-major') as HTMLInputElement;
  const draw = () => {
    box.innerHTML = centuries.map((c) => {
      const evs = h.events.filter((e) => Math.max(0, e.y) >= c * 100 && Math.max(0, e.y) < (c + 1) * 100 && (!cb.checked || MAJOR.has(e.k)));
      return evs.length ? `<h3>${c * 100}–${c * 100 + 99}</h3>${evs.map(evRow).join('')}` : '';
    }).join('');
  };
  cb.onchange = draw;
  draw();
}

// ------------------------------------------------------------ Listen

interface Col<T> { title: string; cell: (x: T) => string; sort?: (x: T) => number | string }

/** Tabelle mit Textfilter, Auswahlfilter und Sortierung per Klick auf den Spaltenkopf. */
function listView<T>(title: string, items: T[], cols: Col<T>[], text: (x: T) => string, kinds?: { label: string; options: [string, string][]; of: (x: T) => string }): void {
  page(`<h2>${title}</h2>
    <div class="lg-filter"><input id="lg-f" placeholder="Filtern …" size="24">${kinds ? `<label>${kinds.label} <select id="lg-k"><option value="">alle</option>${kinds.options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>` : ''}<span id="lg-n"></span></div>
    <div id="lg-tab"></div>`);
  const f = document.getElementById('lg-f') as HTMLInputElement;
  const k = document.getElementById('lg-k') as HTMLSelectElement | null;
  let sortCol = -1;
  let dir = 1;
  const draw = () => {
    const q = f.value.toLowerCase();
    let rows = items.filter((x) => (!q || text(x).toLowerCase().includes(q)) && (!k || !k.value || kinds!.of(x) === k.value));
    if (sortCol >= 0) {
      const s = cols[sortCol].sort!;
      rows = [...rows].sort((a, b) => (s(a) < s(b) ? -dir : s(a) > s(b) ? dir : 0));
    }
    document.getElementById('lg-n')!.textContent = `${rows.length} Einträge`;
    document.getElementById('lg-tab')!.innerHTML = `<table><tr>${cols.map((c, i) => `<th data-i="${i}">${c.title}${i === sortCol ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr>${rows.slice(0, 600).map((x) => `<tr>${cols.map((c) => `<td>${c.cell(x)}</td>`).join('')}</tr>`).join('')}</table>${rows.length > 600 ? '<p class="muted">… weitere per Filter eingrenzen</p>' : ''}`;
    for (const th of Array.from(document.querySelectorAll<HTMLElement>('#lg-tab th'))) {
      th.onclick = () => {
        const i = Number(th.dataset.i);
        if (!cols[i].sort) return;
        dir = sortCol === i ? -dir : 1;
        sortCol = i;
        draw();
      };
    }
  };
  f.oninput = draw;
  if (k) k.onchange = draw;
  draw();
}

const life = (f: Figure) => `${f.born}–${f.died ?? ''}`;

function civsView(): void {
  const living = (c: Civ) => h.sites.filter((s) => INHABITED.has(s.kind) && s.destroyed === undefined && s.owners[s.owners.length - 1].civ === c.id).length;
  listView('Reiche', h.civs, [
    { title: 'Reich', cell: (c) => `<span class="swatch" style="background:${hex(c.color)}"></span>${L.civ(c.id)}`, sort: (c) => c.name },
    { title: 'Volk', cell: (c) => RACE_NAMES[c.race].many, sort: (c) => c.race },
    { title: 'Fraktion', cell: (c) => FACTIONS[c.faction].name, sort: (c) => c.faction },
    { title: 'Gegründet', cell: (c) => String(c.founded), sort: (c) => c.founded },
    { title: 'Untergang', cell: (c) => (c.fell === undefined ? '<span class="muted">besteht</span>' : String(c.fell)), sort: (c) => c.fell ?? 99999 },
    { title: 'Orte heute', cell: (c) => String(living(c)), sort: (c) => -living(c) },
    { title: 'Herrscher', cell: (c) => String(c.rulers.length), sort: (c) => -c.rulers.length },
  ], (c) => c.name, { label: 'Fraktion', options: Object.entries(FACTIONS).map(([k, v]) => [k, v.name]), of: (c) => c.faction });
}

function figsView(): void {
  listView('Figuren', h.figures, [
    { title: 'Name', cell: (f) => L.fig(f.id), sort: (f) => f.name },
    { title: 'Rolle', cell: (f) => roleName(f), sort: (f) => roleName(f) },
    { title: 'Volk', cell: (f) => raceName(f), sort: (f) => f.race },
    { title: 'Reich', cell: (f) => (f.civ >= 0 ? L.civ(f.civ) : '–'), sort: (f) => f.civ },
    { title: 'Lebenszeit', cell: life, sort: (f) => f.born },
    { title: 'Ereignisse', cell: (f) => String(f.events.length), sort: (f) => -f.events.length },
  ], (f) => f.name, { label: 'Rolle', options: [...Object.entries(ROLE).map(([k, v]) => [k, v[0]] as [string, string])], of: (f) => (f.offices.length && f.role !== 'hero' ? 'ruler' : f.role) });
}

function sitesView(): void {
  listView('Orte', h.sites, [
    { title: 'Name', cell: (s) => L.site(s.id), sort: (s) => s.name },
    { title: 'Art', cell: (s) => SITE_KIND[s.kind], sort: (s) => s.kind },
    { title: 'Zustand', cell: (s) => (s.destroyed !== undefined ? `Ruine seit ${s.destroyed < 0 ? 'Vorzeit' : s.destroyed}` : INHABITED.has(s.kind) ? 'bewohnt' : '–'), sort: (s) => s.destroyed ?? 99999 },
    { title: 'Besitzer', cell: (s) => (s.owners[s.owners.length - 1].civ >= 0 ? L.civ(s.owners[s.owners.length - 1].civ) : '–'), sort: (s) => s.owners[s.owners.length - 1].civ },
    { title: 'Gegründet', cell: (s) => (s.founded < 0 ? 'Vorzeit' : String(s.founded)), sort: (s) => s.founded },
    { title: 'Artefakte', cell: (s) => (s.arts.length ? s.arts.map(L.art).join(', ') : ''), sort: (s) => -s.arts.length },
  ], (s) => s.name, { label: 'Art', options: Object.entries(SITE_KIND) as [string, string][], of: (s) => s.kind });
}

function artsView(): void {
  listView('Artefakte', h.artifacts, [
    { title: 'Name', cell: (a) => L.art(a.id), sort: (a) => a.name },
    { title: 'Art', cell: (a) => ARTIFACT_KINDS[a.kind], sort: (a) => a.kind },
    { title: 'Schöpfer', cell: (a) => L.fig(a.maker), sort: (a) => h.figures[a.maker].name },
    { title: 'Jahr', cell: (a) => String(a.made), sort: (a) => a.made },
    { title: 'Verbleib', cell: (a) => (a.site !== undefined ? `verschollen in ${L.site(a.site)}` : a.heldBy !== undefined ? `bei ${L.fig(a.heldBy)}` : '–'), sort: (a) => (a.site !== undefined ? 0 : 1) },
  ], (a) => a.name, { label: 'Verbleib', options: [['lost', 'verschollen (zu finden)'], ['held', 'in Besitz']], of: (a) => (a.site !== undefined ? 'lost' : 'held') });
}

function eventsView(): void {
  listView('Ereignisse', h.events, [
    { title: 'Jahr', cell: (e) => yearText(e.y), sort: (e) => e.y },
    { title: 'Art', cell: (e) => KIND_LABEL[e.k], sort: (e) => e.k },
    { title: 'Ereignis', cell: (e) => eventText(h, e, L) },
  ], (e) => eventText(h, e, { civ: (i) => h.civs[i]?.name ?? '', fig: (i) => h.figures[i]?.name ?? '', site: (i) => h.sites[i]?.name ?? '', art: (i) => h.artifacts[i]?.name ?? '' }),
  { label: 'Art', options: Object.entries(KIND_LABEL) as [string, string][], of: (e) => e.k });
}

function searchView(q: string): void {
  const s = q.toLowerCase();
  const m = <T extends { name: string }>(a: T[]) => a.filter((x) => x.name.toLowerCase().includes(s));
  const civs = m(h.civs);
  const figs = m(h.figures);
  const sites = m(h.sites);
  const arts = m(h.artifacts);
  page(`<h2>Suche „${esc(q)}“</h2>
    ${civs.length ? `<h3>Reiche</h3><p>${civs.map((c) => L.civ(c.id)).join(' · ')}</p>` : ''}
    ${figs.length ? `<h3>Figuren</h3><p>${figs.slice(0, 200).map((f) => L.fig(f.id)).join(' · ')}</p>` : ''}
    ${sites.length ? `<h3>Orte</h3><p>${sites.map((x) => L.site(x.id)).join(' · ')}</p>` : ''}
    ${arts.length ? `<h3>Artefakte</h3><p>${arts.map((a) => L.art(a.id)).join(' · ')}</p>` : ''}
    ${civs.length + figs.length + sites.length + arts.length === 0 ? '<p class="muted">Nichts gefunden.</p>' : ''}`);
}

// ------------------------------------------------------------ Detailseiten

function miniMap(year: number, highlight?: number): string {
  return `<canvas class="lg-mini" data-y="${year}" data-s="${highlight ?? ''}" style="width:420px;max-width:100%;border:1px solid #2e2c3e;border-radius:4px;cursor:crosshair"></canvas>`;
}

function hookMini(): void {
  for (const c of Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas.lg-mini'))) {
    const y = Number(c.dataset.y);
    drawMap(c, y, c.dataset.s ? Number(c.dataset.s) : undefined, 840);
    hookMap(c, () => y);
  }
}

function playLink(s: Site): string {
  const years = h.years !== DEFAULT_YEARS ? `&jahre=${h.years}` : '';
  return `?seed=${encodeURIComponent(seed)}&vorgeschichte=1${years}&gm=1&at=${s.tx},${s.ty}`;
}

function civView(c: Civ): void {
  const sites = h.sites.filter((s) => s.owners.some((o) => o.civ === c.id));
  const wars = c.events.map((i) => h.events[i]).filter((e) => e.k === 'war' || e.k === 'peace' || e.k === 'alliance');
  const peakYear = c.fell !== undefined ? Math.max(c.founded, c.fell - 1) : h.years;
  page(`
    <h2><span class="swatch" style="background:${hex(c.color)};width:16px;height:16px"></span>${esc(c.name)}</h2>
    <div class="sub">${FACTIONS[c.faction].name} · ${RACE_NAMES[c.race].many} · ${c.founded}–${c.fell ?? 'heute'} · „${esc(FACTIONS[c.faction].motto)}“</div>
    <p class="story">${civText(h, c, L)}</p>
    ${miniMap(peakYear)}
    <p><a class="l" href="#map?y=${peakYear}">Auf der großen Karte ansehen →</a></p>
    <h3>Herrscher</h3>
    ${c.rulers.map((id) => { const f = h.figures[id]; const o = f.offices.find((x) => x.civ === c.id)!; return `<div class="ev"><div class="y">${o.from}–${o.to ?? ''}</div><div>${L.fig(id)}</div></div>`; }).join('')}
    <h3>Orte (${sites.length})</h3>
    <p>${sites.map((s) => `${L.site(s.id)} <span class="muted">(${s.destroyed !== undefined ? 'Ruine' : SITE_KIND[s.kind]})</span>`).join(' · ')}</p>
    <h3>Kriege und Bündnisse</h3>${wars.map(evRow).join('') || '<p class="muted">Keine.</p>'}
    <h3>Chronik</h3>${evList(c.events)}`);
  hookMini();
}

function figView(f: Figure): void {
  const arts = h.artifacts.filter((a) => a.holders.some((x) => x.fig === f.id));
  page(`
    <h2>${esc(f.name)}</h2>
    <div class="sub">${raceName(f)} · ${roleName(f)} · ${life(f)}</div>
    <p class="story">${figureText(h, f, L)}</p>
    ${f.lair !== undefined ? `<p>Hort: ${L.site(f.lair)}</p>` : ''}
    ${f.children.length ? `<h3>Kinder</h3><p>${f.children.map(L.fig).join(' · ')}</p>` : ''}
    ${arts.length ? `<h3>Artefakte</h3><p>${arts.map((a) => L.art(a.id)).join(' · ')}</p>` : ''}
    <h3>Lebenslauf</h3>${evList(f.events)}`);
}

function siteView(s: Site): void {
  const year = s.destroyed !== undefined ? Math.max(0, s.destroyed - 1) : h.years;
  page(`
    <h2>${esc(s.name)}</h2>
    <div class="sub">${SITE_KIND[s.kind]} · ${s.destroyed !== undefined ? 'Ruine' : INHABITED.has(s.kind) ? 'bewohnt' : 'Stätte'} · Kachel ${s.tx}, ${s.ty}</div>
    <p class="story">${siteText(h, s, L)}</p>
    ${miniMap(year, s.id)}
    <p><a class="l" href="${playLink(s)}" target="_blank">Im Spiel ansehen (Spielleiter-Modus) ↗</a> · <a class="l" href="#map?y=${year}&s=${s.id}">Auf der großen Karte →</a></p>
    <h3>Geschichte des Ortes</h3>${evList(s.events)}`);
  hookMini();
}

function artView(a: Artifact): void {
  const evs = h.events.filter((e) => e.arts.includes(a.id)).map((e) => e.id);
  const how = { made: 'geschaffen', gift: 'geschenkt', inherit: 'geerbt', loot: 'erbeutet', found: 'gefunden' } as const;
  page(`
    <h2>»${esc(a.name)}«</h2>
    <div class="sub">${ARTIFACT_KINDS[a.kind]}${a.great ? ' · das große Artefakt der Zersplitterung' : ''}</div>
    <p class="story">${artifactText(h, a, L)}</p>
    <h3>Besitzerkette</h3>
    ${a.holders.map((x) => `<div class="ev"><div class="y">${x.y}</div><div>${L.fig(x.fig)} – ${how[x.how]}</div></div>`).join('')}
    ${a.site !== undefined ? `<div class="ev"><div class="y">${a.lost?.y ?? ''}</div><div>verloren in ${L.site(a.site)}</div></div>` : ''}
    <h3>Ereignisse</h3>${evList(evs)}`);
}

