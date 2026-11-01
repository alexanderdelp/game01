# M29 – Spielleiter-Modus (Nutzerwunsch)

## Warum?

Der Nutzer will die große Welt prüfen können: über die ganze Karte fliegen und sich über die Karte an jeden
beliebigen Ort teleportieren – ohne Spielfortschritt, Fog of War oder den geteilten Weltzustand zu verändern.

## Design

- **Freischalten:** nur mit `?gm=1` in der URL (versteckt, kein versehentliches Benutzen in geteilten Welten).
  Ein-/Ausschalten mit **F2**, am Handy über einen Menüeintrag (nur sichtbar mit `?gm=1`).
- **Fliegen:** keine Kollision (Wasser, Klippen, Gebäude), Tempo ×3 (Shift ×1,6 dazu), unverwundbar.
- **Ohne Spuren:** im GM-Modus kein Aufdecken des Fog of War, keine Entdeckungen/Wegsteine, keine Quest-Fortschritte
  durch Orte, Position wird nicht gespeichert. Sichtschatten aus (man sieht alles).
- **Beim Ausschalten:** steht man auf Unbegehbarem, landet man auf der nächsten begehbaren Kachel.
- **Karte im GM-Modus:** ganze Welt ohne Nebel mit allen Orten/Ruinen; **Klick auf einen beliebigen Punkt teleportiert**
  dorthin (Karte schließt sich). Im HUD ein deutliches „GM“-Abzeichen.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Ohne `?gm=1` ist der Modus nicht erreichbar. | E2E |
| R2 | Im GM-Modus über Wasser fliegen; nach dem Ausschalten auf begehbarem Boden. | E2E |
| R3 | Karte ohne Nebel; Klick auf einen Punkt teleportiert dorthin. | E2E |
| R4 | Kein Fog-Aufdecken, keine Entdeckung, kein Schaden im GM-Modus. | E2E |

## Ergebnis

_offen_
