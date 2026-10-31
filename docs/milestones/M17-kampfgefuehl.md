# M17 – Kampfgefühl (aus Feedback-Runde 1)

## Warum?

Spieltest (`docs/FEEDBACK-2026-10-31.md`, Punkt 4): Der Kampf fühlt sich hakelig an. Leitbild des Nutzers ist die
**Unmittelbarkeit von Super Mario World**: Die Figur tut genau, was man gerade drückt.

## Befund (vorher)

- Die Figur stand während des ganzen Hiebs still (6 Bilder à 16/s = 375 ms) und danach noch 120 ms Abklingzeit
  → fast eine halbe Sekunde ohne Kontrolle je Hieb.
- Der Treffer kam erst nach 140 ms.
- Nach einem erlittenen Treffer 150 ms Kontrollverlust (Rückstoß).
- Die Laufbewegung selbst hat keine Beschleunigung, sie reagiert schon sofort.

## Design

- **Laufen während des Hiebs** mit 85 % Tempo. Blickrichtung und Hieb-Richtung bleiben, wie sie beim Drücken waren
  (kein automatisches Drehen zum Gegner).
- **Schnellerer Hieb:** 24 Bilder/s (250 ms), Treffer nach 60 ms, Abklingzeit 40 ms → ein Hieb-Zyklus ≈ 0,29 s.
- **Kein Vormerken:** Ein Tastendruck während des Hiebs verfällt.
- **Kürzerer Kontrollverlust** nach Treffern: 100 ms.
- Zauber: Animation 16 statt 12 Bilder/s (Wirken bleibt ein bewusster Moment im Stand).
- Alle Werte stehen gesammelt in `PLAYER_SWING` (`src/combat/combat.ts`), damit Feintuning leicht ist.
- **Kampf-Arena** (`?arena=1`) erst, falls es sich danach noch hakelig anfühlt (Nutzerentscheidung).

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Hieb-Zyklus < 0,35 s, Treffer in der ersten Hälfte, Kontrollverlust ≤ 0,1 s; Animation passt zu den Werten. | Unit |
| R2 | Die Figur bewegt sich während des Hiebs weiter. | E2E |
| R3 | Kein Vormerken; nach dem Hieb geht der nächste sofort. | E2E |

## Ergebnis

Erreicht am 2026-10-31. R1 per Unit-Test (`tests/unit/m17.test.ts`), R2–R3 per Akzeptanztest
(`tests/e2e/m17-feel.spec.ts`).

- Erkenntnis: Der Testbrowser (headless) läuft stark gedrosselt (ein Hieb dauert dort > 1 s Echtzeit). Akzeptanztests
  prüfen Abläufe deshalb am Spielzustand (`swinging`), nicht an der Uhr; die Zeiten sichert der Unit-Test.
- Ob das Gefühl jetzt stimmt, muss ein Spieltest zeigen → Frage an den Nutzer per Telegram.
