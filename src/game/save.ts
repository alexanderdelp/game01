/** Lokale Speicherstände im Browser. Jeder Zugriff ist abgesichert (privater Modus, volle Quota). */

const PREFIX = 'game01:';

export function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Speichern ist Komfort, kein Muss.
  }
}
