# M6 – Charakter-Gestaltungs-Mechaniken (Volk, Aussehen, …)

## Ziel

Beim ersten Betreten einer Welt erschafft man seinen eigenen Helden: Volk, Körper, Haut, Haare, Kleidung, Name.
Die Wahl ist sichtbar und hat (kleine) spielerische Auswirkungen. Später lässt sich das Aussehen jederzeit ändern.

## Design

### Völker
| Volk | Aussehen | Bonus | Idee |
|---|---|---|---|
| Mensch | menschlicher Kopf, natürliche Hauttöne | +10 % Erfahrung | anpassungsfähig |
| Elf | Elfenohren, natürliche und blasse Töne | +8 % Tempo | leichtfüßig, magienah |
| Ork | Ork-Kopf mit Hauern, Grün-/Brauntöne | +20 LP | zäh |
| Synth | menschlich, Haut in Chrom-/Neon-Tönen | +3 Verteidigung | halb Mensch, halb Maschine (Cyberpunk) |

### Gestaltbar
Körperbau (männlich/weiblich), Hautton (je Volk), Frisur (6 + Glatze), Haarfarbe (12), Farbe von Oberteil, Hose und Stiefeln,
Name (Eingabefeld + Würfel für Zufallsnamen). Button „Zufällig“ würfelt alles.

### Ablauf
- **Neue Welt ohne Held** → Erschaffungsbildschirm vor dem Spiel. Vorschau: große, laufende Figur, die sich dreht.
- **Später:** Im Heldenfenster „Aussehen ändern“ öffnet denselben Bildschirm. Fortschritt bleibt erhalten.
- Gespeichert wird im Heldenstand der Welt (Volk, Name, Aussehen). Rüstung bestimmt weiterhin das Oberteil.
- Name erscheint im HUD und im Heldenfenster.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Völker setzen die richtigen LPC-Ebenen (Ork-Kopf, Elfenohren) und Umfärbung (auch von nicht-heller Basis). | Unit |
| R2 | Volksboni wirken auf die Endwerte bzw. Erfahrung. | Unit |
| R3 | Neue Welt startet mit dem Erschaffungsbildschirm; Auswahl ändert die Vorschau. | E2E + Screenshot |
| R4 | Bestätigen startet das Spiel mit gewähltem Namen/Volk/Aussehen; nach Neuladen direkt ins Spiel. | E2E |
| R5 | Aussehen später änderbar, ohne Fortschritt zu verlieren. | E2E |
| R6 | Bedienbar mit Maus, Tastatur (Eingabe Name) und Touch. | E2E |

## Ergebnis

Erreicht am 2026-10-30. R1, R2 per Unit-Test (`tests/unit/m6.test.ts`), R3–R6 per Akzeptanztest (`tests/e2e/m6-create.spec.ts`),
Vorschau per Screenshot.

Anpassungen während der Umsetzung:
- LPC-Ebenen können eine eigene Basispalette haben (Ork-Köpfe sind grün gezeichnet).
- Szenen-Neustarts (Welt ↔ Erschaffung) erforderten saubere Aufräumlogik: UI-Verweise werden beim Start zurückgesetzt,
  globale Zuhörer (Resize, Szenen-Events) beim Beenden entfernt.
- Namenseingabe als HTML-Eingabefeld über dem Canvas (Tastatur/Handy-Tastatur funktionieren nativ).
