# M1 – Prozedural aus einem Seed generierbare, offene & weite Welt

## Ziel

Aus einem Seed (Text) entsteht deterministisch eine große, abwechslungsreiche Welt, die man im
Browser frei erkunden kann (Kamera fliegt über die Welt; einen Avatar gibt es erst in M2).

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Gleicher Seed → identische Welt (Kachel für Kachel), unabhängig von Lade-Reihenfolge der Chunks. | Unit-Test |
| R2 | Unterschiedliche Seeds → deutlich unterschiedliche Welten. | Unit-Test |
| R3 | Welt ist groß: 4096 × 4096 Kacheln, ozeanumrandet, Land 30–70 %. | Unit-Test (Stichprobe) |
| R4 | Mindestens 10 verschiedene Biome kommen in einer Welt vor, inkl. der Sonderbiome Kristallhain und Schrottödnis. | Unit-Test |
| R5 | Startpunkt liegt immer auf begehbarem Land. | Unit-Test (mehrere Seeds) |
| R6 | Chunks werden um die Kamera nachgeladen und außer Sicht entladen; flüssig (Generierung eines Chunks < 25 ms). | Unit-Test (Zeit), E2E |
| R7 | Seed wählbar per URL (`?seed=...`) und im Spiel (Taste N: neuer Zufalls-Seed). | E2E |
| R8 | Weltkarte (Taste M) zeigt den ganzen Kontinent und die aktuelle Position. | E2E-Screenshot |
| R9 | HUD zeigt Seed, Koordinaten, Biom. | E2E |
| R10 | Kamera: WASD/Pfeile bewegen, Mausrad zoomt, Pixel bleiben scharf. | E2E |
| R11 | Biomgrenzen wirken organisch (keine harten Kachelkanten), Dekorationen pro Biom. | Screenshot-Sichtprüfung |

## Umsetzung (Kurz)

- `world/rng.ts`: String-Hash, Mulberry32, Koordinaten-Hash.
- `world/noise.ts`: geseedetes 2D-Simplex-Rauschen + fBm + Domain Warping.
- `world/biomes.ts`: Biom-Definitionen (Name, Begehbarkeit, Farben, Dekorationen).
- `world/WorldGen.ts`: Klima-Felder, Biom-Klassifikation, Chunk-Daten, Startpunkt, Übersichtskarte.
- `render/groundPatterns.ts`, `render/sprites.ts`, `render/textures.ts`: prozedurale Biom-Muster und Pixel-Sprites.
- `render/chunkPixels.ts`: rendert Chunks pixelgenau in Canvas-Texturen (Biom auf 2-px-Raster mit Verwirbelung → weiche Grenzen).
- Szenen: `WorldScene` (Welt + Kamera), `UIScene` (HUD, Karte).

## Ergebnis

Erreicht am 2026-10-30. Alle Anforderungen R1–R11 erfüllt:
Unit-Tests (`tests/unit/world.test.ts`) für R1–R6, Akzeptanztest (`tests/e2e/m1-world.spec.ts`) für R6–R10,
R11 per Screenshot geprüft.

Abweichungen von der Planung:
- Chunk-Rendering liegt in `render/chunkPixels.ts` (Worker-fähig, ohne Phaser), `render/ChunkManager.ts` verwaltet Laden/Entladen über einen Worker-Pool.
- Werkzeuge `tools/preview-map.ts` und `tools/preview-area.ts` erzeugen Karten-/Ausschnittbilder ohne Browser (zum Abstimmen der Generierung).
