# M22 – Zoombare Weltkarte (Nutzerwunsch)

## Warum?

Mit der großen Welt (M19, 8192 × 8192 Kacheln) zeigt die Gesamtkarte nur noch grobe Flecken; mit dem Fog of War
(M20) ist die erkundete Umgebung darauf winzig. Zum Erkunden und Planen braucht es eine Karte, die man
heranzoomen und verschieben kann.

## Design

- Zoomstufen 1×, 2×, 4×, 8×, 16× – per Mausrad (zur Mausposition hin), Tasten +/−, Knöpfe „+“, „−“, „◎“ (zum Helden).
- Verschieben durch Ziehen (Maus oder Finger); beim Öffnen zentriert auf den Helden, die Zoomstufe bleibt.
- **Feiner Ausschnitt ab 4×:** Der Karten-Worker berechnet den sichtbaren Bereich (1,6-fach) in feinerer Auflösung
  (bis 2 Kacheln je Pixel) – Flüsse, Küsten und Pfadgrenzen werden sichtbar. Nur neu, wenn der vorhandene nicht reicht.
- Fog of War, Orte, Ruinen, Obelisken, Questziele, Karawanen und Schnellreise folgen Zoom und Ausschnitt. Der Nebel
  ist weich gefiltert. Bei offener Karte zoomt die Welt nicht mit; die Karte liegt über Hinweis-Bannern.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Zoomen per Knopf, Taste, Mausrad; Verschieben per Ziehen; Welt-Zoom bleibt unberührt. | E2E |
| R2 | Ab 4× feiner Ausschnitt, bei 16× mit 2 Kacheln je Pixel. | E2E |
| R3 | Schnellreise per Klick funktioniert weiter. | E2E (m9) |

## Ergebnis

Erreicht am 2026-10-31: `tests/e2e/m22-map.spec.ts`, `tests/e2e/m9-persist.spec.ts`.
