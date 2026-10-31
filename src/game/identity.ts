import { load, save } from './save';

/** Dauerhafte, zufällige Spieler-ID dieses Browsers (für geteilte Welten). */
export function playerId(): string {
  let id = load<string>('pid');
  if (!id) {
    id = `p${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
    save('pid', id);
  }
  return id;
}
