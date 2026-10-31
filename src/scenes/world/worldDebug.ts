import { debugState } from '../../debug';
import { enemiesForChunk } from '../../combat/enemies';
import { TILE_PX } from '../../render/chunkPixels';
import { addItem } from '../../rpg/progression';
import { generateItem, type Slot } from '../../rpg/items';
import { worldNow } from '../../sim/LiveWorld';
import { caravanPos } from '../../sim/simulation';
import { CHUNK_TILES, WORLD_TILES } from '../../world/WorldGen';
import type { WorldScene } from '../WorldScene';

/** Test-Schnittstelle (`window.__game`): Abfragen und Abkürzungen für die Akzeptanztests. */
export function installDebugHooks(ws: WorldScene, spawn: { tx: number; ty: number }): void {
    debugState.seed = ws.world.seedName;
    debugState.spawn = spawn;
    debugState.fogKnows = (tx: number, ty: number) => ws.fog.knows(tx, ty);
    debugState.heightAt = (tx: number, ty: number) => ws.sight.heightAt(tx, ty);
    debugState.seesTile = (tx: number, ty: number) => ws.sight.seesPx(tx * TILE_PX + 16, ty * TILE_PX + 16);
    debugState.findCliff = () => {
      const p = ws.player.tile;
      for (let r = 0; r < 120; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const tx = p.tx + dx;
            const ty = p.ty + dy;
            // drei Kacheln breit frei, darüber über die ganze Breite Wand, kein Pfad
            let ok = true;
            for (let k = -1; k <= 1 && ok; k++) {
              ok = ws.world.isWalkable(tx + k, ty) && ws.world.isWalkable(tx + k, ty + 1) && !ws.world.isWalkable(tx + k, ty - 1) && !ws.world.meta.isRoad(tx + k, ty - 1);
            }
            if (ok) return { tx, ty };
          }
        }
      }
      return null;
    };
    debugState.fogFraction = () => ws.fog.fraction;
    debugState.fogReveal = (tx: number, ty: number, r: number) => void ws.fog.reveal(tx, ty, r);
    debugState.teleport = (tx: number, ty: number) => ws.player.setPosition(tx * TILE_PX + TILE_PX / 2, ty * TILE_PX + TILE_PX - 1);
    debugState.findEnemy = (kind?: string) => {
      const c = { x: Math.floor(spawn.tx / CHUNK_TILES), y: Math.floor(spawn.ty / CHUNK_TILES) };
      for (let r = 1; r < 30; r++) {
        for (let cy = c.y - r; cy <= c.y + r; cy++) {
          for (let cx = c.x - r; cx <= c.x + r; cx++) {
            if (Math.max(Math.abs(cx - c.x), Math.abs(cy - c.y)) !== r) continue;
            const e = enemiesForChunk(ws.world, cx, cy, spawn).find((s) => !kind || s.kind === kind);
            if (e) return { tx: e.tx, ty: e.ty, kind: e.kind };
          }
        }
      }
      return null;
    };
    debugState.giveItem = (slot: string, base?: string) => {
      const it = generateItem(3, Math.random, slot as Slot);
      if (base) it.base = base;
      addItem(ws.hero.hero, it);
      ws.events.emit('hero-changed');
      return it.id;
    };
    debugState.choose = (i: number) => ws.choose(i);
    debugState.heroLook = () => ws.hero.appearance();
    debugState.pledge = () => ws.myPledge();
    debugState.killEnemy = (id: string) => {
      const e = ws.enemies.enemies.get(id);
      if (!e) return false;
      e.hit(e.stats.hp + 1, ws.player.x, ws.player.y);
      ws.enemies.kill(e);
      ws.hero.onDefeated(e);
      return true;
    };
    debugState.state = () => ({
      chests: [...ws.state.d.chests],
      discovered: Object.fromEntries(ws.state.d.discovered),
      prosperity: Object.fromEntries(ws.state.d.prosperity),
      reputation: Object.fromEntries(ws.state.d.reputation),
      events: ws.state.events.length,
    });
    debugState.recordQuest = (tx: number, ty: number) => ws.talk.recordQuest(tx, ty);
    debugState.travel = (id: number) => ws.travel(id);
    debugState.placeSign = (text: string) => ws.placeSign(text);
    debugState.chat = (text: string) => ws.chat(text);
    debugState.remotes = () => [...ws.remote.remotes.values()].map((r) => ({ pid: r.pid, name: r.name, x: r.x, y: r.y, chat: r.chat?.text ?? '' }));
    debugState.liveConnected = () => !!ws.live2?.connected;
    debugState.shareLink = () => ws.net.shareLink();
    debugState.players = () => ws.net.players();
    debugState.syncStatus = () => ws.sync?.status ?? 'aus';
    debugState.syncNow = () => ws.sync?.sync() ?? Promise.resolve();
    debugState.caravanAt = (i: number) => {
      const c = ws.live.caravans[i];
      return c ? caravanPos(c, worldNow()) : null;
    };
    debugState.meta = {
      settlements: ws.world.meta.settlements.map((s) => ({ id: s.id, name: s.name, tx: s.tx, ty: s.ty, capital: s.capital, realm: s.realm })),
      rivals: [...ws.world.meta.rivals],
      obelisks: ws.world.meta.obelisks.map((o) => ({ tx: o.tx, ty: o.ty })),
      ruins: ws.world.meta.ruins.map((r) => ({ tx: r.tx, ty: r.ty })),
      chunkPoi: (cx: number, cy: number) => ws.world.meta.chunkPoi(cx, cy),
    };
    debugState.damagePlayer = (n: number) => ws.combat.hurt(n, ws.player.x + 1, ws.player.y, true);
    debugState.findShore = () => {
      // Nach rechts laufen, bis Wasser kommt: Kachel davor ist begehbar, ihr rechter Nachbar Wasser.
      const { tx, ty } = ws.player.tile;
      for (let k = 0; k < 40; k++) {
        const y = ty + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 7;
        for (let x = tx; x < WORLD_TILES; x++) {
          if (ws.world.biomeAt(x + 1, y) > 1) continue;
          if (ws.world.isWalkable(x, y) && ws.world.isWalkable(x, y + 1) && ws.world.isWalkable(x - 1, y)) return { tx: x, ty: y };
          break;
        }
      }
      return null;
    };
}
