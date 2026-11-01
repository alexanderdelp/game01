/** Zustand für Akzeptanztests und Fehlersuche, erreichbar als `window.__game`. */
export const debugState = {
  /** Versatz der Weltzeit in ms (Tests, Vorschau). */
  timeOffset: 0,
  /** Testmodus: keine Invasionen */
  calm: false,
  scene: '',
  createChange: (_row: number, _dir: number): void => {},
  createConfirm: (_name?: string): void => {},
  createLook: (): unknown => null,
  seed: '',
  ready: false,
  spawn: { tx: 0, ty: 0 },
  focus: { tx: 0, ty: 0 },
  /** M28: `aim` = Zielrichtung in 8 Richtungen (Arena; Welt siehe Übergabe) */
  player: { x: 0, y: 0, facing: 'down', moving: false } as { x: number; y: number; facing: string; moving: boolean; aim?: { x: number; y: number } },
  biome: '',
  zoom: 1,
  chunksLoaded: 0,
  chunksPending: 0,
  mapOpen: false,
  panelOpen: false,
  questLogOpen: false,
  chronicleOpen: false,
  newsOpen: false,
  shareOpen: false,
  menuOpen: false,
  tipsShown: 0,
  /** M16: Ziel des Questpfeils ('npc' = auf den NPC selbst, 'place' = Ort, 'area' = kein Pfeil, nur Gebiet) */
  questPointer: 'none' as 'none' | 'npc' | 'place' | 'area',
  minimap: false,
  /** M20: Fog of War */
  fogKnows: (_tx: number, _ty: number): boolean => false,
  fogFraction: (): number => 0,
  fogReveal: (_tx: number, _ty: number, _r: number): void => {},
  /** M24: Höhen und Sicht */
  sightHidden: 0,
  heightAt: (_tx: number, _ty: number): number => 0,
  seesTile: (_tx: number, _ty: number): boolean => true,
  /** Sucht nahe dem Helden eine begehbare Kachel direkt unter einer Felswand (für Tests). */
  findCliff: (): { tx: number; ty: number } | null => null,
  /** Kampf-Arena */
  arenaSpawn: (_kind: string): void => {},
  arenaTune: (_id: string, _v: number): void => {},
  /** M25: Gelände-Aufbau, Waffe und Gegner-Einsetzen der Arena */
  arenaLayout: '',
  arenaSetLayout: (_id: string): void => {},
  arenaWeapon: null as { choice: string; level: number; name: string; attack: number; speed: number; look: string } | null,
  arenaSetWeapon: (_choice: string, _level?: number): void => {},
  arenaSpawnOpts: { count: 1, place: 'random' } as { count: number; place: string },
  arenaBlocked: (_x: number, _y: number, _w: number, _h: number): boolean => false,
  arenaWalkable: (_tx: number, _ty: number): boolean => true,
  arenaSpawnAt: (_kind: string, _tx: number, _ty: number): void => {},
  /** M28: Blickrichtung des Helden bei diagonalem Zielen (Vergleich 'side' / 'vertical') */
  arenaDiagonal: (_mode: string): void => {},
  /** M31: Treffer am Helden aus Richtung (dx, dy) relativ zu ihm, optional von einem Gegner (Parade → wankt) */
  arenaHit: (_dmg: number, _dx: number, _dy: number, _enemyId?: string): void => {},
  /** M31: Block/Ausweichen des Helden (Arena) */
  guard: null as null | { blocking: boolean; blockFor: number; dodging: boolean; dodgeReady: boolean; last: string; blocks: number; parries: number; dodges: number; evaded: number },
  /** Weltpunkt → Bildschirmpunkt (für Klicks in Tests) */
  arenaToScreen: (_x: number, _y: number): { x: number; y: number } => ({ x: 0, y: 0 }),
  bannerTitle: '',
  titleStart: (_seed: string): void => {},
  lastShareLink: '',
  mapReady: false,
  /** Zoomstufe der Weltkarte und Auflösung des feinen Ausschnitts (Kacheln je Pixel, 0 = keiner) */
  mapZoom: 1,
  mapDetail: 0,
  mapZoomBy: (_dir: number): void => {},
  /** M29: Kachel → Bildschirmpunkt auf der offenen Weltkarte (null = Karte zu) */
  /** M29: Nebel auf der Weltkarte gezeichnet (aus im Spielleiter-Modus), GM-Abzeichen im HUD sichtbar */
  mapFog: false,
  gmBadge: false,
  mapTileToScreen: (_tx: number, _ty: number): { x: number; y: number } | null => null,
  teleport: (_tx: number, _ty: number): void => {},
  findShore: (): { tx: number; ty: number } | null => null,
  npcs: [] as { id: string; x: number; y: number; role: string; name: string }[],
  hp: 100,
  objects: 0,
  pledge: (): number | null => null,
  spellCooldown: 0,
  killEnemy: (_id: string): boolean => false,
  attacks: 0,
  /** M28: Anzahl gezeigter Schwung-Bögen (Arena) */
  arcs: 0,
  /** M17: Hieb läuft gerade */
  swinging: false,
  maxHp: 100,
  pickups: 0,
  pickupPos: [] as { x: number; y: number }[],
  giveItem: (_slot: string, _base?: string): string => '',
  clickPanel: (_name: string): boolean => false,
  hero: null as unknown,
  /** Aktuelles Aussehen des Helden (Körper + Ausrüstung) */
  heroLook: (): unknown => null,
  findEnemy: (_kind?: string): { tx: number; ty: number; kind: string } | null => null,
  damagePlayer: (_n: number): void => {},
  alive: true,
  enemies: [] as { id: string; kind: string; x: number; y: number; hp: number; state: string; seen?: boolean }[],
  quests: null as unknown,
  realm: '',
  weather: '',
  invasion: null as unknown,
  caravans: [] as string[],
  placeSign: (_t: string): void => {},
  chat: (_t: string): void => {},
  remotes: (): unknown => [],
  liveConnected: (): boolean => false,
  shareLink: (): Promise<string> => Promise.resolve(''),
  players: (): unknown => [],
  syncStatus: (): string => 'aus',
  syncNow: (): Promise<void> => Promise.resolve(),
  caravanAt: (_i: number): { tx: number; ty: number; resting?: boolean } | null => null,
  news: [] as string[],
  town: '',
  meta: null as unknown,
  state: (): unknown => null,
  recordQuest: (_tx: number, _ty: number): void => {},
  travel: (_id: number): boolean => false,
  /** M29: Spielleiter-Modus */
  gm: false,
  gmSet: (_on: boolean): void => {},
  gmTeleport: (_tx: number, _ty: number): boolean => false,
  walkable: (_tx: number, _ty: number): boolean => true,
  /** Prototyp Vorgeschichte: zuletzt gezeigte Ortsgeschichte im Spielleiter-Modus */
  historyPanel: '',
  /** Prototyp Vorgeschichte: Anzahl Orte, Reiche, Fundorte */
  history: null as null | { sites: number; realms: string[]; historic: { kind: string; tx: number; ty: number; site: number }[]; settlements: number; ruins: number },
  markers: {} as Record<string, string>,
  choose: (_i: number): void => {},
  dialog: null as { name: string; role: string; text: string; choices?: string[] } | null,
};

(globalThis as unknown as { __game: typeof debugState }).__game = debugState;
