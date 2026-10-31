# Vorschlag: Gelände mit Höhenstufen, Sicht und Klettern (2026-10-31)

Status: **Entschieden und umgesetzt am 2026-10-31 als M24** (`docs/milestones/M24-hoehen.md`).
Idee des Nutzers: Gelände mit Höhenunterschieden; zu große Unterschiede nehmen die Sicht. Wasser sammelt sich in
Senken. Berge sind besteigbar, solange der Unterschied zwischen benachbarten Feldern klein genug ist.

Bilder (Prototyp, gleicher Ausschnitt; roter Punkt = Held):
`docs/vorschlag-hoehen/vorher.png`, `nachher.png`, `klippe-detail.png`. Sie sind erzeugt mit
`tools/prototype-hoehen.ts`. Die Grafik ist ein grober Entwurf: Klippen bekommen später richtige Felsstrukturen und
Kanten.

## Heute

Die Welt hat zwar eine Höhe, die aber nur das Biom (Gebirge, Gipfel) und eine leichte Schattierung bestimmt.
Spielerisch ist alles flach.

## Vorschlag

1. **Höhenstufen:** Jede Kachel liegt auf einer ganzzahligen Stufe. Zur großen Landschaft kommt örtliches Relief
   dazu:
   - Hügel und Tafelberge mit flachen Kuppen
   - Senken
   - sanfte Wellen

   Dadurch entstehen Plateaus statt einer gleichmäßigen Schräge.
2. **Begehbarkeit:**
   - **1 Stufe** Unterschied ist eine **Böschung** (grasige Kante), die man begehen kann.
   - **2 und mehr Stufen** sind eine **Klippe** (Felswand) und versperren den Weg.

   Berge besteigt man also über Hänge und Böschungen und sucht sich den Weg zwischen Klippen hindurch.
   Pfade und Straßen bekommen Rampen oder Treppen. Siedlungen liegen auf ebenen Plateaus.
3. **Wasser in Senken:** Abflusslose Senken füllen sich zu Teichen und Seen. Flüsse fließen nur bergab. An
   Klippen entstehen Wasserfälle, Flüsse schneiden Schluchten.
4. **Sicht:**
   - Was hinter einem höheren Grat liegt, ist **abgedunkelt und entsättigt**.
   - Gegner und NPCs dort sind **unsichtbar**, was Überraschung und Hinterhalte ermöglicht.
   - Wer oben steht, sieht weit. Das Aufdecken der Karte (Fog of War) folgt ebenfalls der Sichtlinie: **Gipfel und
     Aussichtspunkte decken große Gebiete auf**, ein Anreiz zum Besteigen.
5. **Darstellung:**
   - Klippen erscheinen als Felswand unter der Oberkante, in der Schrägsicht wie bei Secret of Mana.
   - Böschungen sind dunkle Grasränder; Oberkanten werden leicht aufgehellt.
   - Die Figur auf dem Plateau steht über der Wand, die Figur davor verdeckt die Wand.

## Folgen und Aufwand

- **Neue Weltversion 3:** Gespeicherte Positionen und der Fog of War einer Welt werden zurückgesetzt. Held,
  Ausrüstung und Ansehen bleiben.
- **Neue Regeln für Bewegung:**
  - Kollision an Klippenkanten.
  - Gegner und NPCs laufen nicht durch Wände.
  - Die Arena bleibt flach.
- **Anpassungen an Wegen, Siedlungen und Karte:**
  - Straßen und Flüsse werden über Stufen geführt.
  - Siedlungen werden eingeebnet.
  - Die Karte zeigt Höhenlinien.
- **Umfang:** etwa so groß wie M19 und M20 zusammen (2–3 Meilensteine). Ich würde es aufteilen:
  1. Stufen und Darstellung
  2. Begehbarkeit
  3. Wasser
  4. Sicht

## Ideen für später

- **Kletterausrüstung** (Seil, Haken) als Fortschritt, mit der man einzelne Klippen überwinden kann.
- **Höhenvorteil im Kampf**, z. B. weiterer Splitterblitz von oben.
- **Geheimnisse** in Höhlen am Fuß von Klippen oder auf schwer erreichbaren Plateaus.

## Offene Entscheidungen

1. **Grundsätzlich so umsetzen?** (Ja / anders / nicht)
2. **Wie stark soll die Sicht leiden?**
   - (a) nur Abdunkeln
   - (b) zusätzlich unsichtbare Gegner und NPCs dahinter
   - (c) zusätzlich Fog of War über die Sichtlinie (Empfehlung)
3. **Wie zerklüftet?** Prototyp: eher viele Hügel. Alternative: überwiegend sanft, Klippen vor allem in Bergland
   und Gebirge.

## Entscheidungen des Nutzers (2026-10-31)

| Punkt | Entscheidung |
|---|---|
| Umsetzen | Ja. |
| Sicht | Alle drei: abdunkeln, Gegner/NPCs dahinter unsichtbar, Fog of War nach Sichtlinie. |
| Zerklüftung | Je Biom: **Gebirge** mit Klippen, **Hügellandschaft** mit sanften Hängen. |
| Schrägen | Ja: Hänge steigen stufenlos leicht oder steil an, statt nur Stufen von Kachel zu Kachel. |
| Spielstände | Werden zurückgesetzt (Tech-Demo). |
