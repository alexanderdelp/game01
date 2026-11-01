import type { Decoration, WorldOptions } from '../world/WorldGen';

export type ChunkRequest =
  | { type: 'init'; seed: string; opts?: WorldOptions }
  | { type: 'chunk'; cx: number; cy: number }
  | { type: 'overview'; step: number }
  /** Ausschnitt der Karte in feinerer Auflösung (zoombare Weltkarte) */
  | { type: 'region'; id: number; x0: number; y0: number; step: number; size: number };

export interface ChunkResult {
  type: 'chunk';
  cx: number;
  cy: number;
  pixels: ArrayBuffer;
  biomes: ArrayBuffer;
  decorations: Decoration[];
  /** Geländeraster (M24): Stufe und Zellart je 4-px-Zelle. */
  levels: ArrayBuffer;
  kinds: ArrayBuffer;
  /** Steilheit des Hangs je Kachel (Höheneinheiten je Kachel). */
  steep: ArrayBuffer;
}

export interface OverviewResult {
  type: 'overview';
  size: number;
  biomes: ArrayBuffer;
}

export interface RegionResult {
  type: 'region';
  id: number;
  x0: number;
  y0: number;
  step: number;
  size: number;
  biomes: ArrayBuffer;
}
