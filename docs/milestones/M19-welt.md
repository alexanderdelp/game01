# M19 – Organische, weite Welt (aus Feedback-Runde 1)

## Warum?

Spieltest (`docs/FEEDBACK-2026-10-31.md`, Punkt 6): Die Welt wirkt baukastenhaft (gleichmäßig verstreute Objekte,
einfarbige Flächen), und man läuft in 10–20 s durch ein Biom. Wunsch des Nutzers: **1–2 min je Biom**.

## Befund (vorher)

- Gemessen mit `tools/biome-stats.ts`: Biom-Abschnitte im Median 28 Kacheln (6 s), längengewichtet ~140 Kacheln
  (~30 s). Ursache: Klima-Rauschen mit vielen feinen Oktaven → viele kleine Flecken.
- Jede Kachel würfelt ihre Dekoration unabhängig → gleichmäßige Streuung.
- Biomgrenzen nur ±0,6 Kacheln verwirbelt; Böden ohne Details.

## Design

- **Welt 8192 × 8192 Kacheln** (4× Fläche, `SCALE = 2`), Klimafelder großräumig und mit wenigen Oktaven. Abstände
  für Reiche, Dörfer (mehr je Reich), Obelisken und Ruinen (6 je Reich) wachsen mit; Gegnerstufe alle 300 Kacheln.
  Sonderbiome (Kristallhain, Schrottödnis) ~1 % der Fläche, unregelmäßig geformt.
- **Gehäufte Vegetation:** Ein großräumiges Rauschfeld bestimmt Haine und Lichtungen (Wälder) bzw. Baumgruppen
  (offenes Land). Am Rand eines Hains wachsen **junge Bäume** (neue Arten `youngoak`, `youngpine`). Blumen und
  Steine wachsen in Flecken.
- **Boden:** Erdflecken, Laub (Wald, Dschungel), Kiesel (steinige Biome), **Höhenschattierung** (Licht von
  Nordwesten), Biomgrenzen grob und fein verwirbelt (±1,5 Kacheln). Ortsplatz und Pfade nur leicht verwirbelt.
- **Trampelpfade:** Jeder Ort ist mit seinen zwei nächsten Nachbarn verbunden (geschwungen, 2 Kacheln breit,
  frei von Pflanzen, enden am Ortsrand). Wasser unterbricht sie.
- Übersichtskarte 1 Pixel = 16 Kacheln; Minimap 6-fach vergrößert (Ausschnitt ~400 Kacheln).
- **Weltversion 2:** Gespeicherte Positionen aus älteren Welten werden verworfen (Start am Startpunkt). Held,
  Stufe und Inventar bleiben. Bestehende Welten sehen nach dem Update anders aus.
- **Flüsse:** ~12 je Welt, entspringen im Gebirge, folgen dem Gefälle (mit leichtem Zug zur Küste und ohne zu
  kreisen) und werden breiter (1 → 3 Kacheln). Wer kein Meer erreicht, endet in einem See. Flüsse sind
  unpassierbar; wo ein Pfad einen Fluss quert, steht eine **Brücke**. Orte, Ruinen und Obelisken bleiben trocken.
  Technisch: neue Biome `River`/`Bridge`, aus den Metadaten über das Gelände gelegt (`WorldGen.withWater`).

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Biom längengewichtet > 280 Kacheln (≈ 1 min zu Fuß). | Unit + `tools/biome-stats.ts` |
| R2 | Trampelpfade zwischen Orten, begehbar, ohne Pflanzen. | Unit |
| R3 | Bäume gehäuft (Varianz je Chunk deutlich über gleichmäßiger Streuung), junge Bäume vorhanden. | Unit |
| R4 | Alle bisherigen Akzeptanztests laufen in der größeren Welt. | E2E |
| R5 | Vorher/Nachher-Bilder vom Nutzer freigegeben. | Telegram |
| R6 | Flüsse unpassierbar, Brücken begehbar, Orte trocken. | Unit |

## Ergebnis

Erreicht am 2026-10-31 (R5: vom Nutzer freigegeben): R1–R4, R6 erfüllt (`tests/unit/m19.test.ts`, alle E2E grün). Gemessen: längengewichtet
380–510 Kacheln ≈ 80–110 s je Biom (Seeds test, alpha, nebel). Chunk-Zeichnen ~85 ms statt ~50 ms (im Worker).
Metadaten (inkl. Flüsse und Pfade) 150–200 ms je Welt; dafür gibt es eine reine Höhenfunktion
(`WorldGen.elevation`), die etwa die Hälfte des Klimas spart.
