import type { Decoration } from '../world/WorldGen';

export type ChunkRequest =
  | { type: 'init'; seed: string }
  | { type: 'chunk'; cx: number; cy: number }
  | { type: 'overview'; step: number };

export interface ChunkResult {
  type: 'chunk';
  cx: number;
  cy: number;
  pixels: ArrayBuffer;
  biomes: ArrayBuffer;
  decorations: Decoration[];
}

export interface OverviewResult {
  type: 'overview';
  size: number;
  biomes: ArrayBuffer;
}
