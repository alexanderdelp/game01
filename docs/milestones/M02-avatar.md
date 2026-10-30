# M2 – Eigener Avatar zum Bewegen in der Welt

## Ziel

Eine eigene Spielfigur (LPC-Sprite) läuft durch die generierte Welt. Die Welt hat physische Grenzen
(Wasser, Felsgipfel, Bäume, Felsen), das Gelände fühlt sich unterschiedlich an, und das Spiel merkt sich,
wo man war. Spielbar auch auf dem Handy.

## Design

- **Figur:** aus LPC-Ebenen zusammengesetzt (Körper, Kopf, Haare, Oberteil, Hose, Stiefel), Farben per
  Paletten-Umfärbung (LPC-Paletten). Damit ist das Customizing in M6 nur noch UI-Arbeit.
- **Bewegung:** 8 Richtungen, ~5,5 Kacheln/s; Shift = rennen. Animationen: Gehen und Stehen in 4 Richtungen.
- **Gelände:** Wasser und Felsgipfel unbegehbar. Sumpf, Schnee, Gebirge und Dschungel bremsen, Strand und Grasland nicht.
- **Hindernisse:** Bäume, Kakteen, Felsbrocken, Kristalle, Schrott und Masten haben eine kleine Kollisionsbox am Fuß.
  Gräser, Blumen und Schilf sind begehbar.
- **Tiefe:** Die Figur wird nach Y-Position mit den Dekorationen sortiert (läuft hinter Baumkronen vorbei).
- **Kamera:** folgt der Figur weich; Zoom bleibt.
- **Speichern:** Position wird pro Seed im Browser gespeichert (alle 2 s und beim Verlassen) und beim Start wiederhergestellt.
- **Touch:** Ziehen auf dem Bildschirm = virtueller Stick. Buttons für Karte und Zoom.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Figur erscheint am Startpunkt, Kamera folgt ihr. | E2E |
| R2 | Bewegung mit WASD/Pfeilen in 8 Richtungen, passende Lauf-/Stehanimation pro Richtung. | E2E + Unit |
| R3 | Figur kann nicht ins Wasser, nicht auf Felsgipfel, nicht durch Baumstämme/Felsbrocken. Gleiten an Hindernissen entlang. | Unit (Kollision) + E2E |
| R4 | Geländeabhängige Geschwindigkeit. | Unit |
| R5 | Figur wird korrekt hinter/vor Dekorationen sortiert. | Screenshot |
| R6 | Position bleibt nach Neuladen erhalten (pro Seed). | E2E |
| R7 | Figur ist aus LPC-Ebenen zusammengesetzt und umfärbbar. | Unit (Umfärben) + Screenshot |
| R8 | Steuerung per Touch (virtueller Stick, Karten-Button). | E2E (Touch-Emulation) |
| R9 | LPC-Credits vollständig (`public/assets/lpc/CREDITS-LPC.csv`, `CREDITS.md`). | Review |

## Ergebnis

Erreicht am 2026-10-30. R1–R8 durch `tests/unit/m2.test.ts` und `tests/e2e/m2-avatar.spec.ts` abgedeckt,
R5 per Screenshot geprüft, R9: 108 LPC-Dateien mit Credits in `public/assets/lpc/CREDITS-LPC.csv`.

Anpassungen während der Umsetzung:
- **Maßstab auf 32-px-Kacheln umgestellt** (vorher 16 px): LPC-Figuren sind für 32-px-Kacheln gezeichnet; mit 16 px
  wirkten Bäume winzig neben der Figur. Chunks sind jetzt 16 × 16 Kacheln (512 px), die Welt bleibt 4096 Kacheln groß.
- **Dekorationen prozedural generiert** (`render/procSprites.ts`) statt ASCII-Sprites – im LPC-Maßstab, 4 Varianten je Art.
- Startzoom passt sich der Bildschirmbreite an (Handy 1×, Desktop 2×).
- LPC-Import ist reproduzierbar: `python3 -I tools/import_lpc.py <ulpc-klon>` mit Teileliste `tools/lpc-parts.json`.
