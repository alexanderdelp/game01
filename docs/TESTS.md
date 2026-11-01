# Tests – Grundsätze und Abdeckung

## Grundsätze

1. **Logik per Unit-Test** (`tests/unit`, Vitest, ohne Browser): Generierung, Simulation, Quests, Werte,
   Kampfformeln und Zeitwerte, Weltzustand, Teilen-Code, Live-Nachrichten. Schnell, genau, deterministisch.
2. **E2E nur für das, was nur im Browser prüfbar ist** (`tests/e2e`, Playwright): Start und Laden,
   Eingabe → Bewegung/Kampf, Oberflächen-Abläufe, Speichern/Neuladen, Netz-Zusammenspiel. **Je Bereich ein schlanker
   Ablauf**, keine Wiederholung dessen, was Unit-Tests schon zeigen.
3. **Am Spielzustand prüfen, nicht an der Uhr.** Der Testbrowser läuft gedrosselt, der CI-Rechner noch langsamer.
   - Warten per `expect.poll` auf `window.__game` (Hilfen in `tests/e2e/helpers.ts`: `tp`, `talkTo`, `saveAndReload`,
     `waitReady`, `waitCreate`).
   - Bewegen nach **Bildern** statt Millisekunden: `hold(page, key, frames)`, `frames(page, n)`, `walk(page, key, px)`.
   - Speichern über `pagehide` (`saveAndReload`) statt auf den 2-s-Speichertakt zu warten.
   - Feste Wartezeit nur, wo geprüft wird, dass *nichts* passiert (dann in Bildern, mit Kommentar).
4. **Unabhängige Tests, parallel.** Jeder Test hat einen eigenen Browser-Kontext (eigener `localStorage`), Netz-Tests
   starten den Referenz-Server auf einem freien Port (`syncServer()`). Playwright: `fullyParallel`, 4 Worker lokal,
   2 in CI, `retries: 1` nur in CI.
5. **Kleines Testfenster 960 × 540** (Standard in `playwright.config.ts`): seit M27 derselbe Weltausschnitt wie im
   Laptop-Fenster (Zoom 1 statt 2), aber halb so viele Pixel – das Software-Zeichnen im Testbrowser ist der größte
   Rechenposten. Wo Fenstergröße die Aussage ist, setzt der Test sie selbst: M27-Zoom und Weltkarte 1280 × 720,
   Arena 1280 × 720 (Bedienfeld/Klicks), niedriges Laptop-Fenster 1280 × 560, Handy 390 × 844.
6. **Testmodus `?test=1`** (feste Weltzeit Mittag, keine Invasionen) für alles, was nicht gerade die echte Uhr prüft.
7. **Bildschirmfotos nur auf Wunsch:** `shot(page, name)` macht nur mit `SHOTS=1` ein Bild (`npm run shots`), im
   normalen Lauf kostet es nichts. Optik prüft man per Screenshot, nicht per Test.
8. **Keine Pixelpositionen oder Texte ohne Bedeutung prüfen.** Texte nur, wo sie die Aussage sind („Feinde“,
   „Gefolgsmann“).
9. **Neue Funktion:** Logik → Unit-Test in `tests/unit/mXX.test.ts`; sichtbarer Ablauf → ein Schritt im
   E2E-Ablauf des Moduls (`tests/e2e/<modul>.spec.ts`), möglichst in einen bestehenden Test einfügen statt die Welt
   neu zu laden.

## Laufzeit (lokal, 8 Kerne, Rechner durch andere Sessions belastet)

| | E2E-Tests | Laufzeit | Unit |
|---|---|---|---|
| vorher (main 52cccf7, 1 Worker) | 39 | 536 s | 139 Tests, ~8 s |
| nachher, 4 Worker, 1280 × 720 | 31 | 303 / 295 / 287 s | |
| nachher, 4 Worker, 960 × 540 | 31 | **E2E ~3,7 min**: 3 Abschlussläufe ohne Fehlschlag, ohne Retries (Load ~25), ganzes `npm run check` 236 s | 139 Tests, ~7 s |

## Befehle

| Befehl | Was |
|---|---|
| `npm test` | alle Unit-Tests (~7 s) |
| `npm run e2e` | alle E2E-Tests (braucht `npm run build`) |
| `npm run e2e:smoke` | schnelle Teilmenge: Welt + Oberfläche |
| `npm run check` | Gesamttest: Unit, Build, E2E |
| `npm run shots` | E2E mit Bildschirmfotos nach `screenshots/` |
| `E2E_PORT=4191 npx playwright test …` | eigener Port, wenn parallel andere Sessions testen |

## E2E-Dateien (je Modul)

| Datei | Abläufe |
|---|---|
| `welt.spec.ts` | Laden, Laufen, Zoom, Karte · Wasser-Grenze, Position + Fog nach Neuladen · Klippe + Sichtschatten |
| `weltenbau.spec.ts` | NPCs · Hauptstadt/Treueschwur/Händler/Rivale · Truhe/Obelisk/Chronik · Wohlstand/Rabatt/Schnellreise · Karawane · Neuigkeiten |
| `inhalte.spec.ts` | Quest annehmen/abgeben/Neuladen · Questpfeil |
| `figur.spec.ts` | Erschaffung · Heldenfenster/Kleidung/Trank/Barbier/Speichern · Beute |
| `oberflaeche.spec.ts` | Titel/Hinweise/Minimap · Weltkarte zoomen · Handy (Stick, Menü, Ton, Minimap) |
| `netz.spec.ts` | Link teilen · Abgleich über Server · Live-Spiel |
| `kampf.spec.ts` | Hieb + Spielgefühl · Sterben · Splitterblitz · Ruine · Touch-Angriff |
| `arena.spec.ts` | Kampf-Arena: Grundfunktionen, Aufbauten, Umweg, Waffen, Gegner setzen, Diagonal (M28), Block/Parade/Ausweichen (M31) |

## Abdeckung je Anforderung

Unit = `tests/unit/mXX.test.ts` (M1: `world.test.ts`). „Sicht“ = nur per Screenshot/Freigabe geprüft.

| Meilenstein | Unit | E2E |
|---|---|---|
| M1 Welt | R1–R6 (Determinismus, Größe, Biome, Spawn, Chunk-Zeit) | R7–R10 `welt` Test 1/2 · R11 Sicht |
| M2 Avatar | R2–R4, R7 (Kollision, Gleiten, Tempo, Ebenen/Umfärben) | R1/R2 `welt` 1 · R3 `welt` 2 (Wasser) · R6 `welt` 2 · R8 `oberflaeche` Handy · R5/R9 Sicht/Review |
| M3 NPCs | R1, R2, R4, R6 | R3/R5 `weltenbau` NPCs · R7 entfällt (Leistung über Laufzeit der Suite sichtbar) |
| M4 Kampf | R1, R2, R4, R6 (`m4`, `m28`) | R1 `kampf` Hieb · R3/R4 `kampf` Sterben · R7 `kampf` Touch · R5 Sicht |
| M5 RPG | R1–R3, R8 | R4 `figur` Beute · R5/R7/R8 `figur` Heldenfenster · R6 Sicht |
| M6 Gestaltung | R1, R2 | R3–R6 `figur` Erschaffung |
| M7 Quests | R1–R3 (inkl. Abbrechen, max. 5) | R3/R5 `inhalte` Quest · R4 Sicht |
| M8 Weltenbau | R1–R3 | R3 `weltenbau` Hauptstadt · R4 `weltenbau` Truhe · R5 Sicht |
| M9 Persistenz | R1, R2, R4 | R2–R5 `weltenbau` Wohlstand |
| M10 Lebendig | R1–R6 (Zeit, Wetter, Karawanen, Macht, Invasion, Neuigkeiten) | R2/R3 `weltenbau` Karawane (Rauchtest) · R6 `weltenbau` Neuigkeiten |
| M11 Geteilt | R1 + Teilen-Code | R2/R3/R5 `netz` Link · R4 `netz` Server |
| M12 Live | R1 | R2–R4 `netz` Live |
| M13 Feinschliff | R3 (Noten), Gamepad | R1/R3 `oberflaeche` Handy · R2/R4 `oberflaeche` Titel |
| M14 Erkundung | R1, R2 | R3 `kampf` Ruine |
| M15 Fraktionstreue | R1, R2, R3 (Herrscher je Hauptstadt) | R3 `weltenbau` Hauptstadt |
| M16 Orientierung | R1 (≥ 5 s, Reihenfolge), R2 | R1 `oberflaeche` Titel (Klick → nächster) · R3 `inhalte` Questpfeil · R4 `oberflaeche` Titel + Handy |
| M17 Kampfgefühl | R1 (Zeitwerte) | R2/R3 `kampf` Hieb |
| M18 Editor | R1–R5 | R4 `figur` Erschaffung · R5 `figur` Heldenfenster (Barbier) |
| M19 Welt | R1–R3, R6 | R4 = ganze Suite · R5 Freigabe |
| M20 Fog of War | R1 | R2 `welt` 2 · R3 Sicht |
| M21 Arena | – | R1 `arena` Grundfunktionen · R2 `kampf` |
| M22 Weltkarte | – | R1/R2 `oberflaeche` Karte · R3 `weltenbau` Wohlstand (Schnellreise) |
| M23 Aussehen | R1–R3 | R1/R4 `figur` Heldenfenster · R3/R4 `figur` Erschaffung |
| M24 Höhen | R1–R5 | R6 `welt` Klippe · R7 = ganze Suite |
| M25 Arena-Werkzeuge | R1–R3 (Aufbauten, Wegfindung, Waffen) | R1–R4 `arena` · R5 `kampf` |
| M26 Kanten | R1, R3 | R2 Sicht · R4 = ganze Suite |
| M27 Fester Ausschnitt | Zoom-Grenzen | `welt` 1 (Zoom 2 bei 1280 × 720) |
| M28 Acht Richtungen | R1 | R1–R3 `arena` M28 · R4 `kampf` |
