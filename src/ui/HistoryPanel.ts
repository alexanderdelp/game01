/**
 * Spielleiter-Modus mit Vorgeschichte (Prototyp): Tafel mit der Geschichte eines Ortes und Link in den
 * Legenden-Modus. Als HTML über dem Spiel, weil längere Texte so besser lesbar sind.
 */
import { SITE_KIND, siteStory } from '../history/narrate';
import type { History, Site } from '../history/types';
import { DEFAULT_YEARS } from '../history/simulate';
import { debugState } from '../debug';

let panel: HTMLDivElement | null = null;

export function closeHistoryPanel(): void {
  panel?.remove();
  panel = null;
}

export function showHistoryPanel(h: History, s: Site, seed: string): void {
  closeHistoryPanel();
  panel = document.createElement('div');
  panel.id = 'history-panel';
  panel.style.cssText = 'position:fixed;left:12px;bottom:12px;max-width:min(460px,calc(100vw - 24px));max-height:45vh;overflow:auto;'
    + 'background:#12111aee;color:#e6e1d4;border:1px solid #e0b030;border-radius:6px;padding:10px 14px;font:14px/1.5 Georgia,serif;z-index:20';
  const years = h.years !== DEFAULT_YEARS ? `&jahre=${h.years}` : '';
  const state = s.destroyed !== undefined ? 'Ruine' : SITE_KIND[s.kind];
  const title = document.createElement('div');
  title.style.cssText = 'color:#e0b030;font-size:17px;margin-bottom:4px;display:flex;justify-content:space-between;gap:12px';
  title.textContent = `${s.name} · ${state}`;
  const close = document.createElement('button');
  close.textContent = '×';
  close.style.cssText = 'background:none;border:none;color:#e6e1d4;font-size:18px;cursor:pointer';
  close.onclick = closeHistoryPanel;
  title.append(close);
  const text = document.createElement('div');
  text.textContent = siteStory(h, s);
  const link = document.createElement('a');
  link.href = `?legends=1&seed=${encodeURIComponent(seed)}${years}#site/${s.id}`;
  link.target = '_blank';
  link.textContent = 'In den Legenden lesen ↗';
  link.style.cssText = 'display:inline-block;margin-top:6px;color:#2fe0d8';
  panel.append(title, text, link);
  document.body.append(panel);
  debugState.historyPanel = s.name;
}
