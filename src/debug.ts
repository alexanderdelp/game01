/** Zustand für Akzeptanztests und Fehlersuche, erreichbar als `window.__game`. */
export const debugState = {
  seed: '',
  ready: false,
  spawn: { tx: 0, ty: 0 },
  focus: { tx: 0, ty: 0 },
  biome: '',
  zoom: 1,
  chunksLoaded: 0,
  chunksPending: 0,
  mapOpen: false,
  mapReady: false,
};

(globalThis as unknown as { __game: typeof debugState }).__game = debugState;
