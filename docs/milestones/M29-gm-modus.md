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

**R3 (Modul Oberfläche, 2026-11-01):**

- **Karte** (`src/ui/WorldMap.ts`): Im GM-Modus ohne Nebel, alle Reiche, Orte, Ruinen, Obelisken und Karawanen
  (auch unentdeckt). **Klick ohne Ziehen** (Zeigerweg ≤ 6 px, innerhalb des Kartenfensters) → `ws.gmTeleport(tx, ty)`,
  Karte schließt sich; Ziehen verschiebt weiter. Schnellreise-Kreise sind im GM-Modus ausgeblendet (Klick teleportiert
  ohnehin). Infozeile „Spielleiter: Klick = Teleport …“. Minimap ebenfalls ohne Nebel. Der Fog of War des Spielers
  wird nur anders gezeichnet, nicht verändert. Beim Umschalten wird eine offene Karte neu gezeichnet.
- **HUD/Menü** (`src/scenes/UIScene.ts`): rotes „GM“-Abzeichen rechts neben der HUD-Box (oben Mitte/rechts liegen
  Minimap und Handy-Knöpfe), über der Karte sichtbar. Menüeintrag „Spielleiter-Modus: an/aus“ nur mit `?gm=1`,
  als letzter Eintrag (`menu-12`), damit die Nummern der übrigen Einträge gleich bleiben.
- Annahme: Bei Zoom 1 entspricht ein Bildschirmpixel ~13 Kacheln; für genaues Teleportieren zoomt man hinein
  (Mausrad zoomt zur Mausposition).
- **Test-Schnittstelle:** `g.mapTileToScreen(tx, ty)` (Kachel → Bildschirmpunkt der offenen Karte), `g.mapFog`,
  `g.gmBadge`.
- **Nachweis:** E2E `oberflaeche.spec.ts` „M29: Spielleiter-Karte …“ (Menü schaltet, Abzeichen, Karte ohne Nebel,
  Ziehen teleportiert nicht, Zoomen per Rad auf fernes Ziel, Klick → Spieler ±2 Kacheln dort, Karte zu, Fog dort
  weiter unbekannt). Bild: `screenshots/m29-gm-karte.png`.
