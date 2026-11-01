import Phaser from 'phaser';
import { debugState } from '../../debug';
import { load, save } from '../../game/save';
import { TILE_PX } from '../../render/chunkPixels';
import { ExploredMap } from '../../world/fog';
import { MAX_VIEW, sees, viewshed } from '../../world/sight';
import { tileHeight } from '../../world/terrain';
import { WORLD_VERSION, type WorldGen } from '../../world/WorldGen';
import type { WorldScene } from '../WorldScene';

/**
 * Radius des Sichtfelds um den Helden in Kacheln (M24) und Kantenlänge des Sichtrasters. Muss den festen
 * Sichtausschnitt (`game/view.ts`, höchstens 32 × 18 Kacheln) ganz abdecken; dahinter gilt alles als verdeckt.
 */
const SIGHT_R = 24;
const SIGHT_N = 2 * SIGHT_R + 1;

/**
 * Sicht und Fog of War der Welt-Szene (M20, M24): Höhen je Kachel, Sichtschatten über verdecktem Gelände,
 * verdeckte Gegner/NPCs ausblenden, Fog of War nur nach Sichtlinie aufdecken und speichern.
 */
export class WorldSight {
  /** Was der Held schon gesehen hat (pro Spieler, lokal gespeichert). */
  readonly fog: ExploredMap;
  private readonly heights = new Map<number, number>();
  private sight: { ox: number; oy: number; vis: Uint8Array } | null = null;
  private readonly tex: Phaser.Textures.CanvasTexture;
  private readonly img: Phaser.GameObjects.Image;
  private last = { tx: -1, ty: -1 };
  /** Spielleiter-Modus (M29): kein Aufdecken, kein Sichtschatten, alles sichtbar. */
  gm = false;

  constructor(private readonly ws: WorldScene, private readonly world: WorldGen) {
    this.fog = ExploredMap.decode(load<string>(this.key));
    this.tex = ws.textures.exists('sight') ? (ws.textures.get('sight') as Phaser.Textures.CanvasTexture) : ws.textures.createCanvas('sight', SIGHT_N, SIGHT_N)!;
    this.tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.img = ws.add.image(0, 0, 'sight').setOrigin(0, 0).setScale(TILE_PX).setDepth(900_000).setVisible(false);
  }

  private get key(): string {
    return `fog${WORLD_VERSION}:${this.world.seedName}`;
  }

  /** Gesamthöhe einer Kachel (Hang + Stufen), zwischengespeichert. */
  readonly heightAt = (tx: number, ty: number): number => {
    const k = tx * 16384 + ty;
    let h = this.heights.get(k);
    if (h === undefined) {
      if (this.heights.size > 250_000) this.heights.clear();
      h = tileHeight(this.world, tx, ty);
      this.heights.set(k, h);
    }
    return h;
  };

  /** Ist der Weltpixel vom Helden aus sichtbar? Außerhalb des Sichtfelds: nein (M27). */
  seesPx(x: number, y: number): boolean {
    const s = this.sight;
    if (!s) return true;
    const dx = Math.floor(x / TILE_PX) - s.ox + SIGHT_R;
    const dy = Math.floor(y / TILE_PX) - s.oy + SIGHT_R;
    if (dx < 0 || dy < 0 || dx >= SIGHT_N || dy >= SIGHT_N) return false;
    return s.vis[dy * SIGHT_N + dx] === 1;
  }

  /** Jeden Frame: bei neuer Kachel aufdecken und Sichtfeld neu berechnen; Verdecktes ausblenden. */
  update(): void {
    if (this.gm) {
      this.img.setVisible(false);
      this.sight = null;
      this.last = { tx: -1, ty: -1 };
      for (const n of this.ws.npcs.npcs.values()) n.setSeen(true);
      for (const e of this.ws.enemies.enemies.values()) e.setSeen(true);
      return;
    }
    const pt = this.ws.player.tile;
    if (pt.tx !== this.last.tx || pt.ty !== this.last.ty) {
      this.last = pt;
      this.fog.revealVisible(pt.tx, pt.ty, (x, y) => sees(this.heightAt, pt.tx, pt.ty, x, y), MAX_VIEW);
      this.updateSight(pt.tx, pt.ty);
    }
    for (const n of this.ws.npcs.npcs.values()) n.setSeen(this.seesPx(n.actor.x, n.actor.y - 4));
    for (const e of this.ws.enemies.enemies.values()) e.setSeen(this.seesPx(e.x, e.y - 4));
  }

  /** Fog of War speichern, falls geändert. */
  save(): void {
    if (!this.fog.dirty) return;
    this.fog.dirty = false;
    save(this.key, this.fog.encode());
  }

  /** Sichtfeld neu berechnen und als weichen Schatten über verdecktes Gelände legen. */
  private updateSight(tx: number, ty: number): void {
    const vis = viewshed(this.heightAt, tx, ty, SIGHT_R);
    this.sight = { ox: tx, oy: ty, vis };
    const ctx = this.tex.getContext();
    const img = ctx.createImageData(SIGHT_N, SIGHT_N);
    for (let i = 0; i < vis.length; i++) {
      img.data[i * 4] = 12;
      img.data[i * 4 + 1] = 14;
      img.data[i * 4 + 2] = 34;
      img.data[i * 4 + 3] = vis[i] ? 0 : 150;
    }
    ctx.putImageData(img, 0, 0);
    this.tex.refresh();
    this.tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    // Texel-Mitten liegen auf Kachelmitten
    this.img.setPosition((tx - SIGHT_R) * TILE_PX, (ty - SIGHT_R) * TILE_PX).setVisible(true);
    debugState.sightHidden = vis.length - vis.reduce((a, v) => a + v, 0);
  }
}
