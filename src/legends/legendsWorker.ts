/// <reference lib="webworker" />
/** Web Worker des Legenden-Modus: erzeugt Vorgeschichte und Übersichtskarte abseits des Haupt-Threads. */
import { historyOf, type HistoryConfig } from '../history';
import { WorldGen } from '../world/WorldGen';

export interface LegendsRequest {
  seed: string;
  config: HistoryConfig;
}

/** Kacheln je Kartenpixel der Übersicht. */
export const MAP_STEP = 16;

self.onmessage = (ev: MessageEvent<LegendsRequest>) => {
  const world = new WorldGen(ev.data.seed);
  const history = historyOf(world, { config: ev.data.config });
  const size = Math.floor(8192 / MAP_STEP);
  const biomes = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) biomes[y * size + x] = world.baseBiomeAt(x * MAP_STEP + MAP_STEP / 2, y * MAP_STEP + MAP_STEP / 2);
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ history, size, biomes: biomes.buffer }, [biomes.buffer]);
};
