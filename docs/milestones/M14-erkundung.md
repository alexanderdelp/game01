# M14 – Erkundung & Herausforderung (zusätzlicher Meilenstein)

## Warum?

Nach M13 blieb Zeit bis 06:00. Die Wünsche „Erkundung: Geheimnisse und interessante Dinge finden“ und
„Kampf: einfache, spaßige Action“ profitieren am meisten von lohnenden Zielen in der Wildnis.

## Design

- **Elite-Gegner:** 6 % aller Gegner (nicht in der Sicherheitszone) sind Elite: 1,4-fache Größe, goldener Schimmer,
  +2 Stufen, doppelte LP, bessere Beute (sicher ein Gegenstand, mind. „selten“), dreifache EP.
- **Ruinen (Wahrzeichen):** 3 je Reich, abseits der Orte. Verfallene Tech-Türme mit Kristallen – Fantasy trifft Cyberpunk.
  Auf der Karte als Symbol, sobald man sie gesehen hat. In jeder Ruine wacht ein **Wächter** (Elite) und steht eine
  **Ruinentruhe** mit garantiertem seltenem oder epischem Gegenstand. Geöffnet bleibt sie geöffnet (Weltzustand, geteilt).

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Elite-Gegner: seed-basiert ~6 %, stärker, bessere Beute. | Unit |
| R2 | Ruinen: seed-basiert, auf begehbarem Land, abseits der Orte, mit Wächter und Ruinentruhe. | Unit |
| R3 | Ruinentruhe gibt sicher einen seltenen/epischen Gegenstand und bleibt offen. | E2E |

## Ergebnis

Erreicht am 2026-10-31. R1, R2 per Unit-Test (`tests/unit/m14.test.ts`), R3 per Akzeptanztest (`tests/e2e/m14-explore.spec.ts`).

- Ruinentruhen sind versiegelt, solange der Wächter in der Nähe lebt; Ruinen erscheinen nach dem Entdecken auf der Karte
  (türkis = Schatz noch da, grau = geplündert – auch durch Mitspieler).
- Elite-Gegner: 1,4-fache Größe, goldener Schatten und goldene Lebensleiste, +2 Stufen, doppelte LP, dreifache EP,
  sicher ein mindestens seltener Gegenstand.
