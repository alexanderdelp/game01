import { load, save } from '../game/save';
import type { PlaceId } from './places';

/** Einstellungen des Perspektive-Prototyps (im localStorage). */
export interface PerspSettings {
  tilt: number;
  fov: number;
  zoom: number;
  /** Sichtweite nach vorn in Kacheln (Nebel endet dort) */
  sight: number;
  /** Bodenpixel je Bildschirmpixel */
  pixel: number;
  fog: 'dunst' | 'dunkel';
  /** Felswände aufrecht stellen */
  walls: boolean;
  /** Sprites mit der Tiefe verkleinern */
  depthScale: boolean;
  seed: string;
  place: PlaceId;
}

export const DEFAULT_SETTINGS: PerspSettings = {
  tilt: 40,
  fov: 50,
  zoom: 2,
  sight: 40,
  pixel: 1,
  fog: 'dunst',
  walls: true,
  depthScale: true,
  seed: 'splitter',
  place: 'gebirge',
};

const KEY = 'perspektive:settings';

export function loadSettings(): PerspSettings {
  return { ...DEFAULT_SETTINGS, ...load<Partial<PerspSettings>>(KEY) };
}

export function saveSettings(s: PerspSettings): void {
  save(KEY, s);
}
