import { debugState } from '../../debug';
import { CHAT_MAX, type LiveMsg } from '../../net/live';
import { TILE_PX } from '../../render/chunkPixels';
import type { News } from '../../sim/simulation';
import { decodeShare, shareLink } from '../../state/share';
import { SIGN_MAX, type WorldEvent } from '../../state/worldState';
import type { WorldScene } from '../WorldScene';

/**
 * Mitspieler und geteilte Welt in der Welt-Szene (M11, M12): Live-Nachrichten, Chat, Schilder, Übernahme fremder
 * Ereignisse (Link, Datei, Sync-Server), Export.
 */
export class WorldNet {
  constructor(private readonly ws: WorldScene) {}

  /** Live-Nachricht eines Mitspielers verarbeiten. */
  onLive(m: LiveMsg): void {
    const r = this.ws.remote.onMsg(m);
    if (m.pid === this.ws.state.pid) return;
    if (m.type === 'hit') {
      const e = this.ws.enemies.enemies.get(m.enemy);
      if (!e) return;
      const killed = e.hit(m.dmg, m.x, m.y);
      this.ws.events.emit('damage', { x: e.x, y: e.body.y, amount: m.dmg, color: '#a8d8ff' });
      if (killed) {
        this.ws.enemies.kill(e);
        if (Math.hypot(e.x - this.ws.player.x, e.y - this.ws.player.y) < 15 * TILE_PX) this.ws.hero.shareXp(e);
      }
    }
    if (m.type === 'chat') {
      this.ws.news.push({ tick: 0, text: `${m.name}: „${m.text}“` });
      debugState.news = this.ws.news.map((n) => n.text);
    }
    if (m.type === 'state' && r && !this.knownLive.has(m.pid)) {
      this.knownLive.add(m.pid);
      this.ws.events.emit('float', { x: this.ws.player.x, y: this.ws.player.y - 60, text: `${m.name} ist da!`, color: '#2fe0d8' });
    }
  }

  private readonly knownLive = new Set<string>();

  /** Kurze Nachricht an alle live verbundenen Mitspieler. */
  chat(text?: string): void {
    const msg = (text ?? window.prompt(`Nachricht an Mitspieler (max. ${CHAT_MAX} Zeichen):`) ?? '').trim().slice(0, CHAT_MAX);
    if (!msg) return;
    this.ws.myChat = { text: msg, until: Date.now() + 6000 };
    this.ws.live2?.send({ type: 'chat', pid: this.ws.state.pid, name: this.ws.heroName, text: msg });
  }

  /** Botschaft an der aktuellen Stelle hinterlassen (für Mitspieler). */
  placeSign(text?: string): void {
    const t = this.ws.player.tile;
    const msg = (text ?? window.prompt(`Botschaft für andere Spieler (max. ${SIGN_MAX} Zeichen):`) ?? '').trim().slice(0, SIGN_MAX);
    if (!msg) return;
    this.ws.state.record({ t: Date.now(), by: this.ws.heroName, type: 'sign', tx: t.tx, ty: t.ty, text: msg });
    this.ws.state.flush();
    this.ws.signs.refresh();
    this.ws.events.emit('float', { x: this.ws.player.x, y: this.ws.player.y - 50, text: 'Schild aufgestellt', color: '#ffd84a' });
    void this.ws.sync?.sync();
  }

  /** Fremde Ereignisse wurden übernommen: Darstellung auffrischen und berichten. */
  onForeign(fresh: WorldEvent[], announce: boolean): void {
    this.ws.signs.refresh();
    this.ws.towns.refreshAll();
    for (const id of this.ws.state.d.chests) {
      const [tx, ty] = id.slice(6).split(',');
      this.ws.chunks.builtImages.get(`${tx},${ty}`)?.setFrame('chest:1');
    }
    this.ws.state.flush();
    const others = fresh.filter((e) => e.pid !== this.ws.state.pid);
    const news = foreignNews(others, this.ws.world.meta.settlements, this.ws.world.meta.realms);
    this.ws.news.push(...news);
    debugState.news = this.ws.news.map((n) => n.text);
    if (!others.length) return;
    const names = [...new Set(others.map((e) => e.by))].join(', ');
    if (announce) this.ws.events.emit('news-summary', { hours: 0, title: `Welt von ${names} übernommen (${others.length} Ereignisse)`, news });
    else this.ws.events.emit('float', { x: this.ws.player.x, y: this.ws.player.y - 60, text: `Neues von ${names}`, color: '#2fe0d8' });
  }

  /** Teilen-Link im Anker übernehmen (#w=…). */
  async importFromHash(): Promise<void> {
    const m = /^#w=(.+)$/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    const p = await decodeShare(m[1]);
    if (!p || p.seed !== this.ws.world.seedName) return;
    const fresh = this.ws.state.mergeIn(p.events);
    this.onForeign(fresh, true);
  }

  async shareLink(): Promise<string> {
    this.ws.state.flush();
    return shareLink({ seed: this.ws.world.seedName, events: this.ws.state.events });
  }

  /** Datei-Import (Weltpaket). */
  async importFile(file: File): Promise<number> {
    try {
      const p = JSON.parse(await file.text()) as { seed: string; events: WorldEvent[] };
      if (p.seed !== this.ws.world.seedName) return -1;
      const fresh = this.ws.state.mergeIn(p.events);
      this.onForeign(fresh, true);
      return fresh.length;
    } catch {
      return -1;
    }
  }

  exportFile(): void {
    this.ws.state.flush();
    const blob = new Blob([JSON.stringify({ seed: this.ws.world.seedName, events: this.ws.state.events })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `welt-${this.ws.world.seedName}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /** Mitspieler (aus dem Protokoll). */
  players(): { pid: string; name: string; events: number }[] {
    const map = new Map<string, { pid: string; name: string; events: number }>();
    for (const e of this.ws.state.events) {
      const pid = e.pid ?? e.by;
      const p = map.get(pid) ?? { pid, name: e.by, events: 0 };
      p.name = e.by || p.name;
      p.events++;
      map.set(pid, p);
    }
    return [...map.values()].filter((p) => p.name);
  }
}

/** Taten anderer Spieler als Neuigkeiten. */
export function foreignNews(events: WorldEvent[], towns: { id: number; name: string }[], realms: { name: string }[] = []): News[] {
  const out: News[] = [];
  const quests = new Map<string, number>();
  for (const e of events) {
    if (e.type === 'chest') out.push({ tick: 0, text: `${e.by} hat eine Truhe geöffnet.` });
    if (e.type === 'sign') out.push({ tick: 0, text: `${e.by} hat eine Botschaft hinterlassen: „${e.text}“` });
    if (e.type === 'death') out.push({ tick: 0, text: `${e.by} ist gefallen – ein Grabstein erinnert daran.` });
    if (e.type === 'pledge') out.push({ tick: 0, text: `${e.by} hat ${realms[e.realm]?.name ?? 'einem Reich'} die Treue geschworen.` });
    if (e.type === 'discover' && e.id.startsWith('obelisk')) out.push({ tick: 0, text: `${e.by} hat einen Obelisken entdeckt.` });
    if (e.type === 'discover' && e.id.startsWith('town')) out.push({ tick: 0, text: `${e.by} hat ${towns[Number(e.id.slice(5))]?.name ?? 'einen Ort'} besucht.` });
    if (e.type === 'quest' && e.town !== null) quests.set(`${e.by}|${e.town}`, (quests.get(`${e.by}|${e.town}`) ?? 0) + 1);
  }
  for (const [k, n] of quests) {
    const [by, town] = k.split('|');
    out.push({ tick: 0, text: `${by} hat in ${towns[Number(town)]?.name ?? 'einem Ort'} ${n} Quest${n > 1 ? 's' : ''} erledigt.` });
  }
  return out;
}
