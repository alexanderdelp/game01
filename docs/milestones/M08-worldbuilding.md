# M8 – World Building & Story-Mechaniken (seed-basiert)

## Ziel

Aus dem Seed entsteht nicht nur Landschaft, sondern eine Welt mit Geschichte: Reiche mit Fraktionen, Städte und Dörfer,
Geheimnisse in der Wildnis und eine Chronik, die man Stück für Stück entdeckt.

## Design

### Reiche & Fraktionen
- 6 Reiche je Welt (Voronoi-Regionen auf Land, Grenzen leicht verwirbelt). Jedes Reich hat einen Namen, eine Farbe und
  eine **Fraktion**: *Magierzirkel* (Fantasy), *Technokratie* (Cyberpunk), *Klan* (Wildnis), *Freie Händler* (gemischt),
  *Orden des Lichts* (Glaube). Fraktion bestimmt den Baustil der Siedlungen.
- Betritt man ein neues Reich, erscheint ein Banner („Technokratie Varn-Kor“). Die Weltkarte zeigt Grenzen und Namen.

### Siedlungen
- Je Reich eine **Hauptstadt** und 2–4 **Dörfer**, auf begehbarem, flachem Land. Name aus Silben.
- Gebäude (prozedural): Fachwerkhaus, Steinturm, Neon-Haus, Marktstand – je nach Fraktion gemischt.
  Gepflasterter Platz in der Mitte, keine Bäume im Ort, **keine Gegner** im Umkreis (sicherer Hafen).
- Bewohner (Dorfbewohner) und ein **Händler** am Platz: Heiltrank kaufen (10 ◆), gewöhnliche Gegenstände verkaufen.

### Geheimnisse in der Wildnis
- **Truhen** (Beute), **Schreine** (volle Heilung + kurzzeitig +25 % Angriff), seed-basiert verstreut.
- **Obelisken** (8 je Welt): je ein Fragment der **Chronik** der Welt.

### Story: die Chronik
- Seed-basierte Weltgeschichte in 8 Fragmenten: Gründung, ein uraltes Ereignis (z. B. „der Sternfall“),
  ein Artefakt, der Konflikt zwischen den Fraktionen, eine Bedrohung, die zurückkehrt …
- Fragmente werden an Obelisken gefunden (+EP). Die **Chronik** (B, Touch: „Chronik“) zeigt Gefundenes in der richtigen
  Reihenfolge. Alle 8 → Titel „Chronist“ und große Belohnung.
- NPCs erwähnen ihr Reich, die Hauptstadt und Gerüchte über die Chronik.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Reiche, Siedlungen, Geheimnisse und Chronik sind deterministisch aus dem Seed; Siedlungen/Obelisken auf begehbarem Land. | Unit |
| R2 | Jede Kachel gehört zu einem Reich; jedes Reich hat Hauptstadt und Fraktion. | Unit |
| R3 | Siedlungen: Gebäude, Platz, keine Bäume, keine Gegner, Händler handelt. | Unit + E2E |
| R4 | Truhen, Schreine, Obelisken lassen sich benutzen; geöffnete Truhen bleiben offen; Chronik füllt sich. | E2E |
| R5 | Banner beim Reichswechsel, Karte mit Reichen und Orten. | Screenshot |

## Ergebnis

Erreicht am 2026-10-31. R1–R3 per Unit-Test (`tests/unit/m8.test.ts`), R3, R4 per Akzeptanztest (`tests/e2e/m8-world.spec.ts`),
R5 per Screenshot.

Anpassungen während der Umsetzung:
- `world/meta.ts` bündelt Reiche, Siedlungen, Geheimnisse und Chronik; `WorldGen.meta` erzeugt sie lazy (auch im Worker identisch).
- Gebäude und Geheimnisse sind Dekorationen mit eigener Kollisionsbox; Pflaster ist ein Pseudo-Biom nur im Renderer.
- Händlerin bietet Heiltrank-Kauf und Sammelverkauf aller gewöhnlichen Gegenstände (casual statt Einzelhandel).
- Geöffnete Truhen und gelesene Fragmente werden schon jetzt im Heldenstand gespeichert (Grundlage für M9).
- Dialoge unterstützen beliebig viele Auswahlmöglichkeiten (Tasten 1–3 bzw. Buttons).
