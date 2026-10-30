/** Zustand für Akzeptanztests und Fehlersuche, erreichbar als `window.__game`. */
export const debugState = {
  seed: '',
  ready: false,
  spawn: { tx: 0, ty: 0 },
  focus: { tx: 0, ty: 0 },
  player: { x: 0, y: 0, facing: 'down', moving: false },
  biome: '',
  zoom: 1,
  chunksLoaded: 0,
  chunksPending: 0,
  mapOpen: false,
  mapReady: false,
  teleport: (_tx: number, _ty: number): void => {},
  findShore: (): { tx: number; ty: number } | null => null,
  npcs: [] as { id: string; x: number; y: number; role: string; name: string }[],
  hp: 100,
  attacks: 0,
  findEnemy: (_kind?: string): { tx: number; ty: number; kind: string } | null => null,
  damagePlayer: (_n: number): void => {},
  alive: true,
  enemies: [] as { id: string; kind: string; x: number; y: number; hp: number; state: string }[],
  dialog: null as { name: string; role: string; text: string } | null,
};

(globalThis as unknown as { __game: typeof debugState }).__game = debugState;
