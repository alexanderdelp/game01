# M24 – Gelände mit Höhen, Klippen und Sicht (Nutzerwunsch)

## Warum?

Die Welt war spielerisch flach. Mit Höhen bekommt das Erkunden neue Reize:

- Wege über Hänge suchen.
- Klippen umgehen.
- Aussichtspunkte besteigen.
- Hinter Hügeln lauert, was man nicht sieht.

Vorschlag und Entscheidung des Nutzers stehen in `docs/VORSCHLAG-hoehen.md`.

## Design

- **Zwei Arten Höhe** (`src/world/terrain.ts`, rein, ohne Phaser):
  - **Hang** (`s`, stufenlos, in Höheneinheiten; 1 Einheit = 16 px Bildhöhe):
    - Sanfte Wellen im Flachland, kräftige Hügel im **Hügelland** und eine Senke um jeden See.
    - Immer begehbar. Steile Hänge bremsen (bis −35 %).
    - Dargestellt durch Licht und Schatten (Licht von Nordwesten).
  - **Klippe** (`level`, ganzzahlige Stufe):
    - Nur im **Gebirge**: Terrassen und Tafelberge mit Felswänden.
    - Ein Stufenwechsel ist nicht begehbar.
    - Die Felswand (32 px je Stufe) liegt unter der Oberkante und ist selbst Hindernis.
    - Auf Pfaden wird die Wand zur **Treppe**.
- **Biome:**
  - **Hügelland** (neu) ersetzt Gras, Wald oder Savanne in hügeligen Zonen und am Fuß der Gebirge.
  - **See** (neu): Wasser in Senken des Flachlands.
- **Sicht** (`src/world/sight.ts`):
  - Sichtlinie über die Gesamthöhe (Hang + Stufen) von Augenhöhe aus. Was hinter höherem Gelände liegt, ist
    **abgedunkelt**, Gegner und NPCs dort sind **unsichtbar**.
  - Der **Fog of War** deckt nur auf, was in Sichtlinie liegt.
  - Sichtweite 20 Kacheln, von oben weiter: +1,5 Kacheln je Einheit Höhenvorsprung, bis 50.
- **Daten:** Der Chunk-Worker liefert je Chunk ein 4-px-Raster mit Stufe und Wand/Treppe für die Kollision. Der
  Haupt-Thread rechnet Höhen je Kachel selbst (mit Zwischenspeicher) für Sicht und Fog.
- **Weltversion 3:** alte Spielstände werden nicht übernommen (Tech-Demo, Nutzerentscheidung).

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Höhen sind deterministisch aus dem Seed; Hügelland und Seen kommen vor. | Unit |
| R2 | Klippen nur im Gebirge, nicht im Flach- oder Hügelland; Hänge sind begehbar. | Unit |
| R3 | Eine Klippe kann man nicht überqueren, eine Treppe auf einem Pfad schon. | Unit |
| R4 | Sichtlinie: auf ebenem Land frei, hinter einem Hügel verdeckt, von oben weiter. | Unit |
| R5 | Fog of War deckt nur Sichtbares auf. | Unit |
| R6 | Im Spiel: Sichtschatten liegt über verdecktem Gelände; verdeckte Gegner sind unsichtbar. | E2E |
| R7 | Bestehende Abläufe (Start, Kampf, Quests, Karte) funktionieren weiter. | E2E (alle) |

## Ergebnis

Erreicht am 2026-10-31:
- Unit-Tests: `tests/unit/m24.test.ts` (R1–R5) und alle bisherigen Unit-Tests.
- E2E: `tests/e2e/m24-terrain.spec.ts` (R6) und alle bisherigen Akzeptanztests (R7).

Messwerte (Seed `test`):
- Hügelland ≈ 20–25 % des Landes, Seen ≈ 3 %.
- Geländeraster ≈ 3,5 ms je Chunk im Worker.
- Sicht und Fog ≈ 1–3 ms je Kachelschritt im Haupt-Thread.

## Ideen für später

- Wasserfälle an Klippen.
- Kletterausrüstung (Seil, Haken).
- Höhenvorteil im Kampf.
- Höhlen am Fuß von Klippen.
- Höhenlinien auf der Karte.
