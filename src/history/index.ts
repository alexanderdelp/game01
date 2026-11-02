/** Einstieg Vorgeschichte: Erzeugung aus einem Seed-Namen über die echte Landschaft. */
import type { WorldGen } from '../world/WorldGen';
import { generateHistory, type HistoryOptions } from './simulate';
import type { History } from './types';

export * from './types';
export { generateHistory } from './simulate';
export { DEFAULT_CONFIG, PRESETS, decodeConfig, encodeConfig, resolveConfig, totalYears, type HistoryConfig, type PartialConfig } from './config';

/** Vorgeschichte über der Landschaft einer Welt (Biome ohne Flüsse, wie die Metadaten sie sehen). */
export function historyOf(world: WorldGen, opts: HistoryOptions = {}): History {
  return generateHistory({ seed: world.seed, biomeAt: (x, y) => world.baseBiomeAt(x, y), elevationAt: (x, y) => world.elevation(x, y) }, opts);
}
