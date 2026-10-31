# M20 – Fog of War (Nutzerwunsch)

## Warum?

Feedback zu M19: Die Welt soll man erkunden können – ist sie von Anfang an auf Karte und Minimap sichtbar, geht
das nicht (Wunsch „Erkundung“).

## Design

- Erkundet wird in Zellen zu 16 × 16 Kacheln (= 1 Pixel der Übersichtskarte). Beim Laufen deckt der Held alles im
  Umkreis von 20 Kacheln auf.
- Gespeichert pro Welt im Browser (`fog:<seed>`, ~44 KB Base64); gehört dem Spieler, nicht dem geteilten Weltzustand.
- Karte und Minimap: Unerkundetes dunkel, Rand zum Erkundeten halbtransparent. Orte, Reichsnamen und Karawanen
  erscheinen erst, wenn ihr Gebiet erkundet ist. Questgebiete und der Pfeil zum nächsten Ort bleiben als Hinweis
  („Gerüchte“). Bekannte Wegsteine (z. B. aus älteren Spielständen) decken ihre Umgebung auf.
- Karte zeigt den erkundeten Anteil in Prozent.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Aufdecken im Umkreis, nur einmal je Zelle, Speichern/Laden robust. | Unit |
| R2 | Anfangs nur die Umgebung bekannt; neue Gebiete werden beim Betreten bekannt und bleiben es nach dem Neuladen. | E2E |
| R3 | Karte und Minimap verdecken Unerkundetes. | Screenshot |

## Ergebnis

Erreicht am 2026-10-31: `tests/unit/m20.test.ts`, `tests/e2e/m20-fog.spec.ts`. Reine Logik in `src/world/fog.ts`.
