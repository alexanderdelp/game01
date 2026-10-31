/** Gamepad-Belegung (Standard-Layout, z. B. Xbox/PlayStation über den Browser). Rein, testbar. */

export type PadAction = 'attack' | 'interact' | 'potion' | 'menu' | 'map' | 'sprint' | 'zoomIn' | 'zoomOut' | 'spell';

/** Tasten-Index (Standard-Gamepad) → Aktion. */
export const PAD_BUTTONS: Record<number, PadAction> = {
  0: 'attack', // A / Kreuz
  2: 'interact', // X / Quadrat
  3: 'potion', // Y / Dreieck
  9: 'menu', // Start
  8: 'map', // Select / Back
  5: 'zoomIn', // RB
  4: 'zoomOut', // LB
  1: 'sprint', // B / Kreis (halten)
  7: 'spell', // RT / R2
};

/** Bewegungsrichtung aus Stick und Steuerkreuz, mit Totzone. */
export function padDirection(axisX: number, axisY: number, dpad: { left: boolean; right: boolean; up: boolean; down: boolean }, deadzone = 0.25): { x: number; y: number } {
  let x = Math.abs(axisX) > deadzone ? axisX : 0;
  let y = Math.abs(axisY) > deadzone ? axisY : 0;
  if (dpad.left) x = -1;
  if (dpad.right) x = 1;
  if (dpad.up) y = -1;
  if (dpad.down) y = 1;
  const len = Math.hypot(x, y);
  return len > 1 ? { x: x / len, y: y / len } : { x, y };
}
