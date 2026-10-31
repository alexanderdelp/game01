# M27 – Fester Sichtausschnitt (Nutzerwunsch)

## Warum?

Feedback 2026-10-31: Zoomt man im Browser heraus, endet der Sichtschatten nach einer gewissen Entfernung – dahinter
ist wieder alles sichtbar. Außerdem soll niemand durch Auflösung, Fenstergröße oder Zoom weiter sehen können.

## Design

Wie andere Spiele: Klassische Konsolenspiele (Secret of Mana) haben eine feste Auflösung, moderne 2D-Spiele begrenzen
den sichtbaren Weltausschnitt und skalieren größere Fenster hoch statt mehr zu zeigen.

- **Fester Ausschnitt:** höchstens **32 × 18 Kacheln** (lange × kurze Bildschirmseite; Hochformat gedreht). Die Kamera
  zoomt mindestens so weit hinein, dass das nie überschritten wird – **ganzzahlig**, damit Pixel-Art scharf bleibt
  (dadurch ist der Ausschnitt je nach Fenster auch etwas kleiner, aber nie größer). Hineinzoomen bleibt möglich.
- Fenstergröße und Browser-Zoom werden laufend berücksichtigt (Resize).
- **Sichtschatten:** Das Sichtraster (Radius 24 Kacheln) deckt den ganzen Ausschnitt ab; außerhalb gilt alles als
  verdeckt (vorher: sichtbar).

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Kein Fenster zeigt mehr als 32 × 18 Kacheln, ganzzahliger Zoom. | Unit `m27.test.ts` |
| R2 | Großes Fenster (Browser herausgezoomt): Sichtschatten reicht bis an den Bildrand. | Screenshot |
| R3 | Bisherige Tests grün. | Unit + E2E |

## Ergebnis

Erreicht am 2026-10-31: `src/game/view.ts` (`minZoom`, `effectiveZoom`), angewendet in `WorldScene` (auch bei
Größenänderung); `WorldSight.seesPx` außerhalb des Rasters = verdeckt. Die Kampf-Arena ist bewusst ausgenommen
(Testwerkzeug).
