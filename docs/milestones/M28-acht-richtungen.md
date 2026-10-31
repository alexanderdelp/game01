# M28 – Kampf in 8 Richtungen (Nutzerwunsch)

## Warum?

Diagonal laufen geht schon, aber die Figur schaut und schlägt nur in eine der 4 Hauptrichtungen. Der Nutzer möchte
8 Richtungen für Ausrichtung und Schlag.

## Randbedingung

Die LPC-Figuren (Spieler, NPCs, Räuber) haben **nur 4 Blickrichtungen** – diagonale Bilder gibt es nicht, und
Drehen/Verzerren der Sprites sieht bei Pixel-Art schlecht aus. Viele Spiele dieser Art (auch Secret of Mana) zeigen
4 Richtungen, lassen aber in 8 Richtungen zielen.

## Design (Entscheidung Koordinator)

- **Zielrichtung in 8 Richtungen** (`aim`, Einheitsvektor) getrennt von der **Blickrichtung des Sprites** (`facing`,
  weiter 4 Richtungen). Beim Laufen folgt `aim` der Eingabe (8 Richtungen, auch Gamepad/Touch), im Stand bleibt sie.
- **Schlag diagonal:** Die Trefferzone des Hiebs liegt in Zielrichtung (diagonal ein gedrehtes Feld bzw. ein
  Kreissegment vor der Figur), Reichweite gleich lang wie gerade. Der Splitterblitz fliegt ebenfalls in 8 Richtungen.
- **Sichtbar machen:** Zum Hieb ein kurzer prozeduraler **Schwung-Bogen** (Sichelspur, 2–3 Bilder) in Zielrichtung,
  damit diagonal deutlich lesbar ist. Sprite bei Diagonale: die Seitenansicht (links/rechts), weil der Waffenschwung
  dort am deutlichsten ist – in der Arena ausprobieren, ob oben/unten-Diagonalen besser die Vertikale zeigen.
- Gegner bleiben bei ihrer Logik; Rückstoß folgt der Zielrichtung.
- Mitspieler (Netz): bekommen weiter `facing`; `aim` nur, wenn es ohne Protokolländerung geht (sonst Übergabe).

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Diagonale Eingabe → Hieb trifft einen Gegner, der diagonal steht (und nicht einen, der gerade daneben steht). | Unit + E2E Arena |
| R2 | Splitterblitz fliegt diagonal. | E2E |
| R3 | Schwung-Bogen in Zielrichtung sichtbar. | Screenshot Arena |
| R4 | Gerade Richtungen fühlen sich unverändert an (bisherige Kampftests grün). | E2E |

## Ergebnis

- `Actor.aim` (8 Richtungen, eingerastet über `aimFrom`) neben `facing`. Der Spieler aktiviert es über `PlayerCombat`
  (`diagonalFacing = 'side'`); NPCs/Gegner/Mitspieler behalten das bisherige Verhalten (`'default'`).
- **Entscheidung Sprite diagonal: Seitenansicht.** Vergleich in der Arena (`g.arenaDiagonal('vertical')`,
  `screenshots/m28-schwung-diagonal*.png`): In der Seitenansicht ist der Dolchschwung zur Seite sichtbar und passt zum
  Bogen; in der Vorderansicht verdeckt der Körper die Klinge.
- **Loslass-Toleranz** (`PLAYER_AIM.releaseGrace` = 0,08 s, Arena-Regler): Zwei Tasten werden nie gleichzeitig
  losgelassen; ohne sie ging die Diagonale beim Anhalten verloren (im Arena-Test gefunden).
- Trefferzone `attackZone`: gerade exakt wie `attackBox` (R4, Unit-Test über ein Raster), diagonal gedrehtes Feld
  40 px breit, gleiche Reichweite; Trennachsen-Test `zoneHits`. Rückstoß der Gegner in Zielrichtung.
- Splitterblitz fliegt in `aim` (R2), Schwung-Bogen: 3 im Code erzeugte Sichel-Bilder in Zielrichtung (R3).
- Tests: `tests/unit/m28.test.ts`, E2E `arena.spec.ts` › M28 (Hieb diagonal trifft, quer daneben nicht; Blitz diagonal).
- Offen: E2E `m4-combat`, `m17-feel`, `m14-explore` in dieser Session nicht mehr ausgeführt (Nutzungslimit).

